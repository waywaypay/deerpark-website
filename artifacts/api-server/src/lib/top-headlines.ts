// Top-of-feed selection. Single source of truth for "what are the top-N
// AI headlines right now" — backs the public /api/headlines?mode=top route
// that the on-site feed renders.
//
// Pipeline:
//   1. SQL pulls candidates from the last `days` days, ≤2 per source,
//      gated by relevance_score (NULL or ≥ MIN_TOP_RELEVANCE_SCORE).
//   2. Structural filter for broad-press feeds: when the judge hasn't
//      reached an item yet (NULL score), require an entity anchor.
//   3. JS-side ranking by tier × recency decay.
//   4. Dedupe near-duplicates (cross-source coverage of the same story).
//   5. Reserve at least N slots for academic-paper sources.

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  SOURCES,
  BROAD_PRESS_SOURCES,
  EARNINGS_TRANSCRIPTS_DISPLAY_NAME,
  EARNINGS_PROMOTED_TIER,
  isEarningsDay,
} from "./headline-sources";
import {
  dedupeNearDuplicates,
  ensurePapersInSelection,
  extractOrgs,
  DEFAULT_DEDUP_THRESHOLD,
} from "./headline-rank";
import { MIN_TOP_RELEVANCE_SCORE } from "./headline-judge";

export type HeadlineRow = {
  id: number;
  source: string;
  category: string;
  title: string;
  url: string;
  publishedAt: Date;
  relevanceScore: number | null;
};

const SOURCE_TIER = new Map(SOURCES.map((s) => [s.displayName, s.tier]));
// Frontier labs (tier 1) get a 2× premium over broad-press (tier 2): a
// week-defining Anthropic/OpenAI/DeepMind announcement is categorically
// different from a press case-study, and the previous linear 4:3:2:1
// scale let a 1-day-old tier-2 marketing post (e.g. "Inside Porsche Cup
// Brasil's AI-powered race operations") beat a 3-day-old tier-1
// announcement (Anthropic's financial-services agents). 6:3:2:1 keeps
// the tier-2/3/4 gradient intact and only widens the top of the curve.
export const TIER_WEIGHTS: Record<number, number> = { 1: 6, 2: 3, 3: 2, 4: 1 };
// Half-life of 5 days against a 7-day lookback. The previous 3-day
// half-life decayed week-old originals to ~20% weight by the edge of
// the window, which made the dispatch read like "today's news" instead
// of "this week's news"; tier-1 stories from earlier in the week were
// being crowded out by fresher but lower-tier coverage.
export const HALF_LIFE_DAYS = 5;
export const PER_SOURCE_CAP_TOP = 2;
export const MIN_PAPERS_IN_SELECTION = 2;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const mapSqlRowToHeadline = (row: Record<string, unknown>): HeadlineRow => ({
  id: Number(row["id"]),
  source: String(row["source"]),
  category: String(row["category"]),
  title: String(row["title"]),
  url: String(row["url"]),
  publishedAt: new Date(row["published_at"] as string | Date),
  relevanceScore:
    row["relevance_score"] === null || row["relevance_score"] === undefined
      ? null
      : Number(row["relevance_score"]),
});

const scoreItem = (
  row: HeadlineRow,
  now: number,
  earningsDay: boolean,
): number => {
  let tier = SOURCE_TIER.get(row.source) ?? 4;
  if (earningsDay && row.source === EARNINGS_TRANSCRIPTS_DISPLAY_NAME) {
    tier = EARNINGS_PROMOTED_TIER;
  }
  const tierWeight = TIER_WEIGHTS[tier] ?? 1;
  const ageDays = Math.max(0, (now - row.publishedAt.getTime()) / MS_PER_DAY);
  const decay = Math.exp((-Math.LN2 * ageDays) / HALF_LIFE_DAYS);
  return tierWeight * decay;
};

export type SelectTopOptions = {
  /** Lookback window in days. Public route default 7. */
  days?: number;
  /** Final result size cap. */
  limit?: number;
};

