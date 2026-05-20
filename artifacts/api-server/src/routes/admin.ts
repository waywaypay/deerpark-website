import { Router, type IRouter } from "express";
import {
  db,
  leadsTable,
  headlinesTable,
  llmUsageTable,
  postsTable,
  smsMessagesTable,
  subscribersTable,
} from "@workspace/db";
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
import {
  getModelInfo,
  getPromptSlots,
  setPromptSlot,
  resetPromptSlot,
  isValidPromptSlot,
  startWriterRun,
  getRunStatus,
  clearRunState,
  type WriterMode,
} from "../lib/writer-agent";
import {
  runDailyDigest,
  previewDailyDigest,
  getDailyDigestState,
  sendTestDigest,
} from "../lib/daily-digest";
import {
  DEFAULT_BANNER_PROMPT_TEMPLATE,
  getBannerPromptTemplate,
  setBannerPromptTemplate,
  resetBannerPromptTemplate,
} from "../lib/image-gen";
import {
  buildFineTuneDataset,
  getDispatchArchive,
  getDispatchEvalAggregates,
  listDispatchArchive,
  updateDispatchFeedback,
} from "../lib/dispatch-archive";
import { evaluateDispatch } from "../lib/dispatch-eval";
import {
  getDispatchPrompt,
  listDispatchPrompts,
  type DispatchPromptSlot,
} from "../lib/dispatch-prompts";
import { listDispatchLlmCalls } from "../lib/dispatch-llm-calls";

const router: IRouter = Router();

router.use("/admin", adminAuth);

router.get("/admin/whoami", (_req, res) => {
  return res.json({ ok: true });
});

