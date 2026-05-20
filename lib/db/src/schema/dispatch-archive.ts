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
  /** Up to 3 specific items (1-indexed, matching headlinesSnapshot order)
   *  the LLM flagged as the worst offenders on this dimension, with a short
   *  quoted span from the offending text. Optional for back-compat with
   *  rows evaluated before per-item attribution shipped. The intro is
   *  attributed with `item: 0`. */
  worstItems?: Array<{ item: number; quote: string }>;
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
  /** "violation" = sentence-shape or LLM-tic phrase that should never appear.
   *  "warning" = bare-word ban (e.g. "increasingly", "transformative") that
   *  catches both legitimate and synthetic uses; tracked but not counted
   *  toward the headline violations number. Optional for back-compat with
   *  rows scanned before the severity split. */
  severity?: "violation" | "warning";
};

export type DispatchFormattingIssueType =
  | "empty_paragraph"
  | "nbsp_run"
  | "double_space"
  | "broken_anchor"
  | "item_count_mismatch"
  | "missing_alt"
  | "unrendered_token"
  | "duplicate_link";

export type DispatchFormattingIssue = {
  type: DispatchFormattingIssueType;
  count: number;
  /** First offending fragment, trimmed to ~80 chars. Helps the operator
   *  locate the issue without unpacking the full body HTML. */
  sample?: string;
};

export type DispatchFormattingResult = {
  issues: DispatchFormattingIssue[];
  /** Total issue count across all types. The persisted score
   *  `eval_formatting_score` is derived from this; this jsonb keeps the
   *  breakdown so the UI can list which checks tripped. */
  totalIssues: number;
};

export type DispatchBannerEvalDimension = {
  score: number;
  note: string;
};

/** Image rubric — scored by a vision model in PR B. Tracked separately from
 *  the prose rubric because the banner targets a different (image) model,
 *  so its scores should never fold into the writing composite. */
export type DispatchBannerEvalScores = {
  abstractness: DispatchBannerEvalDimension;
  paletteAdherence: DispatchBannerEvalDimension;
  motifMatch: DispatchBannerEvalDimension;
  restraint: DispatchBannerEvalDimension;
};

/** Content-addressed prompt versions in use at compose time.
 *  Hash → dispatchPromptsTable.hash. Per slot so the operator can see
 *  which polish prompt vs which fallback vs which commentator vs which
 *  judge rubric was active. `judge` is filled in after eval runs (which
 *  happens post-archive), so older rows may have everything else but no
 *  judge hash. */
export type DispatchPromptVersionMap = {
  polish?: string;
  fallback?: string;
  commentator?: string;
  banner?: string;
  judge?: string;
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
    // Formatting eval — deterministic HTML/structure checks (no LLM cost).
    // Tracked as its own track because formatting issues are usually fixed
    // by template / post-processing changes rather than fine-tuning, so its
    // score should not feed the writing composite.
    evalFormatting: jsonb("eval_formatting").$type<DispatchFormattingResult>(),
    evalFormattingScore: numeric("eval_formatting_score", { precision: 4, scale: 2 }),
    // Banner / image eval — populated by a vision model in PR B. The score
    // and per-dimension notes drive a separate image-fine-tune dataset
    // export, never folded into the writing composite.
    evalBannerScores: jsonb("eval_banner_scores").$type<DispatchBannerEvalScores>(),
    evalBannerCompositeScore: numeric("eval_banner_composite_score", { precision: 4, scale: 2 }),
    evalBannerModel: text("eval_banner_model"),
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
