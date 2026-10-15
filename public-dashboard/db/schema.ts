import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const radarCache = sqliteTable("radar_cache", {
  key: text("key").primaryKey(),
  payload: text("payload").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export const radarLocks = sqliteTable("radar_locks", {
  key: text("key").primaryKey(),
  expiresAt: integer("expires_at").notNull(),
});
export const signalEvents = sqliteTable("signal_events", {
  id: text("id").primaryKey(),
  assetId: text("asset_id").notNull(),
  side: text("side").notNull(),
  price: text("price").notNull(),
  reason: text("reason").notNull(),
  barTime: text("bar_time").notNull(),
  createdAt: integer("created_at").notNull(),
});
