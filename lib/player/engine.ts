// Playback engine selection and track control for native, HLS and MPEG-TS.
export type EngineKind = "mpegts" | "hls" | "native" | "unsupported";

export type PlayerTrack = { index: number; label: string; lang?: string };

export interface EngineHandle {
  kind: EngineKind;
  destroy: () => void;
  getAudioTracks?: () => PlayerTrack[];
  setAudioTrack?: (index: number) => void;
  getSubtitleTracks?: () => PlayerTrack[];
  setSubtitleTrack?: (index: number) => void;
}

const NATIVE_OK = ["mp4", "m4v", "mov", "webm", "ogg"];
const RISKY = ["mkv", "avi", "wmv", "flv", "ts"];

export function pickEngine(url: string, ext: string, isLive: boolean): EngineKind {
  const u = url.toLowerCase();
  if (u.includes("/api/hls") || u.includes("/api/transcode-hls") || /\.m3u8(\?|$)/.test(u)) return "hls";
  const e = ext.toLowerCase().replace(/^\./, "");
  if (e === "m3u8") return "hls";
  if (isLive || e === "ts") return "mpegts";
  if (NATIVE_OK.includes(e)) return "native";
  if (RISKY.includes(e)) return "native";
  return "native";
}

export async function attach(
  video: HTMLVideoElement,
  opts: {
    url: string;
    ext: string;
    isLive: boolean;
    onTracks?: (tracks: { audio: PlayerTrack[]; subtitles: PlayerTrack[] }) => void;
  },
): Promise<EngineHandle> {
  const kind = pickEngine(opts.url, opts.ext, opts.isLive);

  if (kind === "hls") {
    const Hls = (await import("hls.js")).default;
    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        manifestLoadingMaxRetry: 4,
        levelLoadingMaxRetry: 6,
        fragLoadingMaxRetry: 8,
        fragLoadingRetryDelay: 500,
        ...(opts.isLive ? { liveSyncDurationCount: 3, liveMaxLatencyDurationCount: 10 } : {}),
      });

      const emitTracks = () => {
        const audio = (hls.audioTracks || []).map((t: any, index: number) => ({
          index,
          label: t.name || t.lang || `Audio ${index + 1}`,
          lang: t.lang || undefined,
        }));
        const subtitles = (hls.subtitleTracks || []).map((t: any, index: number) => ({
          index,
          label: t.name || t.lang || `Subtitle ${index + 1}`,
          lang: t.lang || undefined,
        }));
        opts.onTracks?.({ audio, subtitles });
      };

      hls.on(Hls.Events.MANIFEST_PARSED, emitTracks);
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, emitTracks);
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, emitTracks);

      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else hls.destroy();
      });

      hls.loadSource(opts.url);
      hls.attachMedia(video);
      return {
        kind: "hls",
        getAudioTracks: () => (hls.audioTracks || []).map((t: any, index: number) => ({ index, label: t.name || t.lang || `Audio ${index + 1}`, lang: t.lang || undefined })),
        setAudioTrack: (index: number) => { hls.audioTrack = index; },
        getSubtitleTracks: () => (hls.subtitleTracks || []).map((t: any, index: number) => ({ index, label: t.name || t.lang || `Subtitle ${index + 1}`, lang: t.lang || undefined })),
        setSubtitleTrack: (index: number) => { hls.subtitleTrack = index; },
        destroy: () => hls.destroy(),
      };
    }
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = opts.url;
      return { kind: "native", destroy: () => void (video.src = "") };
    }
    video.src = opts.url;
    return { kind: "native", destroy: () => void (video.src = "") };
  }

  if (kind === "mpegts") {
    const mpegts = (await import("mpegts.js")).default;
    if (mpegts.getFeatureList().mseLivePlayback || mpegts.isSupported()) {
      const player = mpegts.createPlayer(
        { type: "mpegts", isLive: opts.isLive, url: opts.url },
        {
          enableStashBuffer: false,
          stashInitialSize: 128,
          lazyLoad: false,
          liveBufferLatencyChasing: opts.isLive,
          liveBufferLatencyChasingOnPaused: false,
          liveBufferLatencyMaxLatency: 3.0,
          liveBufferLatencyMinRemain: 0.5,
          autoCleanupSourceBuffer: true,
        },
      );
      player.attachMediaElement(video);
      player.load();
      return { kind: "mpegts", destroy: () => { try { player.destroy(); } catch {} } };
    }
    video.src = opts.url;
    return { kind: "native", destroy: () => void (video.src = "") };
  }

  video.src = opts.url;
  return { kind: "native", destroy: () => void (video.src = "") };
}
