import { pgTable, serial, text, integer, timestamp, numeric, index } from "drizzle-orm/pg-core";

// Single source of truth for LLM spend across every Venice caller in the app.
// Writer-agent posts, judge, commentator, email polish/fallback, image-gen,
// and the SMS bot all append a row per call. The /admin/usage/venice endpoint
// reads from this table only — the per-resource token columns on `posts` and
// `sms_messages` stay for evals/history but are no longer the spend-tracker
// source.
//
// `caller` is the logical pipeline ("writer" / "judge" / "image_gen" / etc.) —
// the breakdown the admin UI shows. `call_kind` is the API shape so an
// image-gen row (no token counts, flat per-image cost) and a chat row
// (prompt+completion tokens, computed cost) coexist cleanly.
export const llmUsageTable = pgTable(
  "llm_usage",
  {
    id: serial("id").primaryKey(),
    caller: text("caller").notNull(),
    callKind: text("call_kind").notNull(),
    model: text("model").notNull(),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    // Stored as numeric string to match `posts.cost_usd` precision (8 decimals).
    costUsd: numeric("cost_usd", { precision: 14, scale: 8 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("llm_usage_created_at_idx").on(t.createdAt),
    index("llm_usage_caller_idx").on(t.caller),
  ],
);

export type LlmUsage = typeof llmUsageTable.$inferSelect;
export type InsertLlmUsage = typeof llmUsageTable.$inferInsert;
