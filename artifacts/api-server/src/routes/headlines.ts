import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { ingestAllSources } from "../lib/ingest-headlines";

const router: IRouter = Router();

type HeadlineRow = {
  id: number;
  source: string;
  category: string;
  title: string;
  url: string;
  publishedAt: Date;
};

router.get("/headlines", async (req, res) => {
  const rawLimit = Number(req.query["limit"]);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 30;
  const rawPerSource = Number(req.query["perSource"]);
  const perSource = Number.isFinite(rawPerSource) && rawPerSource > 0
    ? Math.min(rawPerSource, 20)
    : 3;

  try {
    // Cap each source to its N most recent items so high-volume feeds (Hacker
    // News, TechCrunch) don't drown out labs that post weekly. Postgres
    // ROW_NUMBER OVER (PARTITION BY source) does the per-source ranking; the
    // outer query then sorts the surviving rows by recency.
    const result = await db.execute(sql`
      WITH ranked AS (
        SELECT
          id,
          source,
          category,
          title,
          url,
          published_at,
          ROW_NUMBER() OVER (PARTITION BY source ORDER BY published_at DESC) AS rn
        FROM headlines
      )
      SELECT id, source, category, title, url, published_at
      FROM ranked
      WHERE rn <= ${perSource}
      ORDER BY published_at DESC
      LIMIT ${limit}
    `);

    const rows: HeadlineRow[] = result.rows.map((r) => ({
      id: Number(r["id"]),
      source: String(r["source"]),
      category: String(r["category"]),
      title: String(r["title"]),
      url: String(r["url"]),
      publishedAt: new Date(r["published_at"] as string | Date),
    }));

    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
    return res.json({ items: rows });
  } catch (err) {
    req.log.error({ err }, "Failed to load headlines");
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
