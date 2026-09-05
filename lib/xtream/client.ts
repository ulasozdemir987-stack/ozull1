import { playerApiUrl } from "./urls";
import type {
  AuthResponse,
  Category,
  CanlıStream,
  VodStream,
  VodInfo,
  Diziler,
  DizilerInfo,
  ShortEpgResponse,
  XtreamCredentials,
} from "./types";

const UA = "Lumen/1.0 (Xtream Web Oynater)";
const TIMEOUT_MS = 25_000;

async function call<T>(
  creds: XtreamCredentials,
  params: Record<string, string | number | undefined>,
): Promise<T> {
  const url = playerApiUrl(creds, params);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new XtreamError(`Provider returned ${res.status}`, res.status);
    const text = await res.text();
    if (!text) return [] as unknown as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new XtreamError("Provider returned a non-JSON response (check URL/credentials).");
    }
  } catch (err) {
    if (err instanceof XtreamError) throw err;
    if ((err as Error).name === "AbortError")
      throw new XtreamError("Provider timed out. The server may be slow or unreachable.");
    throw new XtreamError(`Could not reach provider: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

export class XtreamError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "XtreamError";
    this.status = status;
  }
}

/** Validate credentials and return account + server info. */
export async function authenticate(creds: XtreamCredentials): Promise<AuthResponse> {
  const data = await call<AuthResponse>(creds, {});
  if (!data || !data.user_info || data.user_info.auth === 0) {
    throw new XtreamError("Invalid username or password.");
  }
  return data;
}

export const getCanlıKategoriler = (c: XtreamCredentials) =>
  call<Category[]>(c, { action: "get_live_categories" });

export const getCanlıStreams = (c: XtreamCredentials, categoryId?: string) =>
  call<CanlıStream[]>(c, { action: "get_live_streams", category_id: categoryId });

export const getVodKategoriler = (c: XtreamCredentials) =>
  call<Category[]>(c, { action: "get_vod_categories" });

export const getVodStreams = (c: XtreamCredentials, categoryId?: string) =>
  call<VodStream[]>(c, { action: "get_vod_streams", category_id: categoryId });

export const getVodInfo = (c: XtreamCredentials, vodId: string | number) =>
  call<VodInfo>(c, { action: "get_vod_info", vod_id: vodId });

export const getDizilerKategoriler = (c: XtreamCredentials) =>
  call<Category[]>(c, { action: "get_series_categories" });

export const getDiziler = (c: XtreamCredentials, categoryId?: string) =>
  call<Diziler[]>(c, { action: "get_series", category_id: categoryId });

export const getDizilerInfo = (c: XtreamCredentials, seriesId: string | number) =>
  call<DizilerInfo>(c, { action: "get_series_info", series_id: seriesId });

export const getShortEpg = (c: XtreamCredentials, streamId: string | number, limit = 8) =>
  call<ShortEpgResponse>(c, { action: "get_short_epg", stream_id: streamId, limit });

/** Map an action string (used by the generic /api/xtream proxy) to a typed call. */
export async function dispatch(
  creds: XtreamCredentials,
  action: string,
  params: Record<string, string | undefined>,
): Promise<unknown> {
  switch (action) {
    case "authenticate":
      return authenticate(creds);
    case "get_live_categories":
      return getCanlıKategoriler(creds);
    case "get_live_streams":
      return getCanlıStreams(creds, params.category_id);
    case "get_vod_categories":
      return getVodKategoriler(creds);
    case "get_vod_streams":
      return getVodStreams(creds, params.category_id);
    case "get_vod_info":
      return getVodInfo(creds, params.vod_id!);
    case "get_series_categories":
      return getDizilerKategoriler(creds);
    case "get_series":
      return getDiziler(creds, params.category_id);
    case "get_series_info":
      return getDizilerInfo(creds, params.series_id!);
    case "get_short_epg":
      return getShortEpg(creds, params.stream_id!, params.limit ? Number(params.limit) : 8);
    default:
      throw new XtreamError(`Unknown action: ${action}`, 400);
  }
}
