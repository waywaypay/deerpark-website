// Per-headline commentary generator. The /dispatch top-10 view on the
// website renders each headline with 2-4 sentences of commentary inline —
// the same shape paid subscribers get over email. This module produces
// those sentences for top-eligible headlines and persists them so the
// /api/headlines endpoint serves them without a per-request LLM call.
//
// One call per headline (concurrency-limited). The previous batched
// design asked the model to draft 10 commentaries in one call; when one
// tripped the banned-phrase gate, the entry was silently dropped and the
// row sat NULL until the next ingest tick rebatched it. Per-headline
// calls let us (a) give targeted retry feedback when a draft is rejected,
// quoting the offending sentence, instead of waiting for a fresh batch to
// re-roll, and (b) give the model undivided attention to each headline
// instead of context-switching across 10 unrelated stories per call.
//
// Cost shape: ~80 words output × N calls. Prompt is now ~1.2k tokens (was
// ~3.5k for the batched system prompt + 10-item user message). Net token
// spend per N items is roughly flat — same input tokens distributed
// across N small calls instead of one large one — and the gate-trip
// recovery loop runs in-band rather than across ingest ticks.

import OpenAI from "openai";
import { db, headlinesTable } from "@workspace/db";
import { and, gte, isNotNull, isNull, or, sql } from "drizzle-orm";
import { logger } from "./logger";
import { MIN_TOP_RELEVANCE_SCORE } from "./headline-judge";
import { logUsage } from "./llm-usage";
import { findFirstViolation } from "./banned-phrases";
import {
  formatBestExamplesBlock,
  getRecentBestExamples,
} from "./dispatch-best-examples";

const DEFAULT_BASE_URL = "https://api.venice.ai/api/v1";
// Venice removed Anthropic models from its catalog, so `claude-haiku-*` no
// longer resolves on /chat/completions — the commentator was silently
// failing every batch (caught in the try/catch in generateMissingCommentary,
// streak hits ERROR_STREAK_BREAK, bails), leaving `commentary` NULL on
// every new top-eligible row. The judge hit the same wall and swapped to
// gpt-4o-mini; we follow it here so dispatch headlines get their briefs
// back. The previous concern with gpt-4o-mini was AI-slop register
// ("This [noun]" leads, "could reshape"); the banned-phrase gate at
// parseCommentary now drops those entries, so the prompt-following gap is
// covered at the output filter instead of the model choice.
const DEFAULT_MODEL = "openai-gpt-4o-mini-2024-07-18";

// 7d matches the top-view window — older rows won't appear in the top-10
// so commenting them is wasted spend.
const COMMENTATOR_LOOKBACK_DAYS = 7;

// Per-headline call concurrency. Stays well under the Venice abuse
// threshold ("20 failed in 30s") even when several calls retry.
const CALL_CONCURRENCY = 4;

// Per-headline retry budget. A first-pass banned-phrase trip is common
// when a model has a favorite framing for a particular kind of headline;
// a surgical "rewrite without sentence X" usually fixes it on attempt 2.
// Bumped beyond 2 wasn't worth the wall-clock cost in v1 testing.
const ITEM_MAX_ATTEMPTS = 2;

// Stop after this many back-to-back item failures of any kind. Venice's
// "20 failed in 30s" abuse guard cascades, and any failure mode here
// (429, timeout, parse error) signals "the LLM call path isn't healthy
// right now." Bail and let the next ingest tick try again.
const ERROR_STREAK_BREAK = 4;

