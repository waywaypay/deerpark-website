import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { ingestAllSources } from "../lib/ingest-headlines";
import { selectTopHeadlines } from "../lib/top-headlines";
import { getJudgeStats, getLastRun } from "../lib/headline-judge";

const router: IRouter = Router();

type HeadlineRow = {
  id: number;
  source: string;
  category: string;
  title: string;
  url: string;
  publishedAt: Date;
  relevanceScore: number | null;
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
});

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
      // Single source of truth lives in lib/top-headlines.ts so the on-site
      // feed's "Top 10" view stays consistent across callers.
      const items = await selectTopHeadlines({ days, limit });
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
      return res.json({ items, mode, days });
    }

    // mode === "latest" — strict recency with per-source cap.
    const result = await db.execute(sql`
      WITH ranked AS (
        SELECT
          id, source, category, title, url, published_at, relevance_score,
          ROW_NUMBER() OVER (PARTITION BY source ORDER BY published_at DESC) AS rn
        FROM headlines
      )
      SELECT id, source, category, title, url, published_at, relevance_score
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
