// Closed-loop banned-phrase miner. Reads the rolling window of recent
// dispatch evals, extracts 2/3-grams from each judge's worstItems quotes,
// dedups across judges within a dispatch, and upserts proposals into
// dispatch_phrase_proposals. The runtime gate (banned-phrases.ts) merges
// these with the static BANNED_PATTERNS list, so a phrase that recurs
// across N dispatches gets blocked before it ships on the N+1th.
//
// Promotion threshold: 2 distinct-dispatch hits → "warning"; 4 →
// "violation". Severity is monotonic — once promoted, sticky, even if
// the gate's effectiveness drops the phrase out of the rolling window.
// (If the gate is blocking it, we want to keep blocking it.) Operator
// dismisses false positives via dispatch_phrase_proposals.dismissed_at.

import {
  db,
  dispatchArchiveTable,
  dispatchPhraseProposalsTable,
  type DispatchEvalDimension,
  type DispatchEvalScores,
  type DispatchPhraseProposal,
} from "@workspace/db";
import { desc, eq, isNotNull, sql } from "drizzle-orm";
import { logger } from "./logger";
import { BANNED_PATTERNS } from "./banned-phrases";

// Rolling window — how many of the most-recent eval'd dispatches we
// scan on each mining run. Big enough to catch a phrase that recurs
// across several sends, small enough that one bad week doesn't
// permanently dominate the proposal set.
const DEFAULT_WINDOW = 12;

// Distinct-dispatch hit thresholds. Counted against the de-duped
// (phrase, dispatch_id) set persisted in hit_dispatch_ids.
const WARNING_THRESHOLD = 2;
const VIOLATION_THRESHOLD = 4;

// Cap on per-row hit_dispatch_ids size so a long-running phrase doesn't
// grow the jsonb unboundedly. We only need recent attribution.
const HIT_DISPATCH_IDS_CAP = 50;

// Lowercase tokens we never use as either token in an n-gram. Includes
// closed-class stopwords (articles/conjunctions/auxiliaries) plus a few
// pronouns and short connectives. Tokens not in this set ARE allowed
// to appear in n-grams as long as at least one other token isn't a
// stopword — so "growth trajectory" survives but "of the" doesn't.
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "nor", "yet", "so",
  "is", "are", "was", "were", "be", "been", "being", "am",
  "have", "has", "had", "having", "do", "does", "did", "doing", "done",
  "will", "would", "shall", "should", "may", "might", "can", "could", "must",
  "of", "in", "on", "at", "to", "for", "with", "from", "by", "as", "into",
  "onto", "upon", "over", "under", "between", "among", "across",
  "it", "its", "this", "that", "these", "those", "they", "them", "their",
  "he", "she", "we", "us", "our", "ours", "i", "you", "your", "yours",
  "if", "then", "than", "when", "while", "because", "since", "though", "although",
  "not", "no", "any", "some", "all", "such", "more", "most", "less", "least",
  "very", "too", "just", "also", "only", "other", "another", "each", "every", "every",
  "what", "which", "who", "whom", "whose", "where", "why", "how",
  "there", "here", "now", "still", "again", "ever", "never",
]);

// Pull dispatches with an evalScores row. The miner doesn't care about
// banner / formatting tracks — only the prose rubric's worstItems carry
// the offending text spans.
type MiningRow = {
  id: number;
  evalScores: DispatchEvalScores | null;
};

async function loadRecentEvalRows(limit: number): Promise<MiningRow[]> {
  return db
    .select({
      id: dispatchArchiveTable.id,
      evalScores: dispatchArchiveTable.evalScores,
    })
    .from(dispatchArchiveTable)
    .where(isNotNull(dispatchArchiveTable.evalScores))
    .orderBy(desc(dispatchArchiveTable.createdAt))
    .limit(limit);
}

// Lowercase word tokens. Apostrophes are preserved inside tokens
// ("vendor's"), hyphens are kept ("ai-native"); leading/trailing
// punctuation is dropped.
function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z'-]*/g) ?? []).filter(Boolean);
}

