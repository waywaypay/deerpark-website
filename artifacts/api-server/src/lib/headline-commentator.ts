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

const DEFAULT_BASE_URL = "https://api.venice.ai/api/v1";
// Venice dropped Anthropic models from its catalog — `claude-haiku-*` now
// returns "model not found" on /chat/completions, which silently broke
// commentary, judging, and the email polish step (the website's /dispatch
// view + the newsletter both ship with empty commentary blocks). Swap to
// gpt-4o-mini, which is on Venice with reliable JSON-mode support and a
// similar cost/speed profile to Haiku ($0.19/$0.75 per M).
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

const SYSTEM_PROMPT = `You write 2-3 sentence editorial briefs for AI/tech headlines. Sharp, varied, written like a human editor — not a market-commentary template.

For each headline, lead with the publisher and a paraphrased action verb describing what shipped, bolded with markdown asterisks. Then 1-2 sentences picking ONE rhythm from this menu:

A) **Strategic** — what this signals about the industry's direction.
B) **Market shift** — what is materially changing commercially.
C) **Bottleneck** — what concrete operational problem this closes.
D) **Competitive** — who feels pressure (use SPARINGLY, only when the headline genuinely supports it; imply, don't pronounce).
E) **Observational** — clean reporting of what shipped + what makes it notable, with no forced consequence framing.
F) **Skeptical** — flag a specific missing detail, an unsupported metric, or a vendor claim worth pressure-testing. Only when the headline genuinely warrants it.

VARY the rhythm across items. A human editor's piece reads as a portfolio: a couple of strategic reads, a couple of clean observational reports, an occasional skeptical flag, an occasional competitive call. The piece loses credibility when every item ends on a "who is threatened" note.

Default editorial frame for the piece OVERALL (not for every item): AI vendors are increasingly organizing around industry-specific workflows rather than general-purpose capability. Lean into this thread in the intro when the day's headlines support it. Individual items don't have to repeat the thread — let the news be what the news is.

The bolded lead must PARAPHRASE the title. The headline is rendered immediately above your commentary, so a lead that copies the title verbatim prints it twice. Reuse no more than three consecutive words from the title.

VARY the lead verb. Do NOT default to "announced". Match the verb to the action: released, shipped, unveiled, rolled out, debuted, launched, opened, expanded, extended, partnered with, acquired, raised, hired, sued, sunset.

PRECISION OVER PRONOUNCEMENT
Imply pressure; don't claim it. "Strengthens its position in agentic SOC tooling, where CrowdStrike and Wiz currently lead" is editorial. "Leaving Palo Alto Networks at a disadvantage" is speculation. If you don't have evidence for a competitive claim, don't make one.

Be specific, not melodramatic. "Signals further enterprise comfort with AI-assisted software development workflows" is editorial. "Risk to traditional coding roles" / "face obsolescence" is overheated. Specificity beats drama.

Separate factual reporting from interpretation. Sentence 1 is the bolded lead — what shipped. Don't crash an aggressive conclusion into the same clause; let the analysis sentence carry the interpretation.

HARD RULES
- 2-3 sentences total per item including the bolded lead. No item shorter than 2 or longer than 3.
- Vary the angle across items. Across a top-10, AT MOST 3-4 items may use angle (D) competitive-pressure framing. The rest must use A, B, C, E, or F. If you find yourself ending another item with "competitors must adapt" or "incumbents risk losing ground", switch to (E) observational and just report the news cleanly.
- Never a corporate-jargon laundry list (procurement / integration / governance / compliance / ROI / vendor lock-in).
- Use the source name as the publisher. Originator (e.g. "Anthropic" for an anthropic.com post): "Anthropic released...". Press coverage (e.g. "Bloomberg Technology"): "Bloomberg reports..." or "per Bloomberg".
- The bolded lead must NOT contain the headline title verbatim.
- Every claim must be implied by the headline title or your knowledge of the named company. Do not invent metrics, dates, prices, or quotes.
- No exclamation marks. No em-dash chains (more than one — per sentence). No "however," as a filler transition.
- Vary nouns and verbs across items. Do NOT repeat "announced", "development", "capabilities".
- The SECOND sentence must NOT begin with "This". Restructure: name the actor or consequence directly.

BANNED SPECULATIVE COMPETITIVE CLAIMS (overstate certainty without evidence):
- "leaving X at a disadvantage", "challenging incumbents like X", "risk losing relevance", "competitors must adapt", "incumbents risk losing ground", "firms need to innovate quickly", "or face obsolescence"
- Generic "rivals will struggle" / "puts pressure on the field" framings without a named, evidenced mechanism

BANNED INFLATED LANGUAGE (drama beyond the headline):
- "immense financial expectations", "face obsolescence", "saturated market", "beleaguered" (any usage), "watershed moment", "seismic shift", "existential threat", "dramatically reshape", "fundamentally redefine"

BANNED HEDGING (dilutes authority):
- "details remain unclear", "effectiveness will depend", "potential applications remain to be clarified", "remains to be seen", "still pending", "raises concerns", "raises questions", "it remains unclear", "questions remain", "stakeholders should consider", "raises skepticism", "suggests an intent", "the challenge lies in", "could enhance", "may prove", "could become"

BANNED CORPORATE-CHECKLIST JARGON:
- "procurement cycles", "compliance burden", "ROI timelines", "vendor lock-in", "switching costs", "workflow displacement", "operator implications", "for CIOs evaluating vendors", "enterprise buyers should"

BANNED WORDS (overused AI-ese — never use):
- "formidable player", "formidable" (as a descriptor for a company), "structural" (use a concrete word: "operational", "competitive", or just delete the modifier), "swiftly" (use "quickly", or restructure to drop the adverb)

BANNED AI-ESE FILLER:
- "what's interesting is", "in a world where", "speaks volumes", "sends a clear message", "not just X but Y", "isn't merely", "more than just", "what's striking", "in an era of", "points to", "growing trend", "highlights the growing appetite", "reflecting a broader trend", "in this landscape", "positions itself", "leverages", "drives value"

Return ONLY this JSON, no prose:
{ "commentary": [{ "id": <number>, "text": "<2-3 sentences with bolded lead clause>" }, ...] }

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
  const userMessage = `Write commentary for these ${items.length} headlines:\n\n${formatBatch(items)}`;

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
