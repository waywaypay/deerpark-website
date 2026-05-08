// Per-headline relevance judge. The keyword AI-filter (`AI_KEYWORDS` in
// ingest-headlines) is a coarse first pass — it lets through gardening posts
// from blog.google's "ai" feed when "model" appears in the title, and waves
// through Bloomberg clickbait whose title happens to contain "AI". This judge
// is the second pass: an LLM scores each headline 0–100 on AI signal value,
// the score persists to `headlines.relevance_score`, and the top-mode route
// drops anything below `MIN_TOP_RELEVANCE_SCORE`.
//
// Cost shape: scoring is one-time per headline (we only re-judge rows where
// `relevance_score IS NULL`), batched 25 at a time, against whichever LLM the
// rest of the server is configured for. With ~150 new items/day across all
// sources, we make ~6 calls/day for this — negligible vs the writer agent.

import OpenAI from "openai";
import { db, headlinesTable, settingsTable } from "@workspace/db";
import { and, isNull, gte, eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import { logUsage } from "./llm-usage";

// settings-table key for the most recent judge run summary. Persisted so
// `/api/headlines/judge-status` can surface what happened on the last run
// without scraping Fly logs.
const LAST_RUN_SETTINGS_KEY = "headline_judge.last_run";

// Anything below this is dropped from the "top" view. NULL (un-judged) rows
// pass through so a missing/misconfigured judge doesn't empty the feed.
export const MIN_TOP_RELEVANCE_SCORE = 40;

// We only consider rows newer than this for judging — older rows aren't
// worth a model call since the top-view only looks at the last 7 days.
export const JUDGE_LOOKBACK_DAYS = 14;

// Batch size for one LLM call. Smaller is better when the model is a
// reasoning Claude on Venice — reasoning_content burns the same max_tokens
// budget as the visible output, so a smaller batch leaves headroom.
export const BATCH_SIZE = 10;

// Stop after this many back-to-back batch failures of any kind. Venice's
// "20 failed requests in 30 seconds" abuse guard cascades — once tripped,
// every subsequent call returns 429, and the OpenAI SDK's default 2x retry
// (which we disable below) used to multiply wasted attempts further. Bail
// fast and let the next ingest tick retry after the cooldown clears.
// Counts ANY error (429, timeout, parse, network) — they all signal
// "Venice/this batch is unhappy right now."
export const ERROR_STREAK_BREAK = 3;

// Default base URL mirrors writer-agent so a single LLM_API_KEY works for
// both. The judge is a classifier, not a writer — it benefits from a
// cheap/fast Haiku-class model and from running on a different rate-limit
// bucket than the writer. We deliberately do NOT fall through to LLM_MODEL
// (which is typically a heavier Sonnet-class model for the writer);
// inheriting it puts the judge in the same per-minute bucket as the
// writer and amplifies cascading 429s.
const DEFAULT_BASE_URL = "https://api.venice.ai/api/v1";
// Venice removed Anthropic models from its catalog, so `claude-haiku-*`
// no longer resolves on /chat/completions and the judge silently stopped
// scoring (relevance_score stays NULL on every row, which then cascades
// into the commentator + email path). gpt-4o-mini is the closest swap.
const DEFAULT_MODEL = "openai-gpt-4o-mini-2024-07-18";

export const DEFAULT_JUDGE_SYSTEM_PROMPT = `You score AI/tech news headlines for an enterprise-AI briefing.

Each headline is one of:
  RELEVANT — a model release, paper, eval, infra, M&A, exec move, earnings, or product announcement that matters to enterprise AI buyers/operators.
  IRRELEVANT — anything else: lifestyle, gardening, sports, generic business, consumer reviews, off-topic press from a broad-tech feed.
  CLICKBAIT — about AI/tech but written as outrage/listicle/celebrity/rumor with no concrete development. "X person SLAMS Y", "5 things you need to know", "is X dead?".

Score each item 0-100:
  90-100 = original-source release from a frontier lab, eval result, or hard news with named companies and specifics
  70-89  = solid coverage of a real development, reputable publisher, concrete enough to act on
  50-69  = on-topic but thin: rumor, opinion column, generic explainer, low-stakes product news
  20-49  = clickbait or weakly-AI-related (mentions AI in passing, no real development)
  0-19   = irrelevant (gardening, lifestyle, sports, off-topic), even if the source is a broad-tech feed

Return ONLY this JSON, no prose:
{ "scores": [{ "id": <number>, "score": <0-100> }, ...] }

One entry per input id. No omissions. No extra ids.`;

const PROMPT_SETTINGS_KEY = "judge.headline.system_prompt";

export async function getJudgePrompt(): Promise<{ prompt: string; isCustom: boolean }> {
  const [row] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, PROMPT_SETTINGS_KEY))
    .limit(1);
  if (row?.value) return { prompt: row.value, isCustom: true };
  return { prompt: DEFAULT_JUDGE_SYSTEM_PROMPT, isCustom: false };
}

