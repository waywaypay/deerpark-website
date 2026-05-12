import { pgTable, text, timestamp, integer, index } from "drizzle-orm/pg-core";

/** Content-addressed registry of every prompt that has driven a dispatch
 *  composition. Two deploys with identical prompts collapse to the same
 *  row automatically — the hash is the primary key. Populated lazily by
 *  the compose path the first time a never-before-seen prompt runs. */
export const dispatchPromptsTable = pgTable(
  "dispatch_prompts",
  {
    /** First 16 chars of sha256(content). Long enough to dedupe; short
     *  enough to fit in a short label without ellipsis. */
    hash: text("hash").primaryKey(),
    /** Which compose-pipeline slot this prompt occupies. Lets the UI
     *  group versions per slot ("all polish prompts ever seen"). */
    slot: text("slot").notNull(),
    /** Full prompt text as a snapshot. Once written, never updated —
     *  the hash IS the version. If the prompt changes, a new row appears. */
    content: text("content").notNull(),
    /** Byte length of `content` — used by the list endpoint to summarize
     *  versions without shipping the full text. */
    contentLength: integer("content_length").notNull(),
    /** Optional operator note attached when this version was first seen.
     *  Currently always null; reserved for a future "add note to v8"
     *  affordance in the admin UI. */
    note: text("note"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("dispatch_prompts_slot_idx").on(t.slot, t.firstSeenAt)],
);

export type DispatchPrompt = typeof dispatchPromptsTable.$inferSelect;
export type InsertDispatchPrompt = typeof dispatchPromptsTable.$inferInsert;