/**
 * Run the full top-mode selection. Backs `/api/headlines?mode=top`, which
 * the on-site headline feed renders.
 */
export async function selectTopHeadlines(
  opts: SelectTopOptions = {},
): Promise<HeadlineRow[]> {
  const days = opts.days ?? 7;
  const limit = opts.limit ?? 10;

  // Per-source cap is doubled here so the broad-press org filter below has
  // more headroom — we still emit at most PER_SOURCE_CAP_TOP per source, but
  // the SQL needs spare candidates to swap in when the freshest item from a
  // source is dropped by the structural guards.
  const sqlPerSourceCap = PER_SOURCE_CAP_TOP * 2;

  const result = await db.execute(sql`
    WITH ranked AS (
      SELECT
        id, source, category, title, url, published_at, relevance_score,
        ROW_NUMBER() OVER (PARTITION BY source ORDER BY published_at DESC) AS rn
      FROM headlines
      WHERE published_at >= NOW() - (${days} || ' days')::interval
        AND (relevance_score IS NULL OR relevance_score >= ${MIN_TOP_RELEVANCE_SCORE})
    )
    SELECT id, source, category, title, url, published_at, relevance_score
    FROM ranked
    WHERE rn <= ${sqlPerSourceCap}
  `);

  const rawCandidates: HeadlineRow[] = result.rows.map((r) =>
    mapSqlRowToHeadline(r as Record<string, unknown>),
  );

  // Structural guard applied before ranking: broad-press items (Bloomberg,
  // Axios, etc.) must always have a named AI-org anchor. The ingest-time
  // keyword filter is too coarse — it matches the substring "ai" inside
  // common words ("captain", "fail", "again"), so plane-crash / sports /
  // weather stories occasionally leak through. Requiring an org anchor at
  // top-selection blocks them even when the LLM judge mis-scored the row.
  const candidates = rawCandidates.filter((c) => {
    if (BROAD_PRESS_SOURCES.has(c.source) && extractOrgs(c).size === 0) {
      return false;
    }
    return true;
  });

  const now = Date.now();
  const earningsDay = isEarningsDay(candidates);
  candidates.sort(
    (a, b) => scoreItem(b, now, earningsDay) - scoreItem(a, now, earningsDay),
  );

  // Re-apply the per-source cap after the SQL pull-2x: we asked for extra
  // candidates so the broad-press filter has fallback options, but the public
  // top view should still hold to PER_SOURCE_CAP_TOP per outlet so a single
  // active feed can't dominate.
  const perSourceSeen = new Map<string, number>();
  const capped = candidates.filter((c) => {
    const seen = perSourceSeen.get(c.source) ?? 0;
    if (seen >= PER_SOURCE_CAP_TOP) return false;
    perSourceSeen.set(c.source, seen + 1);
    return true;
  });

  const deduped = dedupeNearDuplicates(capped);
  const initialTop = deduped.slice(0, limit);
  const items = ensurePapersInSelection(
    initialTop,
    deduped,
    MIN_PAPERS_IN_SELECTION,
  ).sort((a, b) => scoreItem(b, now, earningsDay) - scoreItem(a, now, earningsDay));

  return items;
}

/** Constants surfaced to the admin "Headline judge" spec view. */
export function getTopSelectionSpec(): {
  tierWeights: Record<number, number>;
  halfLifeDays: number;
  perSourceCap: number;
  defaultDays: number;
  defaultLimit: number;
  dedupeThreshold: number;
  minPapers: number;
  broadPressSources: string[];
  broadPressRequiresOrg: boolean;
} {
  return {
    tierWeights: { ...TIER_WEIGHTS },
    halfLifeDays: HALF_LIFE_DAYS,
    perSourceCap: PER_SOURCE_CAP_TOP,
    defaultDays: 7,
    defaultLimit: 10,
    dedupeThreshold: DEFAULT_DEDUP_THRESHOLD,
    minPapers: MIN_PAPERS_IN_SELECTION,
    broadPressSources: Array.from(BROAD_PRESS_SOURCES),
    broadPressRequiresOrg: true,
  };
}
