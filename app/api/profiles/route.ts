import { NextResponse } from "next/server";
import { randomUUID, createHash } from "crypto";
import { authenticate } from "@/lib/xtream/client";
import { normalizeBaseUrl } from "@/lib/xtream/urls";
import { ensureDatabase, db } from "@/lib/db";
import { setSessionCookie } from "@/lib/session";

export const runtime = "nodejs";
function libraryKey(baseUrl: string, username: string) { return createHash("sha256").update(`${baseUrl}|${username}`).digest("hex"); }

export async function GET() {
  try {
    await ensureDatabase();
    const sql = db();
    const rows = await sql`SELECT id, label, base_url, username, created_at FROM profiles ORDER BY updated_at DESC, created_at DESC`;
    return NextResponse.json({ profiles: rows });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Profiller yüklenemedi" }, { status: 500 }); }
}

export async function POST(req: Request) {
  let body: { baseUrl?: string; username?: string; password?: string; label?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 }); }
  const baseUrl = normalizeBaseUrl(body.baseUrl ?? ""), username = (body.username ?? "").trim(), password = (body.password ?? "").trim();
  const label = (body.label ?? "").trim() || username || "Profil";
  if (!baseUrl || !username || !password) return NextResponse.json({ error: "Sunucu URL'si, kullanıcı adı ve şifre gereklidir." }, { status: 400 });
  try {
    const auth = await authenticate({ baseUrl, username, password });
    await ensureDatabase(); const sql = db();
    const existing = await sql`SELECT id FROM profiles WHERE base_url=${baseUrl} AND username=${username} LIMIT 1`;
    const id = (existing[0]?.id as string | undefined) ?? randomUUID();
    await sql`INSERT INTO profiles (id,label,base_url,username,password,updated_at) VALUES (${id},${label},${baseUrl},${username},${password},NOW()) ON CONFLICT (base_url,username) DO UPDATE SET label=EXCLUDED.label,password=EXCLUDED.password,updated_at=NOW()`;
    await setSessionCookie({ baseUrl, username, password });
    return NextResponse.json({ ok: true, profile: { id, label, base_url: baseUrl, username }, user_info: auth.user_info, server_info: auth.server_info });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Profil oluşturulamadı" }, { status: 401 }); }
}

export async function PATCH(req: Request) {
  let body: { id?: string }; try { body = await req.json(); } catch { return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "Profil kimliği gerekli" }, { status: 400 });
  try {
    await ensureDatabase(); const sql = db();
    const rows = await sql`SELECT base_url,username,password,label FROM profiles WHERE id=${body.id} LIMIT 1`; const p = rows[0];
    if (!p) return NextResponse.json({ error: "Profil bulunamadı" }, { status: 404 });
    await setSessionCookie({ baseUrl: p.base_url as string, username: p.username as string, password: p.password as string });
    await sql`UPDATE profiles SET updated_at=NOW() WHERE id=${body.id}`;
    return NextResponse.json({ ok: true, profile: { id: body.id, label: p.label, base_url: p.base_url, username: p.username } });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Profil seçilemedi" }, { status: 500 }); }
}

export async function DELETE(req: Request) {
  let body: { id?: string }; try { body = await req.json(); } catch { return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "Profil kimliği gerekli" }, { status: 400 });
  try {
    await ensureDatabase(); const sql = db();
    const rows = await sql`SELECT base_url,username FROM profiles WHERE id=${body.id} LIMIT 1`; const p = rows[0];
    if (!p) return NextResponse.json({ ok: true });
    const profileKey = libraryKey(p.base_url as string, p.username as string);
    await sql`DELETE FROM profiles WHERE id=${body.id}`;
    await sql`DELETE FROM favourites WHERE profile_key=${profileKey}`;
    await sql`DELETE FROM free_favourites WHERE profile_key=${profileKey}`;
    await sql`DELETE FROM watch_progress WHERE profile_key=${profileKey}`;
    await sql`DELETE FROM recent_live WHERE profile_key=${profileKey}`;
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Profil silinemedi" }, { status: 500 }); }
}
