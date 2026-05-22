// Per-headline commentary generator. The /dispatch top-10 view on the
// website renders each headline with 2-4 sentences of commentary inline —
// the same shape paid subscribers get over email. This module produces
// those sentences for top-eligible headlines and persists them so the
// /api/headlines endpoint serves them without a per-request LLM call.
//
// Cost shape: a top-eligible headline (relevance_score ≥ MIN_TOP_RELEVANCE)
// gets one batched LLM call's worth of commentary, then the row is sticky.
// With ~10 new top-eligible items/day across all sources, we make ~1 call
// per ingest tick that turns up new top-eligible rows — negligible vs the
// writer agent.

import OpenAI from "openai";
import { db, headlinesTable } from "@workspace/db";
import { and, gte, isNull, or, sql } from "drizzle-orm";
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

// One batch per call. The commentator emits ~80 words per item (≈ 320
// chars), so 10 items → ~3.2k output chars. With reasoning overhead on a
// Claude class model, this comfortably fits a single call.
const BATCH_SIZE = 10;

// Stop after this many back-to-back batch failures of any kind. Venice's
// "20 failed in 30s" abuse guard cascades, and any failure mode here
// (429, timeout, parse error, network) signals "the LLM call path isn't
// healthy right now." Bail and let the next ingest tick try again after
// the cooldown clears.
const ERROR_STREAK_BREAK = 3;

export const SYSTEM_PROMPT = `You write 2-3 sentence plain-English briefs for AI/tech headlines. The brief sits directly under the headline on the website. A smart non-specialist should be able to read it once and walk away knowing what shipped and what specifically changed because of it.

EXAMPLES — match this register exactly.

Headline: "Anthropic launches financial-services agent for asset managers"
**Anthropic shipped a finance-tuned Claude.** The bundle is trained on filings, transcripts, and call notes, and sells alongside Hebbia and Rogo — the two startups already inside asset-manager workflows. It's the third Anthropic vintage of a workflow-specific agent, not a horizontal API.

Headline: "OpenAI to acquire Stainless for $200M"
**OpenAI bought Stainless, the SDK-generation startup.** Stainless's tooling — used by Anthropic, Cloudflare, and OpenAI itself — turns OpenAPI specs into typed client libraries; folding it in shortens the path from new endpoint to merged TypeScript/Python SDK. The interesting question is whether existing Stainless customers keep shipping against an OpenAI-owned tool.

Headline: "Nvidia in talks to invest in Anthropic and OpenAI"
**Nvidia is reportedly negotiating equity stakes in Anthropic and OpenAI.** Backing both labs at once tightens Nvidia's grip on the AI-compute demand curve: every dollar of model revenue feeds back into H100/Blackwell orders. The two labs together already account for a meaningful slice of Nvidia's data-center bookings.

— Notice what these do: a sharp first clause naming the actor and verb, a concrete second sentence (a named customer, a specific workflow, a real mechanism), and either a clean stop at two sentences or a third sentence that adds a *specific* observation. No "this acquisition will bolster…" — instead, "Stainless's tooling — used by Anthropic, Cloudflare, and OpenAI itself…".

SHAPE
- Sentence 1 — bolded with markdown asterisks. Lead with the publisher + an action verb (released, launched, raised, hired, partnered with, acquired, sued, sunset). Paraphrase the title, don't copy it.
- Sentence 2 — one concrete consequence: a named customer, a workflow, a price, a metric, a competitor by name. Must NOT begin with "This".
- Sentence 3 — optional. Only if you have a specific observation to add. If you'd default to "questions remain" or "time will tell", stop at two sentences.

ACCURACY
Every claim must be supported by the headline or widely-known facts about the named company. Don't invent prices, dates, metrics, customers, or quotes. If the headline doesn't carry a number, don't make one up.

PUBLISHER ATTRIBUTION
Lead with the source as actor. First-party posts (source = "Anthropic"): "Anthropic released…". Press coverage (source = "Bloomberg"): "Bloomberg reports…" / "per Bloomberg…".

HARD RULES
- 2-3 sentences. No exclamation marks. At most one em-dash per sentence.
- The bolded lead must NOT copy the headline title verbatim (≤ 3 consecutive words).
- Vary the lead verb — don't default to "announced".
- The second sentence must NOT begin with "This" (the surest LLM-tic).
- No "this acquisition / this move / this development / this expansion / this initiative". Name the specific company, product, or capability instead.
- No "could reshape / may reshape / could enhance / could become / may prove" hedges. Either state what changes concretely, or stay observational.
- No "tech giant / AI chip market / AI hardware development / product offerings / stronger foothold" — these are summarizer abstractions. Name the specific companies and products.
- No "competitive landscape / growth trajectory / value proposition / operational frameworks" or other abstract business nouns. Name the specific capability, metric, or workflow.
- No "watershed moment / seismic shift / existential threat / transformative" drama words.

FINANCIAL EVENTS (IPOs, rounds, M&A, earnings)
"Growth trajectory" / "investor confidence" framings are filler. Either name a concrete commercial change (who they can now buy, pricing power, customer-concentration risk) or keep it observational (round size, lead investor, valuation) and stop.

Return ONLY this JSON, no prose:
{ "commentary": [{ "id": <number>, "text": "<2-3 plain-English sentences with bolded lead clause>" }, ...] }

One entry per input id. No omissions. No extra ids.`;

