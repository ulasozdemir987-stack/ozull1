import { neon } from "@neondatabase/serverless";

let initialized = false;

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ayarlanmadı. Vercel'de bir PostgreSQL veritabanı bağlayın.");
  return neon(url);
}

export async function ensureDatabase() {
  if (initialized) return;
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      base_url TEXT NOT NULL,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(base_url, username)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS favourites (
      profile_key TEXT NOT NULL,
      kind TEXT NOT NULL,
      item_id TEXT NOT NULL,
      name TEXT NOT NULL,
      poster TEXT,
      ext TEXT,
      PRIMARY KEY(profile_key, kind, item_id)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS free_favourites (
      profile_key TEXT NOT NULL,
      url TEXT NOT NULL,
      name TEXT NOT NULL,
      logo TEXT,
      PRIMARY KEY(profile_key, url)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS watch_progress (
      profile_key TEXT NOT NULL,
      item_key TEXT NOT NULL,
      kind TEXT NOT NULL,
      item_id TEXT NOT NULL,
      series_id TEXT,
      title TEXT NOT NULL,
      poster TEXT,
      ext TEXT NOT NULL,
      position DOUBLE PRECISION NOT NULL DEFAULT 0,
      duration DOUBLE PRECISION NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY(profile_key, item_key)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS recent_live (
      profile_key TEXT NOT NULL,
      stream_id INTEGER NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY(profile_key, stream_id)
    )
  `;
  initialized = true;
}

export function db() {
  return getSql();
}
