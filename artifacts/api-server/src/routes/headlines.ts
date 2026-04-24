import { Router, type IRouter } from "express";
import { db, headlinesTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { ingestAllSources } from "../lib/ingest-headlines";

const router: IRouter = Router();

router.get("/headlines", async (req, res) => {
  const rawLimit = Number(req.query["limit"]);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 30;

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
      .orderBy(desc(headlinesTable.publishedAt))
      .limit(limit);

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
