import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { requireSession } from "@/lib/session";
import { locatePlayable } from "@/lib/xtream/locate";
import type { StreamKind } from "@/lib/xtream/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA = "VLC/3.0.20 LibVLC/3.0.20";
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";
const ROOT = path.join(os.tmpdir(), "lumen-hls");
const TTL = 2 * 60 * 60 * 1000;

type ProbeStream = {
  index: number;
  codec_type: "video" | "audio" | "subtitle" | string;
  codec_name?: string;
  duration?: string;
  tags?: { language?: string; title?: string; [k: string]: unknown };
};

type Session = {
  dir: string;
  proc: ChildProcessByStdio<null, Readable, Readable>;
  createdAt: number;
};

const sessions = new Map<string, Session>();

function token() { return crypto.randomBytes(18).toString("base64url"); }
function safeLang(v?: string) { return (v || "und").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 16) || "und"; }
function labelFor(s: ProbeStream, fallback: string) {
  return String(s.tags?.title || s.tags?.language || fallback).replace(/[\r\n,]/g, " ").slice(0, 80);
}
function run(cmd: string, args: string[], timeout = 30000) {
  return new Promise<{ code: number; stderr: string }>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    p.stderr.on("data", d => { stderr = (stderr + String(d)).slice(-10000); });
    const timer = setTimeout(() => { try { p.kill("SIGKILL"); } catch {} reject(new Error(`Process timed out: ${cmd}`)); }, timeout);
    p.on("error", reject);
    p.on("close", code => { clearTimeout(timer); resolve({ code: code ?? -1, stderr }); });
  });
}

async function probe(input: string): Promise<ProbeStream[]> {
  const r = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const p = spawn(FFPROBE, ["-v", "error", "-user_agent", UA, "-show_entries", "stream=index,codec_type,codec_name,duration:stream_tags=language,title", "-of", "json", input], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    p.stdout.on("data", d => { stdout += String(d); });
    p.stderr.on("data", d => { stderr += String(d); });
    p.on("error", reject);
    p.on("close", code => resolve({ code: code ?? -1, stdout, stderr }));
  });
  if (r.code !== 0) throw new Error(r.stderr || `ffprobe exited ${r.code}`);
  return (JSON.parse(r.stdout).streams || []) as ProbeStream[];
}

