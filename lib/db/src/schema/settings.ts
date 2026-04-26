import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Generic key/value store for editable runtime config (writer prompts,
// schedule overrides, etc.). Keys are app-namespaced strings, e.g.
// "writer.daily-writer.system_prompt".
export const settingsTable = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Setting = typeof settingsTable.$inferSelect;
export type InsertSetting = typeof settingsTable.$inferInsert;
