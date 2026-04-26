import { Router, type IRouter } from "express";
import { db, leadsTable, headlinesTable, postsTable } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { adminAuth } from "../middlewares/admin-auth";
import { SOURCES } from "../lib/headline-sources";
import { ingestAllSources, ingestSourceById } from "../lib/ingest-headlines";
import {
  generateAndSavePost,
  getModelInfo,
  getSystemPrompt,
  setSystemPrompt,
  resetSystemPrompt,
  DEFAULT_SYSTEM_PROMPT,
  type WriterMode,
} from "../lib/writer-agent";

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

// Writer agents — currently a single "Daily Writer" backed by Anthropic.
// Surfacing as a list keeps the admin UI scaffold consistent and leaves room
// for additional writers (different angles, target audiences) later.
router.get("/admin/writers", async (req, res) => {
  const info = getModelInfo();
  try {
    const stats = await db
      .select({
        agentId: postsTable.agentId,
        count: sql<number>`count(*)::int`,
        latestPublishedAt: sql<Date | null>`max(${postsTable.publishedAt})`,
      })
      .from(postsTable)
      .groupBy(postsTable.agentId);
    const byId = new Map(stats.map((s) => [s.agentId, s]));
    const dailyStats = byId.get("daily-writer");
    return res.json({
      items: [
        {
          id: "daily-writer",
          displayName: "Daily Writer",
          description:
            "Writes one post per day from the rolling 7-day headline corpus. Picks digest, deep dive, or free pick at its discretion. All claims must be cited from corpus URLs.",
          model: info.model,
          baseUrl: info.baseUrl,
          enabled: info.configured,
          configured: info.configured,
          postCount: dailyStats?.count ?? 0,
          latestPublishedAt: dailyStats?.latestPublishedAt ?? null,
        },
      ],
    });
  } catch (err) {
    req.log.error({ err }, "Failed to load writer agents");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/posts", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(postsTable)
      .orderBy(desc(postsTable.publishedAt))
      .limit(50);
    return res.json({ items: rows });
  } catch (err) {
    req.log.error({ err }, "Failed to load posts");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/writers/:id/run", async (req, res) => {
  const id = req.params["id"];
  if (id !== "daily-writer") return res.status(404).json({ error: "Unknown writer" });
  const modeQuery = String(req.query["mode"] ?? "auto");
  const allowedModes: (WriterMode | "auto")[] = ["auto", "digest", "deep_dive", "free_pick"];
  const modeHint = (allowedModes as string[]).includes(modeQuery)
    ? (modeQuery as WriterMode | "auto")
    : "auto";
  try {
    const result = await generateAndSavePost({ agentId: id, modeHint });
    if (!result.ok) return res.status(422).json({ error: result.error });
    return res.json({ postId: result.postId, draft: result.draft });
  } catch (err) {
    req.log.error({ err, id }, "Manual writer run failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/writers/:id/prompt", async (req, res) => {
  const id = req.params["id"];
  if (id !== "daily-writer") return res.status(404).json({ error: "Unknown writer" });
  try {
    const { prompt, isCustom } = await getSystemPrompt(id);
    return res.json({
      prompt,
      isCustom,
      defaultPrompt: DEFAULT_SYSTEM_PROMPT,
    });
  } catch (err) {
    req.log.error({ err, id }, "Failed to load prompt");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/writers/:id/prompt", async (req, res) => {
  const id = req.params["id"];
  if (id !== "daily-writer") return res.status(404).json({ error: "Unknown writer" });
  const body = req.body as { prompt?: unknown };
  const value = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!value) return res.status(400).json({ error: "Missing or empty prompt" });
  if (value.length < 200) return res.status(400).json({ error: "Prompt too short (< 200 chars)" });
  if (value.length > 20_000) return res.status(400).json({ error: "Prompt too long (> 20k chars)" });
  try {
    await setSystemPrompt(id, value);
    return res.json({ ok: true });
  } catch (err) {
    req.log.error({ err, id }, "Failed to save prompt");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/writers/:id/prompt", async (req, res) => {
  const id = req.params["id"];
  if (id !== "daily-writer") return res.status(404).json({ error: "Unknown writer" });
  try {
    await resetSystemPrompt(id);
    return res.json({ ok: true });
  } catch (err) {
    req.log.error({ err, id }, "Failed to reset prompt");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
