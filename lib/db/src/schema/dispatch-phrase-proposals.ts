import { pgTable, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";

/** Auto-mined banned-phrase candidates. The dispatch eval's worstItems
 *  quotes are tokenized into 2/3-grams; n-grams that recur across multiple
 *  dispatches land here. The runtime gates (commentator + writer +
 *  eval scan) merge active rows from this table with the static
 *  BANNED_PATTERNS in code, so the closed loop is:
 *
 *    dispatch ships → eval flags worst quotes → mining writes proposals →
 *    next compose's gate blocks the n-gram before it ships again.
 *
 *  Severity is monotonic: once a phrase hits the violation threshold it
 *  stays a violation, even if the gate's effectiveness drops it out of the
 *  rolling window. Operator dismisses via `dismissedAt` (false-positive
 *  e.g. a phrase that happens to recur but is legitimate). */
export const dispatchPhraseProposalsTable = pgTable(
  "dispatch_phrase_proposals",
  {
    /** Normalized phrase — lowercase, whitespace-collapsed. Used as the
     *  display label in the admin UI and as the dedup key. */
    phrase: text("phrase").primaryKey(),
    /** Regex source (without flags/wrappers) — already includes \b word
     *  boundaries and \s+ between tokens. Compiled with "i" flag at load. */
    regexSource: text("regex_source").notNull(),
    /** "warning" or "violation". Monotonic — only ever upgraded. */
    severity: text("severity").notNull(),
    /** Distinct-dispatch hit count across all mining runs. Computed as the
     *  size of `hitDispatchIds`; persisted denormalized so the admin UI
     *  can sort/filter without unpacking the jsonb. */
    hitCount: integer("hit_count").notNull().default(0),
    /** Set of dispatch_archive.id values that contributed this phrase via
     *  worstItems quotes. Used to guard against double-counting on
     *  repeated mining of the same rolling window. Capped at the last 50
     *  to bound row size. */
    hitDispatchIds: jsonb("hit_dispatch_ids").$type<number[]>().notNull().default([]),
    /** One offending quote (≤120 chars) for the admin UI to display
     *  alongside the phrase. */
    sample: text("sample"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    /** When this proposal was first promoted to "violation". Null while
     *  the phrase is still at "warning". */
    promotedAt: timestamp("promoted_at", { withTimezone: true }),
    /** Operator dismissal — when set, the runtime gate ignores this row
     *  entirely. Used for false positives the miner shouldn't have
     *  surfaced (legitimate phrases that happened to recur). */
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  },
  (t) => [
    index("dispatch_phrase_proposals_severity_idx").on(t.severity, t.dismissedAt),
    index("dispatch_phrase_proposals_last_seen_idx").on(t.lastSeenAt),
  ],
);

export type DispatchPhraseProposal = typeof dispatchPhraseProposalsTable.$inferSelect;
export type InsertDispatchPhraseProposal = typeof dispatchPhraseProposalsTable.$inferInsert;
