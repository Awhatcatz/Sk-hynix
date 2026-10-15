import { env } from "cloudflare:workers";
import type { SignalEvent } from "./radar-types";

export function database() {
  if (!env.DB) throw new Error("Market storage unavailable");
  return env.DB;
}
export async function readCache<T>(key: string): Promise<{ value: T; updatedAt: number } | null> {
  const row = await database().prepare("SELECT payload, updated_at FROM radar_cache WHERE key = ?").bind(key).first<{ payload: string; updated_at: number }>();
  return row ? { value: JSON.parse(row.payload) as T, updatedAt: row.updated_at } : null;
}
export async function writeCache(key: string, value: unknown) {
  await database().prepare("INSERT INTO radar_cache(key,payload,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at")
    .bind(key, JSON.stringify(value), Date.now()).run();
}
export async function acquireLease(key: string, duration: number): Promise<number | null> {
  const now = Date.now();
  const result = await database().prepare("INSERT INTO radar_locks(key,expires_at) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET expires_at=excluded.expires_at WHERE radar_locks.expires_at < ?")
    .bind(key, now + duration, now).run();
  return result.meta.changes > 0 ? now + duration : null;
}
export async function acquireLock(key: string, duration: number): Promise<boolean> { return await acquireLease(key, duration) !== null; }
export async function releaseLease(key: string, expiresAt: number) { await database().prepare("DELETE FROM radar_locks WHERE key=? AND expires_at=?").bind(key, expiresAt).run(); }
export async function releaseLock(key: string) { await database().prepare("DELETE FROM radar_locks WHERE key=?").bind(key).run(); }
export async function saveEvents(events: SignalEvent[]) {
  if (events.length) await database().batch(events.map((event) => database().prepare("INSERT OR IGNORE INTO signal_events(id,asset_id,side,price,reason,bar_time,created_at) VALUES(?,?,?,?,?,?,?)")
    .bind(event.id, event.assetId, event.side, String(event.price), event.reason, event.barTime, event.createdAt)));
}
export async function eventHistory(): Promise<SignalEvent[]> {
  const rows = await database().prepare("SELECT id,asset_id,side,price,reason,bar_time,created_at FROM signal_events ORDER BY created_at DESC LIMIT 60").all<Record<string, string | number>>();
  return rows.results.map((row) => ({ id: String(row.id), assetId: row.asset_id as SignalEvent["assetId"], side: row.side as SignalEvent["side"],
    price: Number(row.price), reason: String(row.reason), barTime: String(row.bar_time), createdAt: Number(row.created_at) }));
}
