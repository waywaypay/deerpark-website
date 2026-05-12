import { pgTable, serial, text, timestamp, integer, index } from "drizzle-orm/pg-core";

/** One row per LLM call that participated in composing a dispatch.
 *
 *  Today: polish + fallback (the dispatch-level calls inside
 *  composeDailyEmail). Commentator runs on the ingest scheduler — per
 *  headline, not per dispatch — and isn't captured here yet; that needs
 *  a separate join keyed on the headline IDs.
 *
 *  The point of this table is to make the dataset SFT-extractable:
 *  `(prompt_hash → dispatch_prompts.content, user_message)` is the
 *  input the model saw, `response_text` is the raw output (before any
 *  JSON parse / commentary merge). Pair that with the row's eval
 *  scores on dispatch_archive and you can filter for good vs bad
 *  examples without any post-hoc reconstruction. */
export const dispatchLlmCallsTable = pgTable(
  "dispatch_llm_calls",
  {
    id: serial("id").primaryKey(),
    /** Nullable so the table can absorb future commentator captures
     *  (which happen pre-compose) without a schema change. Polish +
     *  fallback always set this. */
    dispatchArchiveId: integer("dispatch_archive_id"),
    /** "polish" | "fallback" | "commentator" (future). */
    kind: text("kind").notNull(),
    /** Joins to dispatch_prompts.hash. Stored even if the prompt
     *  registry insert failed — the hash itself is computable from
     *  content and recoverable later. */
    promptHash: text("prompt_hash").notNull(),
    /** Full user message we sent to the model. */
    userMessage: text("user_message").notNull(),
    /** Raw response.choices[0].message.content BEFORE any JSON parse.
     *  Empty string when the request failed before returning text. */
    responseText: text("response_text").notNull().default(""),
    model: text("model").notNull(),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    totalTokens: integer("total_tokens"),
    latencyMs: integer("latency_ms"),
    /** "ok" | "request_failed" | "parse_failed" | "missing_subject_or_intro". */
    status: text("status").notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("dispatch_llm_calls_archive_id_idx").on(t.dispatchArchiveId),
    index("dispatch_llm_calls_created_at_idx").on(t.createdAt),
  ],
);

export type DispatchLlmCall = typeof dispatchLlmCallsTable.$inferSelect;
export type InsertDispatchLlmCall = typeof dispatchLlmCallsTable.$inferInsert;