// Determine which lowercase tokens look like proper nouns in the original
// quote — company names, products, people, acronyms. These are
// day-specific and shouldn't generalize as banned phrases.
//
// Heuristic: any capitalized word is a proper noun, EXCEPT closed-class
// stopwords (the/a/this/that/he/she/...) which get capitalized at
// sentence start. That correctly catches mid-sentence Anthropic AND
// sentence-initial Anthropic while ignoring sentence-initial "The".
function properNounsIn(quote: string): Set<string> {
  const out = new Set<string>();
  const words = quote.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
  for (const w of words) {
    if (!/^[A-Z]/.test(w)) continue;
    const lower = w.toLowerCase();
    if (STOPWORDS.has(lower)) continue;
    out.add(lower);
  }
  return out;
}

/** Extract candidate 2/3-gram phrases from one quote. Excludes n-grams
 *  containing proper nouns, digits, very short tokens, or only
 *  stopwords. Returns lowercase space-joined strings. */
export function extractNgramCandidates(quote: string): string[] {
  const tokens = tokenize(quote);
  if (tokens.length < 2) return [];
  const propers = properNounsIn(quote);
  const out = new Set<string>();
  for (let n = 2; n <= 3; n++) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const slice = tokens.slice(i, i + n);
      let bad = false;
      for (const t of slice) {
        if (t.length < 3) { bad = true; break; }
        if (propers.has(t)) { bad = true; break; }
        if (/\d/.test(t)) { bad = true; break; }
      }
      if (bad) continue;
      // At least one non-stopword token is required.
      if (slice.every((t) => STOPWORDS.has(t))) continue;
      out.add(slice.join(" "));
    }
  }
  return Array.from(out);
}

function escapeRegexLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Build the regex source for a mined phrase. Word-boundaried, with
 *  flexible whitespace between tokens so "growth   trajectory" still
 *  matches "growth trajectory". Compiled with the "i" flag at load. */
export function phraseToRegexSource(phrase: string): string {
  const tokens = phrase.split(/\s+/).filter(Boolean).map(escapeRegexLiteral);
  if (tokens.length === 0) return "";
  return `\\b${tokens.join("\\s+")}\\b`;
}

/** Is this candidate already covered by a static BANNED_PATTERNS entry?
 *  Cheap regex test against each static pattern's source — if any
 *  static pattern matches the candidate phrase string, the static rule
 *  will catch the same offending text and we don't need a duplicate. */
function alreadyCoveredByStatic(candidate: string): boolean {
  for (const pat of BANNED_PATTERNS) {
    // Re-compile without global to ensure .test starts at index 0.
    const re = new RegExp(pat.re.source, pat.re.flags.replace(/g/g, ""));
    if (re.test(candidate)) return true;
  }
  return false;
}

type CandidateBucket = {
  /** Set of contributing dispatch IDs in the current mining window. */
  dispatchIds: Set<number>;
  /** First quote we saw for this phrase. */
  sample: string;
};

function bucketCandidates(rows: MiningRow[]): Map<string, CandidateBucket> {
  const buckets = new Map<string, CandidateBucket>();
  for (const row of rows) {
    const scores = row.evalScores;
    if (!scores) continue;
    // Each dispatch contributes a SET of candidate phrases — we never
    // count the same phrase twice for one dispatch even if it appeared
    // in multiple dimensions' worstItems.
    const perDispatch = new Map<string, string>();
    for (const dim of Object.values(scores) as DispatchEvalDimension[]) {
      for (const wi of dim.worstItems ?? []) {
        const quote = (wi.quote ?? "").trim();
        if (!quote) continue;
        for (const ng of extractNgramCandidates(quote)) {
          if (!perDispatch.has(ng)) perDispatch.set(ng, quote.slice(0, 120));
        }
      }
    }
    for (const [phrase, sample] of perDispatch) {
      const existing = buckets.get(phrase);
      if (existing) {
        existing.dispatchIds.add(row.id);
      } else {
        buckets.set(phrase, {
          dispatchIds: new Set([row.id]),
          sample,
        });
      }
    }
  }
  return buckets;
}

