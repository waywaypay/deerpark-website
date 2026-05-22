// Few-shot exemplar rotator. Pulls per-item briefs from the highest-
// composite-scoring recent dispatches and exposes them to the
// headline-commentator (and any future writer-side caller) as positive
// anchors. The symmetric counterpart to dispatch-phrase-mining: that
// module learns "what not to write" from worst-items quotes; this one
// surfaces "what good looks like" from top-scoring items.
//
// Cache TTL is generous — these are quality anchors, not real-time
// data, and the underlying corpus only changes when a new dispatch is
// archived and eval'd (twice a week).
//
// Injection point: the *user* message of generator calls (commentator
// + writer), not the system prompt. Keeping examples out of the
// content-addressed prompt hash means the prompt version stays stable
// while the exemplars rotate per send — readers of `eval_scores` by
// prompt version still get clean groupings.

import { db, dispatchArchiveTable } from "@workspace/db";
import { and, desc, gte, isNotNull, sql } from "drizzle-orm";
import { logger } from "./logger";

// Look back this far when ranking. Older "good" dispatches are stylistically
// drifted from the current prompt and a poor anchor.
const LOOKBACK_DAYS = 45;

// Only sample from dispatches whose composite cleared this floor. Below
// the floor, the worstItems-flagged items aren't reliable negative
// signal AND the rest isn't reliable positive signal either.
const MIN_COMPOSITE_FOR_EXAMPLES = 6.5;

const CACHE_TTL_MS = 60 * 60_000;

export type BestExample = {
  source: string;
  title: string;
  /** Plain commentary text — the bolded lead clause uses markdown
   *  asterisks the same way generator output does. */
  commentary: string;
  /** Composite score of the parent dispatch — included so callers can
   *  show provenance ("from a 7.4 dispatch") if useful. */
  parentComposite: number;
};

type CachedSet = {
  examples: BestExample[];
  loadedAt: number;
};

let cache: CachedSet | null = null;

function isFresh(c: CachedSet | null): c is CachedSet {
  return c !== null && Date.now() - c.loadedAt < CACHE_TTL_MS;
}

async function loadBestExamples(maxExamples: number): Promise<BestExample[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60_000);
  const rows = await db
    .select({
      composite: dispatchArchiveTable.evalCompositeScore,
      evalScores: dispatchArchiveTable.evalScores,
      items: dispatchArchiveTable.headlinesSnapshot,
    })
    .from(dispatchArchiveTable)
    .where(
      and(
        isNotNull(dispatchArchiveTable.evalCompositeScore),
        isNotNull(dispatchArchiveTable.evalScores),
        gte(dispatchArchiveTable.createdAt, since),
        // Use SQL filter on the numeric for the floor — keeps the
        // candidate set small.
        sql`${dispatchArchiveTable.evalCompositeScore} >= ${MIN_COMPOSITE_FOR_EXAMPLES}`,
      ),
    )
    .orderBy(desc(dispatchArchiveTable.evalCompositeScore))
    .limit(6);

  // For each candidate dispatch, exclude items the rubric flagged as
  // worst (any dimension) — even in a high-composite dispatch, a few
  // items pulled the average down. Then pick items with non-trivial
  // commentary length.
  const out: BestExample[] = [];
  for (const row of rows) {
    const compositeStr = row.composite;
    if (compositeStr === null) continue;
    const composite = Number(compositeStr);
    if (!Number.isFinite(composite)) continue;

    // headlinesSnapshot is 0-indexed in code but the rubric reports
    // 1-indexed item numbers (intro = 0, items 1..N). Map to indices
    // into the snapshot. Skip the intro — exemplars are per-item only.
    const flaggedItems = new Set<number>();
    const scores = row.evalScores;
    if (scores) {
      for (const dim of Object.values(scores)) {
        for (const wi of dim.worstItems ?? []) {
          if (typeof wi.item === "number") flaggedItems.add(wi.item);
        }
      }
    }
    const items = row.items ?? [];
    for (let i = 0; i < items.length; i++) {
      // wi.item uses 1-based numbering for body items.
      const oneBased = i + 1;
      if (flaggedItems.has(oneBased)) continue;
      const it = items[i]!;
      const commentary = (it.commentary ?? "").trim();
      if (commentary.length < 80) continue;
      if (commentary.length > 600) continue;
      out.push({
        source: it.source,
        title: it.title,
        commentary,
        parentComposite: composite,
      });
      if (out.length >= maxExamples) break;
    }
    if (out.length >= maxExamples) break;
  }
  return out;
}

/**
 * Return up to N high-quality per-item exemplars from recent
 * high-composite dispatches. Cached for an hour. Returns an empty array
 * if no dispatch has cleared the floor yet — callers fall through to
 * the static examples already in their prompts.
 */
export async function getRecentBestExamples(
  maxExamples = 3,
): Promise<BestExample[]> {
  if (isFresh(cache) && cache.examples.length >= maxExamples) {
    return cache.examples.slice(0, maxExamples);
  }
  try {
    const examples = await loadBestExamples(maxExamples);
    cache = { examples, loadedAt: Date.now() };
    return examples;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Dispatch best examples: load failed",
    );
    return cache?.examples ?? [];
  }
}

/** Force a refresh of the cache. Called after a new dispatch eval lands
 *  so the next compose sees fresh exemplars. */
export function invalidateBestExamplesCache(): void {
  cache = null;
}

/** Format exemplars as a block suitable for prepending to a generator's
 *  user message. Empty string when there are no exemplars yet — callers
 *  can paste unconditionally. */
export function formatBestExamplesBlock(examples: BestExample[]): string {
  if (examples.length === 0) return "";
  const lines: string[] = [
    "RECENT TOP-SCORING EXAMPLES — anchor register and rhythm against these (drawn from past dispatches that scored well on the rubric). Don't copy structure literally; vary lead verb and lens.",
    "",
  ];
  for (const ex of examples) {
    lines.push(`— Source: ${ex.source}`);
    lines.push(`  Headline: ${ex.title}`);
    lines.push(`  Brief: ${ex.commentary}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
