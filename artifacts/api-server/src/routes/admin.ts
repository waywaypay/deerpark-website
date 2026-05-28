import { Router, type IRouter } from "express";
import { db, leadsTable, headlinesTable, llmUsageTable } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { adminAuth } from "../middlewares/admin-auth";
import { SOURCES } from "../lib/headline-sources";
import { ingestAllSources, ingestSourceById } from "../lib/ingest-headlines";
import {
  scoreUnscoredHeadlines,
  clearScoresInLookback,
  getJudgeStats,
  getJudgePrompt,
  setJudgePrompt,
  resetJudgePrompt,
  getJudgeRuntimeInfo,
  getLastRun as getJudgeLastRun,
  DEFAULT_JUDGE_SYSTEM_PROMPT,
  MIN_TOP_RELEVANCE_SCORE,
  JUDGE_LOOKBACK_DAYS,
  BATCH_SIZE as JUDGE_BATCH_SIZE,
  ERROR_STREAK_BREAK as JUDGE_ERROR_STREAK_BREAK,
} from "../lib/headline-judge";
import { getTopSelectionSpec } from "../lib/top-headlines";

const router: IRouter = Router();

router.use("/admin", adminAuth);

router.get("/admin/whoami", (_req, res) => {
  return res.json({ ok: true });
});

// Aggregate Venice (LLM) spend from the unified `llm_usage` table. Every
// caller — judge, sms-bot — appends a row per call, so this is the complete
// bill across the AI agents that remain in the pipeline.
router.get("/admin/usage/venice", async (req, res) => {
  try {
    const rows = await db
      .select({
        caller: llmUsageTable.caller,
        promptTokens: sql<string>`coalesce(sum(${llmUsageTable.promptTokens}), 0)::text`,
        completionTokens: sql<string>`coalesce(sum(${llmUsageTable.completionTokens}), 0)::text`,
        totalTokens: sql<string>`coalesce(sum(${llmUsageTable.totalTokens}), 0)::text`,
        costUsd: sql<string>`coalesce(sum(${llmUsageTable.costUsd}), 0)::text`,
        callCount: sql<number>`count(*)::int`,
      })
      .from(llmUsageTable)
      .groupBy(llmUsageTable.caller);

    type Bucket = {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      costUsd: number;
      callCount: number;
    };
    const empty = (): Bucket => ({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      callCount: 0,
    });

    const breakdown: Record<string, Bucket> = {};
    const total = empty();
    for (const r of rows) {
      const bucket: Bucket = {
        promptTokens: Number(r.promptTokens ?? 0),
        completionTokens: Number(r.completionTokens ?? 0),
        totalTokens: Number(r.totalTokens ?? 0),
        costUsd: Number(r.costUsd ?? 0),
        callCount: Number(r.callCount ?? 0),
      };
      breakdown[r.caller] = bucket;
      total.promptTokens += bucket.promptTokens;
      total.completionTokens += bucket.completionTokens;
      total.totalTokens += bucket.totalTokens;
      total.costUsd += bucket.costUsd;
      total.callCount += bucket.callCount;
    }

    return res.json({
      total,
      breakdown,
      note: "Aggregated from llm_usage. Every Venice caller logs one row per call (chat or image).",
    });
  } catch (err) {
    req.log.error({ err }, "Venice usage aggregation failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/leads", async (req, res) => {
  try {
    const leadRows = await db
      .select()
      .from(leadsTable)
      .orderBy(desc(leadsTable.createdAt));

    const items = leadRows.map((l) => ({
      id: `lead-${l.id}`,
      source: "consultation" as const,
      sourceDetail: l.source,
      createdAt: l.createdAt,
      name: l.name,
      contact: l.contact,
      contactType: l.contactType,
      company: l.company,
      challenge: l.challenge,
    }));

    return res.json({ items, count: items.length });
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

// Judge diagnostics: counts of scored/unscored in the lookback window plus
// the lowest/highest 10 — quickest way to see whether the prompt is doing
// what we expect.
router.get("/admin/judge/stats", async (req, res) => {
  try {
    const stats = await getJudgeStats();
    return res.json(stats);
  } catch (err) {
    req.log.error({ err }, "Judge stats failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Force-rescore the lookback window: clears existing scores then re-runs the
// judge. Use after tuning the prompt or threshold. Synchronous so the caller
// gets the run summary back; ~6 LLM calls for a typical 14-day window.
router.post("/admin/judge/rescore", async (req, res) => {
  try {
    const cleared = await clearScoresInLookback();
    const summary = await scoreUnscoredHeadlines();
    return res.json({ cleared, summary });
  } catch (err) {
    req.log.error({ err }, "Judge rescore failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Judge prompt CRUD.
router.get("/admin/judge/prompt", async (req, res) => {
  try {
    const { prompt, isCustom } = await getJudgePrompt();
    return res.json({
      prompt,
      isCustom,
      defaultPrompt: DEFAULT_JUDGE_SYSTEM_PROMPT,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to load judge prompt");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/judge/prompt", async (req, res) => {
  const body = req.body as { prompt?: unknown };
  const value = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!value) return res.status(400).json({ error: "Missing or empty prompt" });
  if (value.length < 200) return res.status(400).json({ error: "Prompt too short (< 200 chars)" });
  if (value.length > 20_000) return res.status(400).json({ error: "Prompt too long (> 20k chars)" });
  try {
    await setJudgePrompt(value);
    return res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to save judge prompt");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/judge/prompt", async (req, res) => {
  try {
    await resetJudgePrompt();
    return res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to reset judge prompt");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Full top-10 specification: judge config + selection algorithm + last run
// + sample bands. Lets the operator see, in one place, every knob that
// affects what lands in the on-site top-10 feed.
router.get("/admin/judge/spec", async (req, res) => {
  try {
    const runtime = getJudgeRuntimeInfo();
    const [stats, lastRun] = await Promise.all([getJudgeStats(), getJudgeLastRun()]);
    return res.json({
      judge: {
        model: runtime.model,
        baseUrl: runtime.baseUrl,
        configured: runtime.configured,
        minTopRelevanceScore: MIN_TOP_RELEVANCE_SCORE,
        judgeLookbackDays: JUDGE_LOOKBACK_DAYS,
        batchSize: JUDGE_BATCH_SIZE,
        errorStreakBreak: JUDGE_ERROR_STREAK_BREAK,
      },
      topSelection: getTopSelectionSpec(),
      lastRun,
      stats,
    });
  } catch (err) {
    req.log.error({ err }, "Judge spec failed");
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
