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

export const SYSTEM_PROMPT = `You write short analyst briefs for AI/tech headlines. The brief sits directly under the headline on the website. Voice target: institutional / CIO-briefing analysis — sharp, varied, grounded in named workflows, actors, and operational mechanics. Not a feature summary. Not a plain-English explainer. Conclude rather than narrate.

PER-ITEM SHAPE
1. **What shipped, who did it, what concretely changed.** Bold the opening clause with markdown asterisks. Lead with the publisher + an action verb (released, launched, raised, hired, partnered with, acquired, sued, sunset). Paraphrase the title — don't copy it back.
2. Why this actor is doing it now — the strategic motive, not the generic consequence. A named buyer segment, a competitive surface being attacked, a margin or distribution lever, a workflow they're trying to own.
3. (Optional, only when the story warrants it and source tier supports it.) The market or economic shift this sits inside — model commoditization, distribution war, procurement movement, labor compression, infrastructure positioning, regulatory framing. Specific trend, not generic "this could reshape" futurecasting.

Two crisp sentences beat three padded ones. If sentence 3 would be a generic close ("questions remain", "time will tell", "competitors are watching"), delete it.

SOURCE TIERING
- Tier 1 (OpenAI, Anthropic, Google, Microsoft, NVIDIA, AWS, large IPOs, regulation): typically the full 3 sentences. Name the strategic motive and the broader shift.
- Tier 2 (mid-size labs, enterprise vendors, mid-cap funding): typically 2 sentences. One sharp strategic observation, not two.
- Tier 3 (arXiv preprints, smaller research): 1–2 sentences. Name the specific applied audience, not the abstract method.

ROTATE ANALYTICAL LENSES ACROSS THE BATCH
You receive multiple items in one call. Across the batch, rotate the lens — do not ask "who loses competitively?" on every item. Lenses available: operational adoption, GTM / distribution, infrastructure & inference economics, regulatory / governance, labor & coordination cost, pricing & commoditization, integration friction, technical limitation, capital structure. Use each lens at most twice per 10-item batch.

CONCLUDE, DON'T NARRATE
The "X did Y. This will help Z." / "X launched Y. This may drive Z." rhythm is the dominant AI-slop tell. Restructure as "X did Y, which signals Z" or fold the move and its motive into a single integrated sentence. Never end on speculation, hedged futurecasting, or "watch this space".

  Weak (narration): "Anthropic launched Claude for small businesses. This new model aims to help smaller companies with tasks like customer service."
  Better (conclusion): "Anthropic's SMB push reframes small business as an underpenetrated distribution channel for recurring AI subscriptions, where the buyer is one operator with a credit card rather than a procurement committee."

  Weak (narration): "xAI released Grok Code 2, positioning xAI as a serious player in the AI tools market."
  Better (conclusion): "The release confirms coding agents have become table-stakes among frontier labs, leaving differentiation in developer mindshare — one of the few AI categories with daily engagement."

REDUCE ADJECTIVES, USE OPERATIONAL NOUNS
Adjective-heavy filler ("enhanced", "advanced", "improved", "flexible", "innovative", "strategic", "transformative") is the surface texture of AI slop. Strong analysis uses bare nouns that name the actual mechanism: distribution, deployment, inference cost, latency, retention, procurement, orchestration, mindshare, table-stakes, gross margin, contract length, churn surface, lock-in, compliance scope, developer tooling, coordination cost, capital intensity.

  GOOD — bare operational nouns naming a real mechanism: "shifts procurement decisions from IT to finance"; "compresses the contract length enterprises will sign for a single model".
  BAD — list-style corporate-checklist abstraction (still banned): "changes things for procurement, compliance, ROI, vendor lock-in, retention…". Pick ONE mechanism and name it.

CONCRETE OVER ABSTRACT
Name something specific in every brief — a named buyer segment, a competitor, a price, a metric, a workflow, a date. If a sentence could attach to any AI announcement, rewrite it.

  Weak: "This represents a significant step forward in operational capabilities for enterprises navigating the evolving AI landscape."
  Better: "Anthropic's customers in finance now get a model trained on filings and call transcripts, priced at half what they paid for the general-purpose tier."

PUBLISHER ATTRIBUTION
Lead with the source name as the actor. For first-party posts (e.g. source = "Anthropic"): "Anthropic released…". For press coverage (e.g. source = "Bloomberg Technology"): "Bloomberg reports…" or "per Bloomberg…".

ACCURACY
Every claim must be implied by the headline title or by widely-known facts about the named company. Do not invent prices, dates, metrics, customers, or quotes. If the headline doesn't carry a number, don't invent one — describe the move and name the strategic motive without fabricating specifics.

HARD RULES
- 1–3 sentences total. No exclamation marks. At most one em-dash per sentence.
- The bolded lead must NOT copy the headline title verbatim. Reuse no more than 3 consecutive words from the title.
- Vary the lead verb across items — don't default to "announced".
- The second sentence must not begin with "This". Name the actor or motive directly.
- Don't end on speculation, hedging, or "watch this space". If sentence 3 would be filler, drop it.
- No corporate-checklist laundry lists ("changes things for procurement, integration, security, compliance, ROI…"). Pick ONE mechanism and name it.
- No "could / may / might / potentially / increasingly" hedges in sentence 3. State the trend or omit the sentence.

BANNED VOCABULARY (never use, anywhere)
  AI-ese filler: "what's interesting is", "in a world where", "in an era of", "in this landscape", "speaks volumes", "sends a clear message", "not just X but Y", "not just X but also Y", "isn't merely", "more than just", "what's striking", "points to", "growing trend", "growing response", "highlights the growing appetite", "reflecting a broader trend", "positions itself", "leverages", "drives value", "present(s) a picture", "paints a picture"
  Cinematic drama: "watershed moment", "seismic shift", "existential threat", "dramatically reshape", "fundamentally redefine", "transformative" (standalone), "face obsolescence", "saturated market", "beleaguered", "shaken"
  Speculative competitive claims: "leaving X at a disadvantage", "challenging incumbents", "putting pressure on rivals", "puts pressure on", "intensifying scrutiny", "raising stakes", "decisive move", "competitive edge", "direct challenge", "forcing incumbents", "rivals will struggle"
  Vague hedging: "remains to be seen", "questions remain", "concerns linger", "the path forward is uncertain", "raises concerns", "raises questions", "it remains unclear", "much will depend on", "the jury is still out", "time will tell", "stakeholders should consider", "could enhance", "may prove", "could become", "may need to adapt", "may reshape", "could reshape", "could influence", "could enable"
  Hedging adverbs (filler softeners): "potentially" (as a stand-alone hedge), "significantly" (as a stand-alone modifier — name the magnitude or delete), "increasingly" (when paired with vague verbs like "reevaluating", "exploring", "adapting")
  Lack-of-clarity cluster: "clarity is lacking", "lacks clarity", "details remain undisclosed", "details are sparse", "details remain", "falls short" (as generic critique). If you flag a missing detail, name what's missing — a number, a date, a scope.
  Dramatic verbs: "must now brace", "severely impair", "forced to bolster", "scramble to", "rush to", "race to", "double down on" (when not literally 2x)
  Abstract business nouns: "operational capabilities", "competitive landscape", "scalability potential", "enhancements", "functionality", "actionable improvements", "strategic synergies", "value proposition", "market dynamics", "growth trajectory", "core competencies", "key differentiators", "operational frameworks", "innovation processes", "data-driven insights", "customer engagement strategies", "strategic execution", "integration efforts"
  Corporate-checklist jargon: "procurement cycles", "compliance burden", "ROI timelines", "vendor lock-in", "switching costs", "workflow displacement", "operator implications", "for CIOs evaluating vendors", "enterprise buyers should"
  Filler transition verbs: "underscores", "highlights" (as a filler transition between sentences — name what is highlighted, or delete), "signals" / "signaling" (when used vaguely — name what the signal is), "thereby" (academic-register connector — restructure)
  Generic "this [noun]" references: "this technology" (when referring to AI), "this development", "this initiative", "this approach", "this expansion", "this ambitious goal" — the "this [generic-noun]" pattern is the tell of a summarizer. Name the specific capability, model, product, or company.
  Other: "formidable" (as a company descriptor), "structural" (pick a concrete word), "swiftly" (use "quickly")

BANNED SENTENCE TEMPLATES (the biggest "AI slop" tell — the shape of the sentence repeats even when the words vary)
  - "X announced Y. This [highlights/signals/suggests/underscores/reflects] Z." Kill this formulaic 2-sentence structure entirely. The second sentence must not start with "This"; restructure to name the actor or consequence directly.
  - "This reflects not just X but also suggests Y" — banned.
  - "This [ambitious/strategic/significant] [goal/move/initiative] underscores X" — banned.
  - "This expansion allows for X" / "This initiative targets X" / "This approach could enable X" / "This development could influence X" — banned.
  - "X may now need to adapt their Y" / "Y must implement operational shifts" — banned hedge-prediction template.

NO ACADEMIC REGISTER
If a sentence sounds like a research-paper abstract ("Addressing semantics-structure decoupling is vital for advancing data management"), rewrite it as something a working operator at the affected company would actually say.

FINANCIAL EVENTS (IPOs, funding rounds, M&A, earnings)
"Investor confidence" / "growth trajectory" / "valuation milestone" framings are filler. Either name a concrete commercial change (pricing power, who they can now buy, customer-concentration risk) or keep it observational — round size, lead investor, valuation, headline number from the print — and stop there.

Return ONLY this JSON, no prose:
{ "commentary": [{ "id": <number>, "text": "<1-3 analyst sentences with bolded lead clause>" }, ...] }

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
