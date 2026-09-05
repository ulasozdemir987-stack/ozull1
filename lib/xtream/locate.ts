import { buildStreamUrl } from "./urls";
import type { XtreamCredentials, StreamKind } from "./types";

const UA = "VLC/3.0.20 LibVLC/3.0.20";

export interface Located {
  url: string;
  ext: string;
  contentType: string;
}

/**
 * VOD and series files on this IPTV provider are stored as MKV.
 * Do not probe extensions with Range requests: a number of Xtream servers
 * reject Range/partial GETs even though the actual media URL is valid.
 * FFprobe/FFmpeg will perform the real validation when playback starts.
 */
export async function locatePlayable(
  creds: XtreamCredentials,
  type: StreamKind,
  id: string,
  preferred: string,
): Promise<Located | null> {
  if (type === "movie" || type === "series") {
    const url = buildStreamUrl(creds, type, id, "mkv");
    console.log(`[LOCATE] ${type}/${id} using fixed MKV URL`);
    return { url, ext: "mkv", contentType: "video/x-matroska" };
  }

  // Live streams retain the old probing behavior as a safe fallback.
  const url = buildStreamUrl(creds, type, id, preferred || "ts");
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": UA, Accept: "*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(4500),
    });
    const ct = res.headers.get("content-type") || "";
    res.body?.cancel().catch(() => {});
    if (res.ok && !/text\/html|application\/json/i.test(ct)) {
      return { url, ext: preferred || "ts", contentType: ct };
    }
  } catch {
    // handled by returning null
  }
  return null;
}