export const SYSTEM_PROMPT = `You write a 2-3 sentence plain-English brief for ONE AI/tech headline. The brief sits directly under the headline on the website. A smart non-specialist should be able to read it once and walk away knowing what shipped and what specifically changed because of it.

EXAMPLES — match this register exactly.

Headline: "Anthropic launches financial-services agent for asset managers"
**Anthropic shipped a finance-tuned Claude.** The bundle is trained on filings, transcripts, and call notes, and sells alongside Hebbia and Rogo — the two startups already inside asset-manager workflows. It's the third Anthropic vintage of a workflow-specific agent, not a horizontal API.

Headline: "OpenAI to acquire Stainless for $200M"
**OpenAI bought Stainless, the SDK-generation startup.** Stainless's tooling — used by Anthropic, Cloudflare, and OpenAI itself — turns OpenAPI specs into typed client libraries; folding it in shortens the path from new endpoint to merged TypeScript/Python SDK. The interesting question is whether existing Stainless customers keep shipping against an OpenAI-owned tool.

Headline: "Nvidia in talks to invest in Anthropic and OpenAI"
**Nvidia is reportedly negotiating equity stakes in Anthropic and OpenAI.** Backing both labs at once tightens Nvidia's grip on the AI-compute demand curve: every dollar of model revenue feeds back into H100/Blackwell orders. The two labs together already account for a meaningful slice of Nvidia's data-center bookings.

— Notice what these do: a sharp first clause naming the actor and verb, a concrete second sentence (a named customer, a specific workflow, a real mechanism), and either a clean stop at two sentences or a third sentence that adds a *specific* observation. No "this acquisition will bolster…" — instead, "Stainless's tooling — used by Anthropic, Cloudflare, and OpenAI itself…".

SHAPE
- Sentence 1 — bolded with markdown asterisks (**lead clause**). Publisher + paraphrased action verb. Paraphrase the title, don't copy it (≤ 3 consecutive words from the title).
- Sentence 2 — one concrete consequence that names something specific: a named customer, a workflow, a price, a metric, a competitor by name. Must NOT begin with "This".
- Sentence 3 — optional. Only if you have a specific observation to add. If you'd default to "questions remain" or "time will tell", stop at two sentences.

POSITIVE-SHAPE RULE FOR THE ANALYSIS SENTENCE(S)
Name at least ONE concrete anchor: a specific customer, workflow step, price, geo, headcount, model size, partner, or metric. If the headline doesn't support a concrete anchor, write an observational sentence that reports what shipped (capability, scope, GA-vs-beta, round size) and stop. Never reach for an abstract consequence to fill space.

PUBLISHER ATTRIBUTION
First-party posts (source = "Anthropic"): "Anthropic released…". Press coverage (source = "Bloomberg"): "Bloomberg reports…" / "per Bloomberg…".

ACCURACY
Every claim must be supported by the headline or widely-known facts about the named company. Don't invent prices, dates, metrics, customers, or quotes. If the headline doesn't carry a number, don't make one up.

HARD RULES
- 2-3 sentences. No exclamation marks. At most one em-dash per sentence.
- Vary the lead verb. Use one of: released, shipped, launched, raised, hired, partnered with, acquired, sued, sunset, debuted, opened, expanded. Do NOT use "announced".
- Sentence 2 must NOT begin with "This".
- Do NOT use "could reshape / may reshape / could enhance / could become / may prove", "this acquisition / this move / this development / this expansion / this initiative", "tech giant", "competitive landscape / growth trajectory / value proposition / operational frameworks", "watershed moment / seismic shift / existential threat / transformative".

Return ONLY this JSON, no prose:
{ "text": "<2-3 sentences with bolded lead clause>" }`;

type CommentaryInput = {
  id: number;
  source: string;
  category: string;
  title: string;
  url: string;
};

function getClient(): { client: OpenAI; model: string } | null {
  const apiKey = process.env["LLM_API_KEY"];
  if (!apiKey) return null;
  const baseURL = process.env["LLM_BASE_URL"] ?? DEFAULT_BASE_URL;
  // Don't cascade through LLM_MODEL — that's the writer's heavier
  // Sonnet-class model with its own rate-limit bucket. Default to haiku
  // so the commentator runs on a separate bucket and doesn't compound
  // 429s when the writer/judge are also under pressure.
  const model = process.env["COMMENTATOR_MODEL"] ?? DEFAULT_MODEL;
  // 4 min mirrors headline-judge — Claude reasoning eats most of that
  // before the JSON output lands. If a provider hangs past this we abandon
  // the batch and the next ingest tick re-tries the still-NULL rows.
  // maxRetries: 0 disables the OpenAI SDK's default 2x retry — see
  // headline-judge for the same rationale (multiplies abuse-threshold
  // damage when Venice is throttling).
  const client = new OpenAI({ apiKey, baseURL, timeout: 4 * 60_000, maxRetries: 0 });
  return { client, model };
}

function formatHeadline(it: CommentaryInput): string {
  return `Source: ${it.source} (${it.category})\nTitle: ${it.title}\nURL: ${it.url}`;
}

// Extract { "text": "..." } from a single-item commentator response.
// Handles bare JSON, code-fenced JSON, and brace-balanced JSON-in-prose —
// the failure modes we've seen when a model returns JSON wrapped in
// commentary.
function extractTextField(raw: string): string | null {
  const tryParse = (s: string): string | null => {
    try {
      const obj = JSON.parse(s) as { text?: unknown };
      return typeof obj.text === "string" ? obj.text.trim() : null;
    } catch {
      return null;
    }
  };
  const trimmed = raw.trim();
  const direct = tryParse(trimmed);
  if (direct !== null) return direct;
  const defenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const dd = tryParse(defenced);
  if (dd !== null) return dd;
  const start = defenced.indexOf("{");
  if (start === -1) return null;
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < defenced.length; i++) {
    const ch = defenced[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return tryParse(defenced.slice(start, i + 1)); }
  }
  return null;
}