export async function setJudgePrompt(value: string): Promise<void> {
  await db
    .insert(settingsTable)
    .values({ key: PROMPT_SETTINGS_KEY, value })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function resetJudgePrompt(): Promise<void> {
  await db.delete(settingsTable).where(eq(settingsTable.key, PROMPT_SETTINGS_KEY));
}

type JudgeInput = {
  id: number;
  source: string;
  title: string;
};

type RawScore = { id: unknown; score: unknown };
type ParsedScores = Map<number, number>;

export function getJudgeRuntimeInfo(): {
  model: string;
  baseUrl: string;
  configured: boolean;
} {
  const apiKey = process.env["LLM_API_KEY"];
  const baseUrl = process.env["LLM_BASE_URL"] ?? DEFAULT_BASE_URL;
  const model = process.env["JUDGE_MODEL"] ?? DEFAULT_MODEL;
  return { model, baseUrl, configured: Boolean(apiKey) };
}

function getClient(): { client: OpenAI; model: string } | null {
  const apiKey = process.env["LLM_API_KEY"];
  if (!apiKey) return null;
  const baseURL = process.env["LLM_BASE_URL"] ?? DEFAULT_BASE_URL;
  // Don't cascade through LLM_MODEL — see DEFAULT_MODEL comment above.
  // JUDGE_MODEL is the explicit override; default to haiku otherwise.
  const model = process.env["JUDGE_MODEL"] ?? DEFAULT_MODEL;
  // 4 min per call. Reasoning-Claude burns most of the budget thinking
  // before emitting JSON; 60s wasn't enough to ride out a cold model. The
  // writer-agent uses 8 min for a much larger prompt — half that is plenty
  // here. If a provider hangs past this, we abandon the batch and the next
  // ingest tick re-tries the still-NULL rows.
  //
  // maxRetries: 0 disables the OpenAI SDK's default 2x retry. With retries
  // on, a single failing batch is actually 3 HTTP calls — so 3 batches
  // become 9 calls and pile straight into Venice's "20 failed in 30s"
  // abuse threshold. The streak break below handles backoff at the run
  // level; per-call retries only multiply the damage.
  const client = new OpenAI({ apiKey, baseURL, timeout: 4 * 60_000, maxRetries: 0 });
  return { client, model };
}

function formatBatch(items: JudgeInput[]): string {
  // Source name on the same line as the title so the model can use source
  // tier as a prior (a Bloomberg headline is more likely real news than HN).
  return items
    .map((it) => `id=${it.id}  [${it.source}]  ${it.title}`)
    .join("\n");
}

function parseScores(text: string, expectedIds: Set<number>): ParsedScores {
  const out = new Map<number, number>();
  // Locate the JSON object — providers occasionally wrap it in fences or
  // emit a leading sentence. Brace-balanced scan is the robust path.
  const start = text.indexOf("{");
  if (start === -1) return out;
  let depth = 0;
  let end = -1;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) return out;

  let parsed: { scores?: RawScore[] };
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return out;
  }

  for (const entry of parsed.scores ?? []) {
    const id = Number(entry.id);
    const score = Number(entry.score);
    if (!Number.isFinite(id) || !expectedIds.has(id)) continue;
    if (!Number.isFinite(score)) continue;
    const clamped = Math.max(0, Math.min(100, Math.round(score)));
    out.set(id, clamped);
  }
  return out;
}