// Aggregate Venice (LLM) spend from the unified `llm_usage` table. Every
// caller — writer-agent, judge, commentator, email polish/fallback,
// image-gen banner, sms-bot — appends a row per call, so this is the
// complete bill (including admin-UI banner previews and digest previews,
// which previously didn't show up because they don't write to posts /
// sms_messages).
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
    const [leadRows, subRows] = await Promise.all([
      db.select().from(leadsTable).orderBy(desc(leadsTable.createdAt)),
      db.select().from(subscribersTable).orderBy(desc(subscribersTable.createdAt)),
    ]);

    const items = [
      ...leadRows.map((l) => ({
        id: `lead-${l.id}`,
        source: "consultation" as const,
        sourceDetail: l.source,
        createdAt: l.createdAt,
        name: l.name,
        contact: l.contact,
        contactType: l.contactType,
        company: l.company,
        challenge: l.challenge,
        unsubscribedAt: null as Date | null,
      })),
      ...subRows.map((s) => ({
        id: `sub-${s.id}`,
        source: "dispatch" as const,
        sourceDetail: s.source,
        createdAt: s.createdAt,
        name: [s.firstName, s.lastName].filter(Boolean).join(" ") || null,
        contact: s.email,
        contactType: "email" as const,
        company: null as string | null,
        challenge: null as string | null,
        unsubscribedAt: s.unsubscribedAt,
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

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

// Judge prompt CRUD — same shape as the writer prompt editor.
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
// affects what lands in the dispatch top-10.
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
        totalPromptTokens: sql<number>`coalesce(sum(${postsTable.promptTokens}), 0)::int`,
        totalCompletionTokens: sql<number>`coalesce(sum(${postsTable.completionTokens}), 0)::int`,
        totalTokens: sql<number>`coalesce(sum(${postsTable.totalTokens}), 0)::int`,
        totalCostUsd: sql<string>`coalesce(sum(${postsTable.costUsd}::numeric), 0)::text`,
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
            "Writes a deeper analytical piece (deep dive or free pick) when the corpus supports a real angle — typically 2–3 posts/week. Aborts on thin days rather than publishing recap slop. All claims cited from corpus URLs.",
          model: info.model,
          baseUrl: info.baseUrl,
          enabled: info.configured,
          configured: info.configured,
          postCount: dailyStats?.count ?? 0,
          latestPublishedAt: dailyStats?.latestPublishedAt ?? null,
          totalPromptTokens: dailyStats?.totalPromptTokens ?? 0,
          totalCompletionTokens: dailyStats?.totalCompletionTokens ?? 0,
          totalTokens: dailyStats?.totalTokens ?? 0,
          totalCostUsd: dailyStats?.totalCostUsd ?? "0",
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

// Async kick-off: returns 202 immediately so Fly's 60s proxy timeout can't
// kill it while Claude reasons. Frontend polls /admin/writers/:id/run-status.
router.post("/admin/writers/:id/run", async (req, res) => {
  const id = req.params["id"];
  if (id !== "daily-writer") return res.status(404).json({ error: "Unknown writer" });
  const modeQuery = String(req.query["mode"] ?? "auto");
  const allowedModes: (WriterMode | "auto")[] = ["auto", "deep_dive", "free_pick", "weekly_recap"];
  const modeHint = (allowedModes as string[]).includes(modeQuery)
    ? (modeQuery as WriterMode | "auto")
    : "auto";
  try {
    const { accepted, status } = await startWriterRun({ agentId: id, modeHint });
    if (!accepted) {
      return res.status(409).json({ error: "A run is already in progress", status });
    }
    return res.status(202).json({ accepted: true, status });
  } catch (err) {
    req.log.error({ err, id }, "Failed to start writer run");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/writers/:id/run-status", async (req, res) => {
  const id = req.params["id"];
  if (id !== "daily-writer") return res.status(404).json({ error: "Unknown writer" });
  try {
    const status = await getRunStatus();
    return res.json({ status });
  } catch (err) {
    req.log.error({ err, id }, "Failed to read run status");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Manual reset for stuck state — should rarely be needed since getRunStatus
// auto-clears anything older than 5 minutes.
router.post("/admin/writers/:id/run-status/reset", async (req, res) => {
  const id = req.params["id"];
  if (id !== "daily-writer") return res.status(404).json({ error: "Unknown writer" });
  try {
    await clearRunState();
    return res.json({ ok: true });
  } catch (err) {
    req.log.error({ err, id }, "Failed to reset run state");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Per-slot prompt minimums. The base prompt carries the format/voice rules
// and must stay substantial; addenda are short framing snippets and may be
// blanked out (length 0) if the user wants the base to handle everything.
const PROMPT_MIN_LEN: Record<string, number> = {
  base: 200,
  free_pick: 0,
  deep_dive: 0,
  weekly_recap: 0,
};
const PROMPT_MAX_LEN: Record<string, number> = {
  base: 20_000,
  free_pick: 4_000,
  deep_dive: 4_000,
  weekly_recap: 4_000,
};

router.get("/admin/writers/:id/prompt", async (req, res) => {
  const id = req.params["id"];
  if (id !== "daily-writer") return res.status(404).json({ error: "Unknown writer" });
  try {
    const slots = await getPromptSlots(id);
    return res.json(slots);
  } catch (err) {
    req.log.error({ err, id }, "Failed to load prompt");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/writers/:id/prompt", async (req, res) => {
  const id = req.params["id"];
  if (id !== "daily-writer") return res.status(404).json({ error: "Unknown writer" });
  const body = req.body as { slot?: unknown; value?: unknown };
  const slot = typeof body?.slot === "string" ? body.slot : "";
  if (!isValidPromptSlot(slot)) {
    return res.status(400).json({ error: "Invalid slot (expected base | free_pick | deep_dive | weekly_recap)" });
  }
  const value = typeof body?.value === "string" ? body.value.trim() : "";
  const min = PROMPT_MIN_LEN[slot] ?? 0;
  const max = PROMPT_MAX_LEN[slot] ?? 20_000;
  if (value.length < min) {
    return res.status(400).json({ error: `Prompt too short (< ${min} chars)` });
  }
  if (value.length > max) {
    return res.status(400).json({ error: `Prompt too long (> ${max} chars)` });
  }
  try {
    await setPromptSlot(id, slot, value);
    return res.json({ ok: true });
  } catch (err) {
    req.log.error({ err, id, slot }, "Failed to save prompt");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/writers/:id/prompt", async (req, res) => {
  const id = req.params["id"];
  if (id !== "daily-writer") return res.status(404).json({ error: "Unknown writer" });
  const slot = typeof req.query["slot"] === "string" ? req.query["slot"] : "";
  if (!isValidPromptSlot(slot)) {
    return res.status(400).json({ error: "Invalid slot (expected base | free_pick | deep_dive | weekly_recap)" });
  }
  try {
    await resetPromptSlot(id, slot);
    return res.json({ ok: true });
  } catch (err) {
    req.log.error({ err, id, slot }, "Failed to reset prompt");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ============================================================================
// Manual post — bypasses the writer agent for hand-crafted dispatches.
// ============================================================================

type ManualPostBody = {
  agentId?: string;
  tag?: string;
  title?: string;
  dek?: string;
  bodyMarkdown?: string;
  mode?: string;
  citations?: unknown;
  sourceHeadlineIds?: unknown;
};

router.post("/admin/posts/manual", async (req, res) => {
  const body = (req.body ?? {}) as ManualPostBody;

  const tag = String(body.tag ?? "").trim();
  const title = String(body.title ?? "").trim();
  const dek = String(body.dek ?? "").trim();
  const bodyMarkdown = String(body.bodyMarkdown ?? "").trim();
  const agentId = String(body.agentId ?? "manual").trim() || "manual";
  const mode = body.mode === "deep_dive" ? "deep_dive" : "free_pick";
  const citations = Array.isArray(body.citations)
    ? body.citations.filter((c): c is string => typeof c === "string")
    : [];
  const sourceHeadlineIds = Array.isArray(body.sourceHeadlineIds)
    ? body.sourceHeadlineIds.filter((n): n is number => typeof n === "number")
    : [];

  if (!tag || !title || !dek || !bodyMarkdown) {
    return res.status(400).json({
      error: "tag, title, dek, and bodyMarkdown are required",
    });
  }

  try {
    const [row] = await db
      .insert(postsTable)
      .values({
        agentId,
        mode,
        tag,
        title,
        dek,
        bodyMarkdown,
        citations,
        sourceHeadlineIds,
        model: "manual",
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costUsd: "0",
      })
      .returning({ id: postsTable.id, publishedAt: postsTable.publishedAt });

    if (!row) return res.status(500).json({ error: "Insert returned no row" });
    req.log.info({ id: row.id, title }, "Manual post created");
    return res.status(201).json({ id: row.id, publishedAt: row.publishedAt });
  } catch (err) {
    req.log.error({ err }, "Failed to insert manual post");
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Internal server error",
    });
  }
});

// ============================================================================
// Daily digest — manual-run endpoint (status is public at /api/digest/status)
// ============================================================================

router.post("/admin/digest/run", async (req, res) => {
  try {
    const result = await runDailyDigest();
    if (!result) {
      return res.json({
        ok: true,
        sent: null,
        reason:
          "no-op (already sent today, no top-10 candidates, no active subscribers, or config incomplete) — see /api/digest/status",
      });
    }
    return res.json({
      ok: true,
      subject: result.subject,
      headlineCount: result.headlineCount,
      sent: result.sent,
      failed: result.failed,
      bannerGenerated: result.bannerGenerated,
      polishApplied: result.polishApplied,
      // Per-recipient outcomes — admin route, so the visibility is intentional.
      // Surfaced so the operator can see who actually got the mail.
      results: result.results,
      firstFailure: result.results.find((r) => !r.ok)?.error ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Manual digest run failed");
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  }
});

// Preview the composed top-10 email without sending. Returns subject + HTML
// so the admin UI can drop it in an iframe before bulk send.
router.get("/admin/digest/preview", async (req, res) => {
  try {
    const preview = await previewDailyDigest();
    if (!preview) {
      return res.status(409).json({
        error:
          "Cannot preview: configuration incomplete or no top-10 candidates. Check /api/digest/status.",
      });
    }
    return res.json(preview);
  } catch (err) {
    req.log.error({ err }, "Digest preview failed");
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Internal server error",
    });
  }
});

// Send a single composed top-10 email to one address. Bypasses the daily
// idempotency lock and the subscribers table so the operator can verify
// rendering + deliverability without disturbing the scheduled send.
router.post("/admin/digest/send-test", async (req, res) => {
  try {
    const to = typeof req.body?.to === "string" ? req.body.to : "";
    if (!to) return res.status(400).json({ ok: false, error: "Missing 'to' address" });
    const result = await sendTestDigest(to);
    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, "Digest send-test failed");
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// Banner-image prompt template editor. Stored in `settings` under
// `email.banner_prompt_template`. Substitutes `{{stories}}` with a
// "/"-joined string of the day's top three headline titles at send time.
router.get("/admin/email/banner-prompt", async (req, res) => {
  try {
    const { template, isCustom } = await getBannerPromptTemplate();
    return res.json({
      template,
      isCustom,
      defaultTemplate: DEFAULT_BANNER_PROMPT_TEMPLATE,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to load banner prompt template");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/email/banner-prompt", async (req, res) => {
  const body = req.body as { template?: unknown };
  const value = typeof body?.template === "string" ? body.template.trim() : "";
  if (!value) return res.status(400).json({ error: "Missing or empty template" });
  if (value.length < 20) return res.status(400).json({ error: "Template too short (< 20 chars)" });
  if (value.length > 4000) return res.status(400).json({ error: "Template too long (> 4000 chars)" });
  try {
    await setBannerPromptTemplate(value);
    return res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to save banner prompt template");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/email/banner-prompt", async (req, res) => {
  try {
    await resetBannerPromptTemplate();
    return res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to reset banner prompt template");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Dispatch archive — every composed dispatch (real send or admin test send)
// is logged here. The admin UI surfaces each row alongside a textarea for
// freeform operator feedback, which accumulates a training dataset for the
// dispatch prompt.
router.get("/admin/dispatch-archive", async (req, res) => {
  try {
    // Parse defensively — `?limit=abc` produces NaN which Math.min/max
    // propagate, and Drizzle's `.limit(NaN)` would 500. Fall back to the
    // default when the input isn't a finite integer.
    const raw = Number(req.query["limit"] ?? 50);
    const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 200) : 50;
    const items = await listDispatchArchive(limit);
    return res.json({ items });
  } catch (err) {
    req.log.error({ err }, "Failed to load dispatch archive");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Streamable JSONL export of (system, user, assistant) triples joined with
// eval metadata. Direct upload to OpenAI / Anthropic / Together fine-tune
// endpoints — they all accept the chat-completion JSONL format. Filters via
// query params let the operator slice by composite score, call kind, or
// feedback presence before downloading.
router.get("/admin/dispatch-archive/fine-tune-dataset", async (req, res) => {
  const parseNum = (v: unknown): number | null => {
    if (typeof v !== "string") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const minComposite = parseNum(req.query["minComposite"]);
  const kindParam = typeof req.query["kind"] === "string" ? req.query["kind"] : "";
  const kind: "polish" | "fallback" | "commentator" | null =
    kindParam === "polish" || kindParam === "fallback" || kindParam === "commentator"
      ? kindParam
      : null;
  const feedbackOnly = req.query["feedbackOnly"] === "true" || req.query["feedbackOnly"] === "1";
  const withMeta = req.query["withMeta"] === "true" || req.query["withMeta"] === "1";

  try {
    const dataset = await buildFineTuneDataset({
      minComposite,
      kind,
      feedbackOnly,
      withMeta,
    });
    const date = new Date().toISOString().slice(0, 10);
    const tag = [
      kind ?? "all",
      minComposite !== null ? `min${minComposite}` : null,
      feedbackOnly ? "feedback" : null,
    ]
      .filter(Boolean)
      .join("-");
    const filename = `dispatch-fine-tune-${date}-${tag}.jsonl`;
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-Dataset-Rows", String(dataset.total));
    res.setHeader("X-Dataset-Skipped", String(dataset.skipped));
    res.setHeader("X-Dataset-Skipped-By", JSON.stringify(dataset.skippedBy));
    for (const row of dataset.rows) {
      res.write(JSON.stringify(row) + "\n");
    }
    return res.end();
  } catch (err) {
    req.log.error({ err }, "Fine-tune dataset export failed");
    if (!res.headersSent) {
      return res.status(500).json({ error: "Internal server error" });
    }
    return res.end();
  }
});

// Fleet-wide eval aggregates for the admin dashboard. Single endpoint so the
// UI doesn't have to pull and re-reduce every archived row on every render —
// scales as the archive grows and surfaces fine-tuning signals (which
// prompts perform best, which dimensions to target with more training data,
// which banned phrases to mine as negatives).
router.get("/admin/dispatch-archive/eval-aggregates", async (req, res) => {
  try {
    const aggregates = await getDispatchEvalAggregates();
    return res.json(aggregates);
  } catch (err) {
    req.log.error({ err }, "Failed to load dispatch eval aggregates");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/dispatch-archive/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const row = await getDispatchArchive(id);
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json({ item: row });
  } catch (err) {
    req.log.error({ err, id }, "Failed to load dispatch archive item");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/dispatch-archive/:id/feedback", async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  const body = req.body as { feedback?: unknown };
  const feedback = typeof body?.feedback === "string" ? body.feedback : "";
  if (feedback.length > 20_000) {
    return res.status(400).json({ error: "Feedback too long (> 20k chars)" });
  }
  try {
    const row = await updateDispatchFeedback(id, feedback);
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json({
      ok: true,
      feedback: row.feedback,
      feedbackUpdatedAt: row.feedbackUpdatedAt,
    });
  } catch (err) {
    req.log.error({ err, id }, "Failed to update dispatch feedback");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Re-run the regression-guard eval (regex sweep + LLM rubric) on one
// archived dispatch. Runs synchronously so the admin UI gets fresh scores
// back in the response; ~1 LLM call.
router.post("/admin/dispatch-archive/:id/eval", async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const outcome = await evaluateDispatch(id);
    if (!outcome.ok) {
      return res.status(outcome.error === "not_found" ? 404 : 500).json(outcome);
    }
    const row = await getDispatchArchive(id);
    return res.json({
      ok: true,
      composite: outcome.composite,
      bannedCount: outcome.bannedCount,
      formattingScore: outcome.formattingScore,
      formattingIssues: outcome.formattingIssues,
      evalScores: row?.evalScores ?? null,
      evalBannedPhrases: row?.evalBannedPhrases ?? null,
      evalFormatting: row?.evalFormatting ?? null,
      evalFormattingScore: row?.evalFormattingScore ?? null,
      evalRunAt: row?.evalRunAt ?? null,
      evalModel: row?.evalModel ?? null,
    });
  } catch (err) {
    req.log.error({ err, id }, "Dispatch eval failed");
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Internal server error",
    });
  }
});

// Dispatch prompt versions — every prompt that has ever driven a
// composition. Joins to dispatch_archive via the prompt_versions jsonb
// on each archived row.
// Per-dispatch LLM trace. Returns every captured polish/fallback call
// for one archived dispatch with the raw user message + response and
// timing/token info.
router.get("/admin/dispatch-archive/:id/llm-calls", async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const items = await listDispatchLlmCalls(id);
    return res.json({ items });
  } catch (err) {
    req.log.error({ err, id }, "Failed to load dispatch LLM calls");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/dispatch-prompts", async (req, res) => {
  const slotParam = typeof req.query["slot"] === "string" ? req.query["slot"] : "";
  const allowed: DispatchPromptSlot[] = [
    "polish",
    "fallback",
    "commentator",
    "banner",
    "judge",
  ];
  const slot = (allowed as string[]).includes(slotParam)
    ? (slotParam as DispatchPromptSlot)
    : undefined;
  try {
    const items = await listDispatchPrompts(slot ? { slot } : {});
    return res.json({ items });
  } catch (err) {
    req.log.error({ err }, "Failed to list dispatch prompts");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/dispatch-prompts/:hash", async (req, res) => {
  const hash = String(req.params["hash"] ?? "").trim();
  if (!/^[0-9a-f]{8,64}$/i.test(hash)) {
    return res.status(400).json({ error: "Invalid hash" });
  }
  try {
    const row = await getDispatchPrompt(hash);
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json({ item: row });
  } catch (err) {
    req.log.error({ err, hash }, "Failed to load dispatch prompt");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/digest/state", async (req, res) => {
  try {
    const state = await getDailyDigestState();
    return res.json(state);
  } catch (err) {
    req.log.error({ err }, "Digest state failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
