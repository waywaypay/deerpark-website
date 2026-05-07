import { Router, type IRouter } from "express";
import { db, headlinesTable } from "@workspace/db";
import { inArray, sql } from "drizzle-orm";
import { ingestAllSources } from "../lib/ingest-headlines";
import {
  SOURCES,
  BROAD_PRESS_SOURCES,
  EARNINGS_TRANSCRIPTS_DISPLAY_NAME,
  EARNINGS_PROMOTED_TIER,
  isEarningsDay,
} from "../lib/headline-sources";
import {
  dedupeNearDuplicates,
  ensurePapersInSelection,
  extractOrgs,
} from "../lib/headline-rank";
import {
  MIN_TOP_RELEVANCE_SCORE,
  getJudgeStats,
  getLastRun,
} from "../lib/headline-judge";

const router: IRouter = Router();

type HeadlineRow = {
  id: number;
  source: string;
  category: string;
  title: string;
  url: string;
  publishedAt: Date;
  relevanceScore: number | null;
  commentary: string | null;
};

/** Map SQL row keys from Drizzle execute() payload to HeadlineRow. */
const mapSqlRowToHeadline = (
  row: Record<string, unknown>,
): HeadlineRow => ({
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
  commentary:
    row["commentary"] === null || row["commentary"] === undefined
      ? null
      : String(row["commentary"]),
});

const SOURCE_TIER = new Map(SOURCES.map((s) => [s.displayName, s.tier]));
// Tier 1 → weight 4, Tier 4 → weight 1. Linear by design — easy to read,
// easy to override per-row if we ever add per-headline overrides.
const TIER_WEIGHTS: Record<number, number> = { 1: 4, 2: 3, 3: 2, 4: 1 };
const HALF_LIFE_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
  const decay = Math.exp(-Math.LN2 * ageDays / HALF_LIFE_DAYS);
  return tierWeight * decay;
};