async function scoreBatch(
  client: OpenAI,
  model: string,
  systemPrompt: string,
  items: JudgeInput[],
): Promise<ParsedScores> {
  const expectedIds = new Set(items.map((it) => it.id));
  const userMessage = `Score these ${items.length} headlines:\n\n${formatBatch(items)}`;

  // 32768 to match writer-agent: Claude on Venice exposes reasoning via
  // message.reasoning_content, and reasoning counts against max_tokens.
  // 4096 was getting eaten by reasoning before the JSON output landed,
  // truncating the response and yielding zero parseable scores. Only used
  // tokens are billed so the higher cap has zero average-case cost.
  // No `temperature` set — writer-agent doesn't, and Venice has been
  // observed to reject `temperature: 0` for some Claude variants.
  const response = await client.chat.completions.create({
    model,
    max_tokens: 32768,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_object" },
  });

  await logUsage({
    caller: "judge",
    callKind: "chat",
    model,
    promptTokens: response.usage?.prompt_tokens ?? 0,
    completionTokens: response.usage?.completion_tokens ?? 0,
  });

  const text = response.choices[0]?.message?.content ?? "";
  return parseScores(text, expectedIds);
}

async function persistScores(scores: ParsedScores): Promise<void> {
  if (scores.size === 0) return;
  // One UPDATE per row — small batches, no contention. CASE-WHEN bulk update
  // would be one round-trip but the SQL is more fragile; stick with the
  // legible version unless we see this become a bottleneck.
  for (const [id, score] of scores) {
    await db
      .update(headlinesTable)
      .set({ relevanceScore: score })
      .where(sql`${headlinesTable.id} = ${id}`);
  }
}

/**
 * Idempotent. Adds the relevance_score column if a prod DB predates the
 * schema update. Safe to call on every boot.
 */
export async function ensureJudgeSchema(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE headlines ADD COLUMN IF NOT EXISTS relevance_score INTEGER
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS headlines_relevance_score_idx
    ON headlines (relevance_score)
  `);
}

export type JudgeRunSummary = {
  candidates: number;
  scored: number;
  batches: number;
  errors: number;
};

/**
 * Wipe relevance_score for rows in the lookback window so the next call to
 * `scoreUnscoredHeadlines()` re-judges them with the current prompt. Useful
 * after tuning the system prompt or threshold; the LLM call cost is small
 * (~6 calls for the typical window) so this is cheap to run.
 */
export async function clearScoresInLookback(): Promise<{ cleared: number }> {
  const since = new Date(Date.now() - JUDGE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const res = await db.execute(sql`
    UPDATE headlines
    SET relevance_score = NULL
    WHERE published_at >= ${since}
  `);
  // pg drivers return rowCount on the result envelope; fall back to 0 if
  // the driver shape changes.
  const rowCount = (res as { rowCount?: number | null }).rowCount ?? 0;
  return { cleared: rowCount };
}

/** Histogram + counts for diagnosing what the judge is doing. */
export async function getJudgeStats(): Promise<{
  total: number;
  scored: number;
  unscored: number;
  lowest: Array<{ id: number; source: string; title: string; relevanceScore: number }>;
  highest: Array<{ id: number; source: string; title: string; relevanceScore: number }>;
}> {
  const since = new Date(Date.now() - JUDGE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const counts = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(relevance_score)::int AS scored
    FROM headlines
    WHERE published_at >= ${since}
  `);
  const row = counts.rows[0] ?? { total: 0, scored: 0 };
  const total = Number((row as Record<string, unknown>)["total"] ?? 0);
  const scored = Number((row as Record<string, unknown>)["scored"] ?? 0);

  const sample = (order: "ASC" | "DESC") =>
    db.execute(sql`
      SELECT id, source, title, relevance_score
      FROM headlines
      WHERE published_at >= ${since} AND relevance_score IS NOT NULL
      ORDER BY relevance_score ${sql.raw(order)}, published_at DESC
      LIMIT 10
    `);

  const [lowest, highest] = await Promise.all([sample("ASC"), sample("DESC")]);
  const mapRow = (r: Record<string, unknown>) => ({
    id: Number(r["id"]),
    source: String(r["source"]),
    title: String(r["title"]),
    relevanceScore: Number(r["relevance_score"]),
  });
  return {
    total,
    scored,
    unscored: total - scored,
    lowest: lowest.rows.map((r) => mapRow(r as Record<string, unknown>)),
    highest: highest.rows.map((r) => mapRow(r as Record<string, unknown>)),
  };
}

