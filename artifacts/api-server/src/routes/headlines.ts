import { Router, type IRouter } from "express";
import { db, headlinesTable, postsTable } from "@workspace/db";
import { desc, inArray, sql } from "drizzle-orm";
import { ingestAllSources } from "../lib/ingest-headlines";
import {
  SOURCES,
  EARNINGS_TRANSCRIPTS_DISPLAY_NAME,
  EARNINGS_PROMOTED_TIER,
  isEarningsDay,
} from "../lib/headline-sources";

const router: IRouter = Router();

type HeadlineRow = {
  id: number;
  source: string;
  category: string;
  title: string;
  url: string;
  publishedAt: Date;
};

type CoveredBy = {
  postId: number;
  postTitle: string;
  publishedAt: string;
};

// Build a map of headlineId → most-recent dispatch post that cited it.
// We pull the recent post window once, then JS-join in memory — avoids a
// jsonb_array_elements correlated subquery and keeps the SQL legible.
async function loadCoveredByMap(days: number): Promise<Map<number, CoveredBy>> {
  const recentPosts = await db
    .select({
      id: postsTable.id,
      title: postsTable.title,
      sourceHeadlineIds: postsTable.sourceHeadlineIds,
      publishedAt: postsTable.publishedAt,
    })
    .from(postsTable)
    .where(sql`${postsTable.publishedAt} >= NOW() - (${days} || ' days')::interval`)
    .orderBy(desc(postsTable.publishedAt));

  const map = new Map<number, CoveredBy>();
  for (const p of recentPosts) {
    for (const hid of p.sourceHeadlineIds ?? []) {
      // First write wins because we iterate newest-first.
      if (!map.has(hid)) {
        map.set(hid, {
          postId: p.id,
          postTitle: p.title,
          publishedAt: p.publishedAt.toISOString(),
        });
      }
    }
  }
  return map;
}

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
      // in JS so the formula stays legible and easy to tune.
      const result = await db.execute(sql`
        WITH ranked AS (
          SELECT
            id, source, category, title, url, published_at,
            ROW_NUMBER() OVER (PARTITION BY source ORDER BY published_at DESC) AS rn
          FROM headlines
          WHERE published_at >= NOW() - (${days} || ' days')::interval
        )
        SELECT id, source, category, title, url, published_at
        FROM ranked
        WHERE rn <= 2
      `);
      const candidates: HeadlineRow[] = result.rows.map((r) => ({
        id: Number(r["id"]),
        source: String(r["source"]),
        category: String(r["category"]),
        title: String(r["title"]),
        url: String(r["url"]),
        publishedAt: new Date(r["published_at"] as string | Date),
      }));
      const now = Date.now();
      const earningsDay = isEarningsDay(candidates);
      candidates.sort(
        (a, b) =>
          scoreItem(b, now, earningsDay) - scoreItem(a, now, earningsDay),
      );
      const rows = candidates.slice(0, limit);
      const coveredBy = await loadCoveredByMap(30);
      const items = rows.map((r) => ({ ...r, coveredBy: coveredBy.get(r.id) ?? null }));
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
      return res.json({ items, mode, days });
    }

    // mode === "latest" — strict recency with per-source cap.
    const result = await db.execute(sql`
      WITH ranked AS (
        SELECT
          id, source, category, title, url, published_at,
          ROW_NUMBER() OVER (PARTITION BY source ORDER BY published_at DESC) AS rn
        FROM headlines
      )
      SELECT id, source, category, title, url, published_at
      FROM ranked
      WHERE rn <= ${perSource}
      ORDER BY published_at DESC
      LIMIT ${limit}
    `);
    const rows: HeadlineRow[] = result.rows.map((r) =>
      mapSqlRowToHeadline(r as Record<string, unknown>),
    );
    const coveredBy = await loadCoveredByMap(30);
    const items = rows.map((r) => ({ ...r, coveredBy: coveredBy.get(r.id) ?? null }));
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
