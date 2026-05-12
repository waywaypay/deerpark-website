import { pgTable, serial, text, timestamp, jsonb, integer, boolean, index } from "drizzle-orm/pg-core";

export type DispatchArchiveItem = {
  id: number;
  source: string;
  title: string;
  url: string;
  commentary: string | null;
  publishedAt: string;
};

export const dispatchArchiveTable = pgTable(
  "dispatch_archive",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(),
    subject: text("subject").notNull(),
    introHtml: text("intro_html").notNull(),
    bodyHtml: text("body_html").notNull(),
    headlinesSnapshot: jsonb("headlines_snapshot").$type<DispatchArchiveItem[]>().notNull(),
    recipientCount: integer("recipient_count"),
    polishApplied: boolean("polish_applied").notNull().default(false),
    bannerGenerated: boolean("banner_generated").notNull().default(false),
    feedback: text("feedback"),
    feedbackUpdatedAt: timestamp("feedback_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("dispatch_archive_created_at_idx").on(t.createdAt)],
);

export type DispatchArchive = typeof dispatchArchiveTable.$inferSelect;
export type InsertDispatchArchive = typeof dispatchArchiveTable.$inferInsert;
