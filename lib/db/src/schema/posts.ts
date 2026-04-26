import { pgTable, serial, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const postsTable = pgTable(
  "posts",
  {
    id: serial("id").primaryKey(),
    agentId: text("agent_id").notNull(),
    mode: text("mode").notNull(),
    tag: text("tag").notNull(),
    title: text("title").notNull(),
    dek: text("dek").notNull(),
    bodyMarkdown: text("body_markdown").notNull(),
    citations: jsonb("citations").$type<string[]>().notNull(),
    sourceHeadlineIds: jsonb("source_headline_ids").$type<number[]>().notNull(),
    model: text("model").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("posts_published_at_idx").on(t.publishedAt),
  ],
);

export type Post = typeof postsTable.$inferSelect;
export type InsertPost = typeof postsTable.$inferInsert;