// Walk back/forward from a match index to surround the offending sentence
// so retry prompts can quote it verbatim. Without this, the retry says
// "you used a banned pattern" and the model often rewrites the wrong half.
function extractSentence(text: string, idx: number): string {
  let s = idx, e = idx;
  while (s > 0) {
    const ch = text[s - 1];
    if (ch === "." || ch === "!" || ch === "?" || ch === "\n") break;
    s--;
  }
  while (e < text.length) {
    const ch = text[e];
    if (ch === "." || ch === "!" || ch === "?" || ch === "\n") {
      if (ch === "." || ch === "!" || ch === "?") e++;
      break;
    }
    e++;
  }
  return text.slice(s, e).trim();
}

type ItemResult = { ok: true; text: string } | { ok: false; error: string };

async function commentOne(
  client: OpenAI,
  model: string,
  item: CommentaryInput,
  examplesBlock: string,
): Promise<ItemResult> {
  const baseUser = examplesBlock
    ? `${examplesBlock}\n\n--- NEW HEADLINE TO WRITE ---\n\n${formatHeadline(item)}`
    : `Write commentary for this headline:\n\n${formatHeadline(item)}`;

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: baseUser },
  ];

  let lastError = "no attempts";
  for (let attempt = 1; attempt <= ITEM_MAX_ATTEMPTS; attempt++) {
    const response = await client.chat.completions.create({
      model,
      max_tokens: 1024,
      messages,
      response_format: { type: "json_object" },
    });
    await logUsage({
      caller: "commentator",
      callKind: "chat",
      model,
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
    });

    const raw = response.choices[0]?.message?.content ?? "";
    const text = raw ? extractTextField(raw) : null;
    if (!text) {
      lastError = `attempt ${attempt}: empty or unparseable response`;
      break; // Parse failures don't usually recover with surgical feedback.
    }
    if (text.length > 800) {
      lastError = `attempt ${attempt}: text ${text.length} chars (cap 800)`;
      if (attempt < ITEM_MAX_ATTEMPTS) {
        messages.push({ role: "assistant", content: raw });
        messages.push({
          role: "user",
          content: "Your reply was too long. Re-emit in 2 sentences (3 only if a specific observation needs the room). Same JSON schema: { \"text\": \"...\" }.",
        });
        continue;
      }
      break;
    }
    const violation = findFirstViolation(text);
    if (violation) {
      const offending = extractSentence(text, violation.match.index);
      lastError = `attempt ${attempt}: banned phrase "${violation.pattern.phrase}" in "${offending}"`;
      if (attempt < ITEM_MAX_ATTEMPTS) {
        messages.push({ role: "assistant", content: raw });
        messages.push({
          role: "user",
          content: [
            `Your reply tripped the banned-phrase gate on "${violation.pattern.phrase}".`,
            "",
            "The offending sentence:",
            `> ${offending}`,
            "",
            "Rewrite ONLY that sentence. Replace the banned phrase by naming the specific company, capability, metric, or workflow it gestures at. Keep the rest of the brief verbatim. Same JSON schema: { \"text\": \"...\" }.",
          ].join("\n"),
        });
        continue;
      }
      break;
    }
    return { ok: true, text };
  }
  return { ok: false, error: lastError };
}

async function persistCommentary(id: number, text: string): Promise<void> {
  await db
    .update(headlinesTable)
    .set({ commentary: text, commentedAt: new Date() })
    .where(sql`${headlinesTable.id} = ${id}`);
}

// Run jobs with a max concurrency, completing in any order — we persist
// each as it lands so a partial run still leaves the early items
// commented even if a later batch trips the abuse guard.
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      await fn(items[i]!);
    }
  });
  await Promise.all(workers);
}

/**
 * Idempotent. Adds the commentary + commented_at columns if a prod DB
 * predates the schema update. Safe to call on every boot.
 */