function mergeDispatchIds(existing: number[], incoming: Set<number>): number[] {
  const seen = new Set<number>(existing);
  for (const id of incoming) seen.add(id);
  const arr = Array.from(seen).sort((a, b) => b - a);
  return arr.slice(0, HIT_DISPATCH_IDS_CAP);
}

function severityFor(hitCount: number): "warning" | "violation" {
  return hitCount >= VIOLATION_THRESHOLD ? "violation" : "warning";
}

export type MiningSummary = {
  rowsScanned: number;
  candidates: number;
  upserted: number;
  promotedToViolation: number;
  skippedCoveredByStatic: number;
};

/**
 * Run one mining pass. Reads the last `window` dispatches with eval
 * scores, builds the candidate set, then merges into
 * dispatch_phrase_proposals. Idempotent — safe to call after every eval
 * (and from the admin UI on demand).
 *
 * Severity is monotonic: a row already at "violation" is never demoted,
 * even if the latest mining run shows fewer hits than the threshold.
 * The runtime gate stays effective even after the gate has done its job.
 */
export async function mineBannedPhraseProposals(
  opts: { window?: number } = {},
): Promise<MiningSummary> {
  const window = opts.window ?? DEFAULT_WINDOW;
  const rows = await loadRecentEvalRows(window);
  const buckets = bucketCandidates(rows);

  const summary: MiningSummary = {
    rowsScanned: rows.length,
    candidates: buckets.size,
    upserted: 0,
    promotedToViolation: 0,
    skippedCoveredByStatic: 0,
  };

  if (buckets.size === 0) return summary;

  // Pre-fetch existing rows so we can compute the merged dispatch-id set
  // in JS. Doing this in SQL would require an UPDATE per phrase anyway,
  // and the table is small (proposals never grow past hundreds of rows).
  const phrases = Array.from(buckets.keys());
  const existingRows = await db
    .select()
    .from(dispatchPhraseProposalsTable)
    .where(
      sql`${dispatchPhraseProposalsTable.phrase} IN (${sql.join(
        phrases.map((p) => sql`${p}`),
        sql`, `,
      )})`,
    );
  const existingByPhrase = new Map(existingRows.map((r) => [r.phrase, r]));

  const now = new Date();
  for (const [phrase, bucket] of buckets) {
    if (alreadyCoveredByStatic(phrase)) {
      summary.skippedCoveredByStatic++;
      continue;
    }
    const existing = existingByPhrase.get(phrase);
    const mergedIds = mergeDispatchIds(
      existing?.hitDispatchIds ?? [],
      bucket.dispatchIds,
    );
    const hitCount = mergedIds.length;
    if (hitCount < WARNING_THRESHOLD) continue;

    const computedSeverity = severityFor(hitCount);
    // Monotonic — never demote.
    const currentSeverity = existing?.severity as "warning" | "violation" | undefined;
    const newSeverity: "warning" | "violation" =
      currentSeverity === "violation" ? "violation" : computedSeverity;
    const justPromoted = newSeverity === "violation" && currentSeverity !== "violation";

    const regexSource = existing?.regexSource ?? phraseToRegexSource(phrase);
    const sample = existing?.sample ?? bucket.sample;

    if (existing) {
      await db
        .update(dispatchPhraseProposalsTable)
        .set({
          regexSource,
          severity: newSeverity,
          hitCount,
          hitDispatchIds: mergedIds,
          sample,
          lastSeenAt: now,
          ...(justPromoted ? { promotedAt: now } : {}),
        })
        .where(eq(dispatchPhraseProposalsTable.phrase, phrase));
    } else {
      await db.insert(dispatchPhraseProposalsTable).values({
        phrase,
        regexSource,
        severity: newSeverity,
        hitCount,
        hitDispatchIds: mergedIds,
        sample,
        firstSeenAt: now,
        lastSeenAt: now,
        ...(newSeverity === "violation" ? { promotedAt: now } : {}),
      });
    }
    summary.upserted++;
    if (justPromoted) summary.promotedToViolation++;
  }

  return summary;
}

/** Idempotent self-heal — adds dispatch_phrase_proposals if a prod DB
 *  predates migrations/0009. Safe to call on every boot. */