function cleanupExpired() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > TTL) {
      try { s.proc.kill("SIGKILL"); } catch {}
      sessions.delete(id);
      rm(s.dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function waitForFile(file: string, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try { await stat(file); return true; } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
  return false;
}

async function extractSubtitle(input: string, stream: ProbeStream, out: string) {
  const r = await run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-user_agent", UA, "-i", input, "-map", `0:${stream.index}`, "-c:s", "webvtt", "-f", "webvtt", out], 120000);
  if (r.code !== 0) throw new Error(`Subtitle extraction failed: ${r.stderr}`);
}

async function makeSubtitlePlaylist(dir: string, index: number, sub: ProbeStream, duration: number) {
  const vtt = `sub_${index}.vtt`;
  const playlist = `sub_${index}.m3u8`;
  const label = labelFor(sub, `Subtitle ${index + 1}`);
  const lang = safeLang(sub.tags?.language);
  await writeFile(path.join(dir, playlist), [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-TARGETDURATION:" + Math.max(1, Math.ceil(duration || 1)),
    "#EXT-X-MEDIA-SEQUENCE:0",
    "#EXT-X-PLAYLIST-TYPE:VOD",
    `#EXTINF:${Math.max(0.001, duration || 1).toFixed(3)},`,
    vtt,
    "#EXT-X-ENDLIST",
    "",
  ].join("\n"));
  return { playlist, vtt, label, lang };
}

async function rewriteMaster(dir: string, subtitleTracks: Array<{ playlist: string; label: string; lang: string }>) {
  if (!subtitleTracks.length) return;
  const masterPath = path.join(dir, "master.m3u8");
  const master = await readFile(masterPath, "utf8");
  const lines = master.split(/\r?\n/);
  const media = subtitleTracks.map((s, i) => `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="${s.label.replace(/"/g, "")}",LANGUAGE="${s.lang}",DEFAULT=${i === 0 ? "YES" : "NO"},AUTOSELECT=YES,FORCED=NO,URI="${s.playlist}"`);
  const out: string[] = [];
  let inserted = false;
  for (const line of lines) {
    if (!inserted && line.startsWith("#EXT-X-STREAM-INF:")) {
      inserted = true;
      out.push(...media);
      out.push(line.includes("SUBTITLES=") ? line : `${line},SUBTITLES="subs"`);
    } else {
      out.push(line);
    }
  }
  await writeFile(masterPath, out.join("\n"));
}

async function startSession(input: string, streams: ProbeStream[]) {
  cleanupExpired();
  await mkdir(ROOT, { recursive: true });
  const id = token();
  const dir = path.join(ROOT, id);
  await mkdir(dir, { recursive: true });

  const video = streams.find(s => s.codec_type === "video");
  const audios = streams.filter(s => s.codec_type === "audio");
  const subtitles = streams.filter(s => ["subrip", "srt", "ass", "ssa", "webvtt", "mov_text", "text"].includes((s.codec_name || "").toLowerCase()));
  if (!video) throw new Error("Provider stream contains no video track");

  const duration = Number(video.duration || 0) || Number(streams.find(s => s.duration)?.duration || 0) || 1;
  const videoCodec = (video.codec_name || "").toLowerCase();
  const copyVideo = videoCodec === "h264" || videoCodec === "avc";

  const args: string[] = ["-hide_banner", "-loglevel", "warning", "-user_agent", UA, "-i", input];
  audios.forEach((_a, i) => args.push("-map", `0:a:${i}`));
  args.push("-map", "0:v:0");
  if (copyVideo) args.push("-c:v", "copy");
  else args.push("-c:v", "libx264", "-preset", process.env.FFMPEG_PRESET || "veryfast", "-crf", process.env.FFMPEG_CRF || "22", "-pix_fmt", "yuv420p", "-profile:v", "main", "-level", "4.1", "-g", "96", "-keyint_min", "96", "-sc_threshold", "0");
  args.push("-c:a", "aac", "-b:a", process.env.FFMPEG_AUDIO_BITRATE || "160k", "-ac", "2", "-ar", "48000");

  const audioMap = audios.map((_a, i) => {
    const lang = safeLang(audios[i].tags?.language);
    const name = labelFor(audios[i], `Audio ${i + 1}`).replace(/[:\s]/g, "_");
    return `a:${i},agroup:aud,${i === 0 ? "default:yes," : ""}language:${lang},name:${name}`;
  });
  const variantMap = [...audioMap, `v:0${audios.length ? ",agroup:aud" : ""}`].join(" ");

  args.push("-f", "hls", "-hls_time", process.env.HLS_SEGMENT_SECONDS || "6", "-hls_playlist_type", "vod", "-hls_flags", "independent_segments", "-master_pl_name", "master.m3u8", "-var_stream_map", variantMap, "-hls_segment_filename", path.join(dir, "seg_%v_%06d.ts"), path.join(dir, "v%v.m3u8"));

  const proc = spawn(FFMPEG, args, { stdio: ["ignore", "pipe", "pipe"] });
  proc.stderr.on("data", d => console.log(`[TRANSCODE-HLS ${id}] ${String(d).trim()}`));
  proc.on("error", e => console.log(`[TRANSCODE-HLS ${id}] spawn error: ${e.message}`));
  proc.on("close", code => console.log(`[TRANSCODE-HLS ${id}] exited ${code}`));
  sessions.set(id, { dir, proc, createdAt: Date.now() });

  const master = path.join(dir, "master.m3u8");
  if (!(await waitForFile(master))) {
    try { proc.kill("SIGKILL"); } catch {}
    sessions.delete(id);
    await rm(dir, { recursive: true, force: true });
    throw new Error("FFmpeg did not create an HLS master playlist");
  }

  // Extract text subtitles once. Image-based subtitles (PGS/VobSub) are skipped
  // because converting them to WebVTT requires OCR rather than a simple remux.
  const subtitleTracks: Array<{ playlist: string; label: string; lang: string }> = [];
  for (let i = 0; i < subtitles.length; i++) {
    try {
      await extractSubtitle(input, subtitles[i], path.join(dir, `sub_${i}.vtt`));
      const meta = await makeSubtitlePlaylist(dir, i, subtitles[i], duration);
      subtitleTracks.push(meta);
    } catch (e) {
      console.log(`[TRANSCODE-HLS ${id}] subtitle ${i} skipped: ${(e as Error).message}`);
    }
  }
  await rewriteMaster(dir, subtitleTracks);
  return id;
}

function mimeFor(file: string) {
  if (file.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (file.endsWith(".ts")) return "video/mp2t";
  if (file.endsWith(".vtt")) return "text/vtt; charset=utf-8";
  return "application/octet-stream";
}

export async function GET(req: Request) {
  console.log(`[TRANSCODE-HLS] request ${new URL(req.url).pathname}${new URL(req.url).search}`);
  try { await requireSession(); } catch { return new Response("Not authenticated", { status: 401 }); }
  cleanupExpired();
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("s");
  const file = url.searchParams.get("file");

  if (sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return new Response("HLS session expired", { status: 404 });
    const safe = path.normalize(file || "master.m3u8");
    const root = path.resolve(session.dir);
    const full = path.resolve(session.dir, safe);
    if (!full.startsWith(root + path.sep)) return new Response("Bad file", { status: 400 });
    try {
      let body = await readFile(full);
      if (full.endsWith(".m3u8")) {
        const text = body.toString("utf8");
        const currentFile = path.relative(root, full).replaceAll("\\", "/");
        const baseDir = path.posix.dirname(currentFile);
        const routeFor = (raw: string) => {
          try {
            const clean = raw.split("?")[0];
            const target = path.posix.normalize(path.posix.join(baseDir, clean));
            if (target.startsWith("../") || target === "..") return raw;
            return `/api/transcode-hls?s=${encodeURIComponent(sessionId)}&file=${encodeURIComponent(target)}`;
          } catch { return raw; }
        };
        body = Buffer.from(text.split(/\r?\n/).map(line => {
          const trimmed = line.trim();
          if (!trimmed) return line;
          if (trimmed.startsWith("#")) {
            return line.replace(/URI="([^"]+)"/g, (_m, u) => `URI="${routeFor(u)}"`);
          }
          return routeFor(trimmed);
        }).join("\n"));
      }
      return new Response(body, { headers: { "content-type": mimeFor(full), "cache-control": "no-store", "access-control-allow-origin": "*" } });
    } catch { return new Response("HLS file not ready", { status: 404 }); }
  }

  const type = url.searchParams.get("type") as StreamKind | null;
  const id = url.searchParams.get("id");
  const ext = url.searchParams.get("ext") || "ts";
  if (!type || !id || !["movie", "series"].includes(type)) return new Response("Bad request", { status: 400 });

  try {
    const creds = await requireSession();
    const located = await locatePlayable(creds, type, id, ext);
    if (!located) return new Response("Title unavailable from provider", { status: 404 });
    const streams = await probe(located.url);
    const sid = await startSession(located.url, streams);
    return new Response(null, { status: 302, headers: { location: `/api/transcode-hls?s=${encodeURIComponent(sid)}&file=master.m3u8`, "cache-control": "no-store" } });
  } catch (e) {
    console.log(`[TRANSCODE-HLS] failed: ${(e as Error).message}`);
    return new Response(`HLS transcode failed: ${(e as Error).message}`, { status: 502 });
  }
}