export async function ensureCommentatorSchema(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE headlines ADD COLUMN IF NOT EXISTS commentary TEXT
  `);
  await db.execute(sql`
    ALTER TABLE headlines ADD COLUMN IF NOT EXISTS commented_at TIMESTAMPTZ
  `);
}

export type CommentatorRunSummary = {
  candidates: number;
  commented: number;
  /** Kept for API/log back-compat with the batched implementation; now
   *  tracks per-item call count (1 per candidate that didn't bail early). */
  batches: number;
  errors: number;
};

/**
 * NULL out commentary on rows whose stored text violates the current
 * banned-phrase catalogue. The parseCommentary gate stops slop from being
 * persisted going forward, but rows committed before a pattern was added —
 * or before the gate existed — keep their stale text indefinitely, because
 * generateMissingCommentary only re-runs where `commentary IS NULL`.
 *
 * This sweeps the same 7d lookback the commentator regenerates against, so
 * cleared rows are picked up by the next post-ingest commentator tick. Cost
 * is one SELECT + N small UPDATEs per call; with ~hundreds of rows in the
 * window it's negligible vs the LLM calls that follow.
 */
export async function clearViolatingCommentary(): Promise<number> {
  const since = new Date(Date.now() - COMMENTATOR_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ id: headlinesTable.id, commentary: headlinesTable.commentary })
    .from(headlinesTable)
    .where(
      and(
        isNotNull(headlinesTable.commentary),
        gte(headlinesTable.publishedAt, since),
      ),
    );
  let cleared = 0;
  for (const row of rows) {
    const text = row.commentary;
    if (!text) continue;
    const violation = findFirstViolation(text);
    if (!violation) continue;
    await db
      .update(headlinesTable)
      .set({ commentary: null, commentedAt: null })
      .where(sql`${headlinesTable.id} = ${row.id}`);
    cleared++;
    logger.info(
      { id: row.id, phrase: violation.pattern.phrase },
      "Headline commentator: cleared stale commentary on banned phrase",
    );
  }
  return cleared;
}

/**
 * Generate commentary for top-eligible headlines that don't have it yet.
 * Top-eligible matches the /api/headlines?mode=top SQL gate: published in
 * the last 7 days AND (relevance_score IS NULL OR >= MIN_TOP_RELEVANCE).
 * Items the judge hasn't reached still get commentary so the website
 * doesn't go empty when the judge is backlogged or rate-limited.
 *
 * Idempotent — rows with non-NULL commentary are skipped, so calling
 * this after every ingest tick costs nothing on quiet days. Bails on a
 * rate-limit streak instead of burning the rest of the candidate list.
 */
export async function generateMissingCommentary(): Promise<CommentatorRunSummary> {
  const summary: CommentatorRunSummary = {
    candidates: 0,
    commented: 0,
    batches: 0,
    errors: 0,
  };

  const setup = getClient();
  if (!setup) {
    logger.info("Headline commentator: LLM_API_KEY not set — skipping");
    return summary;
  }

  const since = new Date(Date.now() - COMMENTATOR_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const candidates = await db
    .select({
      id: headlinesTable.id,
      source: headlinesTable.source,
      category: headlinesTable.category,
      title: headlinesTable.title,
      url: headlinesTable.url,
    })
    .from(headlinesTable)
    .where(
      and(
        isNull(headlinesTable.commentary),
        gte(headlinesTable.publishedAt, since),
        or(
          isNull(headlinesTable.relevanceScore),
          gte(headlinesTable.relevanceScore, MIN_TOP_RELEVANCE_SCORE),
        ),
      ),
    );

  summary.candidates = candidates.length;
  if (candidates.length === 0) return summary;

  // Load best-examples block once per run; per-item calls share it so the
  // model-side prompt cache (where the provider supports it) can hit on
  // identical prefixes across the candidate set.
  const examples = await getRecentBestExamples(3);
  const examplesBlock = formatBestExamplesBlock(examples);

  let errorStreak = 0;
  let bailed = false;
  await runWithConcurrency(candidates, CALL_CONCURRENCY, async (item) => {
    if (bailed) return;
    summary.batches++;
    try {
      const result = await commentOne(setup.client, setup.model, item, examplesBlock);
      if (result.ok) {
        await persistCommentary(item.id, result.text);
        summary.commented++;
        errorStreak = 0;
      } else {
        summary.errors++;
        logger.info(
          { id: item.id, reason: result.error },
          "Headline commentator: item rejected (row stays NULL, next tick retries)",
        );
        // A clean rejection (banned phrase, too long) is NOT a transport
        // failure — don't escalate to the bail counter.
      }
    } catch (err) {
      summary.errors++;
      errorStreak++;
      logger.warn(
        { id: item.id, err: err instanceof Error ? err.message : String(err) },
        "Headline commentator: item call failed",
      );
      if (errorStreak >= ERROR_STREAK_BREAK) {
        bailed = true;
        logger.warn(
          { streak: errorStreak, remaining: candidates.length - summary.batches },
          "Headline commentator: bailing on transport error streak — next ingest tick will retry",
        );
      }
    }
  });

  logger.info(summary, "Headline commentator: run complete");
  return summary;
}