type CommentaryInput = {
  id: number;
  source: string;
  category: string;
  title: string;
  url: string;
};

type RawEntry = { id: unknown; text: unknown };
type ParsedCommentary = Map<number, string>;

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

function formatBatch(items: CommentaryInput[]): string {
  return items
    .map(
      (it) =>
        `id=${it.id}\nSource: ${it.source} (${it.category})\nTitle: ${it.title}\nURL: ${it.url}`,
    )
    .join("\n---\n");
}

function parseCommentary(
  text: string,
  expectedIds: Set<number>,
): ParsedCommentary {
  const out = new Map<number, string>();
  const start = text.indexOf("{");
  if (start === -1) return out;
  let depth = 0;
  let end = -1;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return out;

  let parsed: { commentary?: RawEntry[] };
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return out;
  }

  for (const entry of parsed.commentary ?? []) {
    const id = Number(entry.id);
    const t = typeof entry.text === "string" ? entry.text.trim() : "";
    if (!Number.isFinite(id) || !expectedIds.has(id)) continue;
    if (t.length === 0) continue;
    // Cap at ~800 chars — generous headroom for 4 long sentences. Anything
    // beyond is the model padding past the brief; we'd rather drop than
    // surface a wall of text.
    if (t.length > 800) continue;
    // Banned-phrase gate. If the model produced a violation (e.g. "could
    // reshape", "this acquisition", a generic "this [noun]" lead on
    // sentence 2), drop the entry — commentary stays NULL on the row and
    // the next ingest tick retries with a fresh batch. Better an empty
    // brief than slop on the live site.
    const violation = findFirstViolation(t);
    if (violation) {
      logger.info(
        { id, phrase: violation.pattern.phrase },
        "Headline commentator: dropped entry on banned phrase",
      );
      continue;
    }
    out.set(id, t);
  }
  return out;
}

async function commentBatch(
  client: OpenAI,
  model: string,
  items: CommentaryInput[],
): Promise<ParsedCommentary> {
  const expectedIds = new Set(items.map((it) => it.id));
  // Few-shot exemplars from recent high-composite dispatches, fetched
  // from the in-process cache. Empty block until the eval pipeline has
  // produced enough good rows to mine from; gates degrade gracefully
  // to the static examples already baked into SYSTEM_PROMPT.
  // Prepending to the user message (NOT the system prompt) keeps the
  // content-addressed commentator prompt hash stable as exemplars
  // rotate per batch.
  const examples = await getRecentBestExamples(3);
  const examplesBlock = formatBestExamplesBlock(examples);
  const userMessage = examplesBlock
    ? `${examplesBlock}\n\n--- NEW HEADLINES TO WRITE ---\n\nWrite commentary for these ${items.length} headlines:\n\n${formatBatch(items)}`
    : `Write commentary for these ${items.length} headlines:\n\n${formatBatch(items)}`;

  const response = await client.chat.completions.create({
    model,
    max_tokens: 32768,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_object" },
  });

  await logUsage({
    caller: "commentator",
    callKind: "chat",
    model,
    promptTokens: response.usage?.prompt_tokens ?? 0,
    completionTokens: response.usage?.completion_tokens ?? 0,
  });

  const text = response.choices[0]?.message?.content ?? "";
  return parseCommentary(text, expectedIds);
}

async function persistCommentary(commentary: ParsedCommentary): Promise<void> {
  if (commentary.size === 0) return;
  const now = new Date();
  for (const [id, text] of commentary) {
    await db
      .update(headlinesTable)
      .set({ commentary: text, commentedAt: now })
      .where(sql`${headlinesTable.id} = ${id}`);
  }
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
  batches: number;
  errors: number;
};

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

  let errorStreak = 0;
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    summary.batches++;
    try {
      const out = await commentBatch(setup.client, setup.model, batch);
      await persistCommentary(out);
      summary.commented += out.size;
      errorStreak = 0;
    } catch (err) {
      summary.errors++;
      logger.warn(
        {
          err: err instanceof Error ? err.message : String(err),
          batchSize: batch.length,
        },
        "Headline commentator: batch failed",
      );
      errorStreak++;
      if (errorStreak >= ERROR_STREAK_BREAK) {
        logger.warn(
          { streak: errorStreak, remainingBatches: Math.ceil((candidates.length - i - BATCH_SIZE) / BATCH_SIZE) },
          "Headline commentator: bailing on error streak — next ingest tick will retry",
        );
        break;
      }
    }
  }

  logger.info(summary, "Headline commentator: run complete");
  return summary;
}