export async function ensureDispatchPhraseProposalsSchema(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS dispatch_phrase_proposals (
      phrase             TEXT PRIMARY KEY,
      regex_source       TEXT NOT NULL,
      severity           TEXT NOT NULL DEFAULT 'warning',
      hit_count          INTEGER NOT NULL DEFAULT 0,
      hit_dispatch_ids   JSONB NOT NULL DEFAULT '[]'::jsonb,
      sample             TEXT,
      first_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      promoted_at        TIMESTAMPTZ,
      dismissed_at       TIMESTAMPTZ
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS dispatch_phrase_proposals_severity_idx
      ON dispatch_phrase_proposals (severity, dismissed_at)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS dispatch_phrase_proposals_last_seen_idx
      ON dispatch_phrase_proposals (last_seen_at)
  `);
}

/** Defer the dynamic-pattern reload import to break a circular module
 *  dependency at boot (banned-phrases imports db; mining imports
 *  banned-phrases for the static list). Used by admin actions that
 *  change proposal state and need the runtime gate to see it on the
 *  next compose. */
async function refreshDynamicPatternCache(): Promise<void> {
  const { reloadDynamicBannedPatterns } = await import("./banned-phrases");
  await reloadDynamicBannedPatterns();
}

/** Sorted view of proposals for the admin UI. Active rows (not
 *  dismissed) first, ordered by severity then hit_count desc, then
 *  dismissed rows last for visibility. */
export async function listPhraseProposals(): Promise<DispatchPhraseProposal[]> {
  const rows = await db
    .select()
    .from(dispatchPhraseProposalsTable);
  // Sort in JS: it's a small table (proposals never grow past hundreds
  // of rows) and the multi-key sort is clearer here than in SQL.
  return rows.sort((a, b) => {
    // Active first.
    const aActive = a.dismissedAt === null ? 0 : 1;
    const bActive = b.dismissedAt === null ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    // Violations above warnings.
    const aSev = a.severity === "violation" ? 0 : 1;
    const bSev = b.severity === "violation" ? 0 : 1;
    if (aSev !== bSev) return aSev - bSev;
    // Higher hit_count first.
    if (a.hitCount !== b.hitCount) return b.hitCount - a.hitCount;
    // Most recent activity first.
    return b.lastSeenAt.getTime() - a.lastSeenAt.getTime();
  });
}

/** Operator dismissal — false positive. The runtime gate ignores
 *  dismissed rows on the next reload (called immediately, so the next
 *  compose sees the change without waiting for the 5-min refresh). */
export async function dismissPhraseProposal(phrase: string): Promise<boolean> {
  const result = await db
    .update(dispatchPhraseProposalsTable)
    .set({ dismissedAt: new Date() })
    .where(eq(dispatchPhraseProposalsTable.phrase, phrase))
    .returning({ phrase: dispatchPhraseProposalsTable.phrase });
  if (result.length === 0) return false;
  await refreshDynamicPatternCache();
  return true;
}

/** Undo a dismissal — operator changed their mind, or the phrase is
 *  re-emerging in worstItems. Severity is preserved. */
export async function restorePhraseProposal(phrase: string): Promise<boolean> {
  const result = await db
    .update(dispatchPhraseProposalsTable)
    .set({ dismissedAt: null })
    .where(eq(dispatchPhraseProposalsTable.phrase, phrase))
    .returning({ phrase: dispatchPhraseProposalsTable.phrase });
  if (result.length === 0) return false;
  await refreshDynamicPatternCache();
  return true;
}

/** Fire-and-forget wrapper invoked from the eval pipeline. Bundles
 *  mining + the dynamic-patterns cache refresh so next compose sees
 *  the freshly mined patterns without waiting for the periodic reload. */
export function minePhraseProposalsInBackground(): void {
  void (async () => {
    try {
      const summary = await mineBannedPhraseProposals();
      if (summary.upserted > 0 || summary.promotedToViolation > 0) {
        logger.info(summary, "Dispatch phrase mining: ran");
      }
      await refreshDynamicPatternCache();
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "Dispatch phrase mining: background run failed",
      );
    }
  })();
}
