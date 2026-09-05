// Picks the right playback strategy for a stream and wires it to a <video>.
// Canlı/TS → mpegts.js · HLS (.m3u8) → hls.js · mp4 → native · mkv/other → native (may fail).

export type EngineKind = "mpegts" | "hls" | "native" | "unsupported";

export interface EngineHandle {
  kind: EngineKind;
  destroy: () => void;
}

const NATIVE_OK = ["mp4", "m4v", "mov", "webm", "ogg"];
const RISKY = ["mkv", "avi", "wmv", "flv", "ts"]; // browser-native support is unreliable

export function pickEngine(url: string, ext: string, isCanlı: boolean): EngineKind {
  const u = url.toLowerCase();
  if (u.includes("/api/hls") || /\.m3u8(\?|$)/.test(u)) return "hls";
  const e = ext.toLowerCase().replace(/^\./, "");
  if (e === "m3u8") return "hls";
  if (isCanlı || e === "ts") return "mpegts";
  if (NATIVE_OK.includes(e)) return "native";
  if (RISKY.includes(e)) return "native"; // attempt; onError surfaces a fallback
  return "native";
}

export async function attach(
  video: HTMLVideoElement,
  opts: { url: string; ext: string; isCanlı: boolean },
): Promise<EngineHandle> {
  const kind = pickEngine(opts.url, opts.ext, opts.isCanlı);

  if (kind === "hls") {
    const Hls = (await import("hls.js")).default;
    if (Hls.isSupported()) {
      // Buffer + retry tuning for smooth, self-healing live playback.
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false, // favour stability over latency for IPTV
        backBufferLength: 30,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        manifestLoadingMaxRetry: 4,
        levelLoadingMaxRetry: 6,
        fragLoadingMaxRetry: 8,
        fragLoadingRetryDelay: 500,
        ...(opts.isCanlı ? { liveSyncDurationCount: 3, liveMaxLatencyDurationCount: 10 } : {}),
      });

      // auto-recover instead of stalling on transient network/media errors
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else hls.destroy();
      });

      hls.loadSource(opts.url);
      hls.attachMedia(video);
      return { kind: "hls", destroy: () => hls.destroy() };
    }
    if (video.canOynatType("application/vnd.apple.mpegurl")) {
      video.src = opts.url; // Safari native HLS
      return { kind: "native", destroy: () => void (video.src = "") };
    }
    video.src = opts.url;
    return { kind: "native", destroy: () => void (video.src = "") };
  }

  if (kind === "mpegts") {
    const mpegts = (await import("mpegts.js")).default;
    if (mpegts.getFeatureList().mseCanlıOynatback || mpegts.isSupported()) {
      const player = mpegts.createOynater(
        { type: "mpegts", isCanlı: opts.isCanlı, url: opts.url },
        {
          enableStashBuffer: false, // start playing ASAP, don't pre-buffer
          stashInitialSize: 128,
          lazyLoad: false,
          liveBufferLatencyChasing: opts.isCanlı,
          liveBufferLatencyChasingOnPaused: false,
          liveBufferLatencyMaxLatency: 3.0,
          liveBufferLatencyMinRemain: 0.5,
          autoCleanupSourceBuffer: true,
        },
      );
      player.attachMediaElement(video);
      player.load();
      return {
        kind: "mpegts",
        destroy: () => {
          try {
            player.destroy();
          } catch {}
        },
      };
    }
    // fall through to native if MSE unavailable
    video.src = opts.url;
    return { kind: "native", destroy: () => void (video.src = "") };
  }

  // native
  video.src = opts.url;
  return { kind: "native", destroy: () => void (video.src = "") };
}