// Persist a small JSON blob describing the last run so the public status
// endpoint can surface progress without prod log access. Written once per
// run; written even on early-exits and on errors so a "stuck" judge is
// visible.
async function persistLastRun(payload: {
  finishedAt: string;
  summary: JudgeRunSummary;
  model: string;
  lastError?: string;
}): Promise<void> {
  const value = JSON.stringify(payload);
  await db
    .insert(settingsTable)
    .values({ key: LAST_RUN_SETTINGS_KEY, value })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function getLastRun(): Promise<{
  finishedAt: string;
  summary: JudgeRunSummary;
  model: string;
  lastError?: string;
} | null> {
  const [row] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, LAST_RUN_SETTINGS_KEY))
    .limit(1);
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

/**
 * Score every headline that hasn't been judged yet (and is recent enough to
 * matter). Called fire-and-forget after each ingest tick.
 */
export async function scoreUnscoredHeadlines(): Promise<JudgeRunSummary> {
  const summary: JudgeRunSummary = { candidates: 0, scored: 0, batches: 0, errors: 0 };

  const setup = getClient();
  if (!setup) {
    logger.info("Headline judge: LLM_API_KEY not set — skipping");
    await persistLastRun({
      finishedAt: new Date().toISOString(),
      summary,
      model: "(unconfigured)",
      lastError: "LLM_API_KEY not set",
    });
    return summary;
  }

  const since = new Date(Date.now() - JUDGE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const candidates = await db
    .select({
      id: headlinesTable.id,
      source: headlinesTable.source,
      title: headlinesTable.title,
    })
    .from(headlinesTable)
    .where(
      and(
        isNull(headlinesTable.relevanceScore),
        gte(headlinesTable.publishedAt, since),
      ),
    );

  summary.candidates = candidates.length;
  if (candidates.length === 0) {
    await persistLastRun({
      finishedAt: new Date().toISOString(),
      summary,
      model: setup.model,
    });
    return summary;
  }

  // Snapshot the prompt at run start so a save mid-run doesn't shift the
  // scoring rubric across batches.
  const { prompt: systemPrompt } = await getJudgePrompt();

  let lastError: string | undefined;
  let errorStreak = 0;
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    summary.batches++;
    try {
      const scores = await scoreBatch(setup.client, setup.model, systemPrompt, batch);
      await persistScores(scores);
      summary.scored += scores.size;
      // Items the model omitted from the response stay NULL — they'll be
      // retried on the next ingest tick. Don't backfill with a default
      // score; "unjudged" and "judged as 0" need to remain distinguishable.
      errorStreak = 0;
    } catch (err) {
      summary.errors++;
      lastError = err instanceof Error ? err.message : String(err);
      logger.warn(
        { err: lastError, batchSize: batch.length },
        "Headline judge: batch failed",
      );
      errorStreak++;
      if (errorStreak >= ERROR_STREAK_BREAK) {
        logger.warn(
          { streak: errorStreak, remainingBatches: Math.ceil((candidates.length - i - BATCH_SIZE) / BATCH_SIZE) },
          "Headline judge: bailing on error streak — next ingest tick will retry",
        );
        break;
      }
    }
  }

  logger.info(summary, "Headline judge: scoring complete");
  await persistLastRun({
    finishedAt: new Date().toISOString(),
    summary,
    model: setup.model,
    lastError,
  });
  return summary;
}
