import { Router, type IRouter } from "express";
import { db, leadsTable, headlinesTable } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { adminAuth } from "../middlewares/admin-auth";
import { SOURCES } from "../lib/headline-sources";
import { ingestAllSources, ingestSourceById } from "../lib/ingest-headlines";

const router: IRouter = Router();

router.use("/admin", adminAuth);

router.get("/admin/whoami", (_req, res) => {
  return res.json({ ok: true });
});

router.get("/admin/leads", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(leadsTable)
      .orderBy(desc(leadsTable.createdAt));
    return res.json({ items: rows, count: rows.length });
  } catch (err) {
    req.log.error({ err }, "Failed to load leads");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/agents", async (req, res) => {
  try {
    const stats = await db
      .select({
        source: headlinesTable.source,
        count: sql<number>`count(*)::int`,
        latestPublishedAt: sql<Date | null>`max(${headlinesTable.publishedAt})`,
        latestIngestedAt: sql<Date | null>`max(${headlinesTable.createdAt})`,
      })
      .from(headlinesTable)
      .groupBy(headlinesTable.source);

    const byName = new Map(stats.map((s) => [s.source, s]));

    const items = SOURCES.map((s) => {
      const stat = byName.get(s.displayName);
      return {
        id: s.id,
        displayName: s.displayName,
        category: s.category,
        kind: s.kind,
        url: s.url,
        enabled: s.enabled,
        headlineCount: stat?.count ?? 0,
        latestPublishedAt: stat?.latestPublishedAt ?? null,
        latestIngestedAt: stat?.latestIngestedAt ?? null,
      };
    });

    return res.json({ items });
  } catch (err) {
    req.log.error({ err }, "Failed to load agents");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/agents/:id", async (req, res) => {
  const id = req.params["id"];
  const source = SOURCES.find((s) => s.id === id);
  if (!source) return res.status(404).json({ error: "Unknown agent" });

  try {
    const headlines = await db
      .select({
        id: headlinesTable.id,
        title: headlinesTable.title,
        url: headlinesTable.url,
        category: headlinesTable.category,
        publishedAt: headlinesTable.publishedAt,
        createdAt: headlinesTable.createdAt,
      })
      .from(headlinesTable)
      .where(eq(headlinesTable.source, source.displayName))
      .orderBy(desc(headlinesTable.publishedAt))
      .limit(50);

    return res.json({
      agent: {
        id: source.id,
        displayName: source.displayName,
        category: source.category,
        kind: source.kind,
        url: source.url,
        enabled: source.enabled,
      },
      headlines,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to load agent detail");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/agents/ingest", async (req, res) => {
  try {
    const results = await ingestAllSources();
    return res.json({ results });
  } catch (err) {
    req.log.error({ err }, "Manual ingest-all failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/agents/:id/ingest", async (req, res) => {
  const id = req.params["id"];
  try {
    const result = await ingestSourceById(id);
    if (!result) return res.status(404).json({ error: "Unknown agent" });
    return res.json({ result });
  } catch (err) {
    req.log.error({ err, id }, "Manual single-source ingest failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
