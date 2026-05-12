import { pgTable, serial, text, timestamp, jsonb, integer, boolean, numeric, index } from "drizzle-orm/pg-core";

export type DispatchArchiveItem = {
  id: number;
  source: string;
  title: string;
  url: string;
  commentary: string | null;
  publishedAt: string;
};

export type DispatchEvalDimension = {
  score: number;
  note: string;
};

export type DispatchEvalScores = {
  introSpecificity: DispatchEvalDimension;
  lensDiversity: DispatchEvalDimension;
  cadenceVariety: DispatchEvalDimension;
  sourceTiering: DispatchEvalDimension;
  concreteness: DispatchEvalDimension;
};

export type DispatchBannedPhraseHit = {
  phrase: string;
  count: number;
  /** Where in the dispatch the phrase appeared. */
  locations: Array<"subject" | "intro" | `item:${number}`>;
};

/** Content-addressed prompt versions in use at compose time.
 *  Hash → dispatchPromptsTable.hash. Per slot so the operator can see
 *  which polish prompt vs which fallback vs which commentator was active. */
export type DispatchPromptVersionMap = {
  polish?: string;
  fallback?: string;
  commentator?: string;
  banner?: string;
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
    // Eval columns. Populated by dispatch-eval after archiving — combines a
    // regex sweep for banned phrases with an LLM rubric pass for the five
    // qualitative dimensions. Composite score is the mean of the dimensions
    // (0-10) so the list view can sort/filter without unpacking the jsonb.
    evalScores: jsonb("eval_scores").$type<DispatchEvalScores>(),
    evalCompositeScore: numeric("eval_composite_score", { precision: 4, scale: 2 }),
    evalBannedPhrasesCount: integer("eval_banned_phrases_count"),
    evalBannedPhrases: jsonb("eval_banned_phrases").$type<DispatchBannedPhraseHit[]>(),
    evalModel: text("eval_model"),
    evalRunAt: timestamp("eval_run_at", { withTimezone: true }),
    /** Per-slot prompt hashes (sha256, first 16 chars) used at compose
     *  time. Joins to dispatch_prompts for the full content. Lets the
     *  Feedback log color-band and filter by prompt version without
     *  joining the prompt rows on the list query. */
    promptVersions: jsonb("prompt_versions").$type<DispatchPromptVersionMap>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("dispatch_archive_created_at_idx").on(t.createdAt)],
);

export type DispatchArchive = typeof dispatchArchiveTable.$inferSelect;
export type InsertDispatchArchive = typeof dispatchArchiveTable.$inferInsert;
