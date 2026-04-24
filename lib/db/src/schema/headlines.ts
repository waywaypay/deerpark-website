import { pgTable, serial, text, timestamp, integer, index, uniqueIndex } from "drizzle-orm/pg-core";

export const headlinesTable = pgTable(
  "headlines",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull(),
    category: text("category").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    urlHash: text("url_hash").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    relevanceScore: integer("relevance_score"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("headlines_source_url_hash_uq").on(t.source, t.urlHash),
    index("headlines_published_at_idx").on(t.publishedAt),
  ],
);

export type Headline = typeof headlinesTable.$inferSelect;
export type InsertHeadline = typeof headlinesTable.$inferInsert;