router.get("/headlines", async (req, res) => {
  const mode = req.query["mode"] === "top" ? "top" : "latest";
  const rawLimit = Number(req.query["limit"]);
  const defaultLimit = mode === "top" ? 10 : 30;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : defaultLimit;
  const rawPerSource = Number(req.query["perSource"]);
  const perSource = Number.isFinite(rawPerSource) && rawPerSource > 0
    ? Math.min(rawPerSource, 20)
    : 3;
  const rawDays = Number(req.query["days"]);
  const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(rawDays, 30) : 7;

  try {
    if (mode === "top") {
      // Weighted view: score recent items by tier × recency decay, then take
      // the top N. Pulls a tight candidate set from the last `days` days —
      // 2 per source so high-volume feeds (arXiv, HN) can't crowd out
      // weekly-cadence labs even when they're freshly published — then ranks
      // in JS so the formula stays legible and easy to tune. After ranking
      // we (1) drop near-duplicate stories so e.g. an Anthropic release plus
      // Bloomberg's coverage of it don't both land in the top, and
      // (2) reserve at least 2 slots for academic papers (arXiv, HF Papers)
      // so an active lab-publishing week doesn't crowd research out entirely.
      //
      // Quality gate: drop rows whose LLM-judged relevance_score is below
      // MIN_TOP_RELEVANCE_SCORE. The keyword filter at ingest is too coarse
      // (it lets through e.g. a gardening post from blog.google because the
      // title says "model"); the per-item LLM score is the second pass.
      // NULL scores pass through so unjudged items still appear if the
      // judge is unconfigured or behind on a fresh ingest.
      const result = await db.execute(sql`
        WITH ranked AS (
          SELECT
            id, source, category, title, url, published_at, relevance_score, commentary,
            ROW_NUMBER() OVER (PARTITION BY source ORDER BY published_at DESC) AS rn
          FROM headlines
          WHERE published_at >= NOW() - (${days} || ' days')::interval
            AND (relevance_score IS NULL OR relevance_score >= ${MIN_TOP_RELEVANCE_SCORE})
        )
        SELECT id, source, category, title, url, published_at, relevance_score, commentary
        FROM ranked
        WHERE rn <= 2
      `);
      const rawCandidates: HeadlineRow[] = result.rows.map((r) =>
        mapSqlRowToHeadline(r as Record<string, unknown>),
      );
      // Structural guard for broad-press feeds (Bloomberg Tech, The
      // Information, Axios Tech, CIO Dive, SAP Newsroom). When the LLM
      // judge has already scored an item, trust the score — the SQL gate
      // already enforces relevance_score >= MIN_TOP_RELEVANCE_SCORE for
      // non-NULL rows. When the judge hasn't reached the row yet
      // (relevance_score IS NULL — common during ingest backlogs or rate-
      // limit storms), require the title/URL to anchor on a named entity
      // from extractOrgs(); otherwise drop. This keeps macro-trend
      // clickbait like "AI Boom Drives Earnings Growth" out of the top-10
      // until the judge catches up to score it explicitly.
      const candidates = rawCandidates.filter((c) => {
        if (c.relevanceScore !== null) return true;
        if (!BROAD_PRESS_SOURCES.has(c.source)) return true;
        return extractOrgs(c).size > 0;
      });
      const now = Date.now();
      const earningsDay = isEarningsDay(candidates);
      candidates.sort(
        (a, b) =>
          scoreItem(b, now, earningsDay) - scoreItem(a, now, earningsDay),
      );
      const deduped = dedupeNearDuplicates(candidates);
      const initialTop = deduped.slice(0, limit);
      const items = ensurePapersInSelection(initialTop, deduped, 2)
        .sort((a, b) => scoreItem(b, now, earningsDay) - scoreItem(a, now, earningsDay));
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
      return res.json({ items, mode, days });
    }

    // mode === "latest" — strict recency with per-source cap.
    const result = await db.execute(sql`
      WITH ranked AS (
        SELECT
          id, source, category, title, url, published_at, relevance_score, commentary,
          ROW_NUMBER() OVER (PARTITION BY source ORDER BY published_at DESC) AS rn
        FROM headlines
      )
      SELECT id, source, category, title, url, published_at, relevance_score, commentary
      FROM ranked
      WHERE rn <= ${perSource}
      ORDER BY published_at DESC
      LIMIT ${limit}
    `);
    const items: HeadlineRow[] = result.rows.map((r) =>
      mapSqlRowToHeadline(r as Record<string, unknown>),
    );
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
    return res.json({ items, mode });
  } catch (err) {
    req.log.error({ err }, "Failed to load headlines");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Lookup a small batch of headlines by ID. Used by the dispatch post detail
// page to render "Reacting to" — the headlines this post cited.
router.get("/headlines/by-ids", async (req, res) => {
  const raw = String(req.query["ids"] ?? "");
  const ids = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, 25);

  if (ids.length === 0) {
    return res.json({ items: [] });
  }

  try {
    const rows = await db
      .select({
        id: headlinesTable.id,
        source: headlinesTable.source,
        category: headlinesTable.category,
        title: headlinesTable.title,
        url: headlinesTable.url,
        publishedAt: headlinesTable.publishedAt,
      })
      .from(headlinesTable)
      .where(inArray(headlinesTable.id, ids));

    // Preserve caller-specified order (lets the writer agent rank citations).
    const order = new Map(ids.map((id, idx) => [id, idx]));
    rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=900");
    return res.json({ items: rows });
  } catch (err) {
    req.log.error({ err }, "Failed to load headlines by ids");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Public read-only judge status. Returns counts of scored/unscored items
// in the lookback window, the last-run summary (timestamp, batches, errors,
// model), and lowest+highest 10 scores for spot-checking. Same data shape
// is already implicit in /api/headlines (which exposes scores per item),
// so there's no leak risk in keeping this unauthenticated.
router.get("/headlines/judge-status", async (_req, res) => {
  try {
    const [stats, lastRun] = await Promise.all([getJudgeStats(), getLastRun()]);
    res.setHeader("Cache-Control", "public, max-age=10, s-maxage=10");
    return res.json({ stats, lastRun });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Internal server error",
    });
  }
});

// Manual trigger for ops / debugging. Protect behind INGEST_SECRET in env.
router.post("/headlines/ingest", async (req, res) => {
  const secret = process.env["INGEST_SECRET"];
  const provided = req.headers["x-ingest-secret"];
  if (!secret || provided !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const results = await ingestAllSources();
    return res.json({ results });
  } catch (err) {
    req.log.error({ err }, "Manual ingest failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
