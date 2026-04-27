import OpenAI from "openai";
import {
  db,
  headlinesTable,
  postsTable,
  settingsTable,
  type InsertPost,
} from "@workspace/db";
import { gte, desc, eq } from "drizzle-orm";
import { logger } from "./logger";
import { SOURCES } from "./headline-sources";

// Provider-agnostic via OpenAI-compatible SDK. Default points at Venice AI;
// override with LLM_BASE_URL to swap to OpenRouter, Together, Anthropic
// (with their OpenAI-compat shim), etc.
const DEFAULT_BASE_URL = "https://api.venice.ai/api/v1";
const DEFAULT_MODEL = "claude-sonnet-4-5";

// USD per 1M tokens. Approximate published rates — Venice's actual VCU/Diem
// charge differs but this gives a comparable cost estimate. Update as model
// pricing changes; historical posts keep the cost computed at write time.
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic Claude (passthrough rates)
  "claude-opus-4-7": { input: 15, output: 75 },
  "claude-opus-4-6": { input: 15, output: 75 },
  "claude-opus-4-6-fast": { input: 15, output: 75 },
  "claude-opus-4-5": { input: 15, output: 75 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet-4-5": { input: 3, output: 15 },
  // OpenAI
  "openai-gpt-55": { input: 5, output: 20 },
  "openai-gpt-55-pro": { input: 15, output: 60 },
  "openai-gpt-54": { input: 2.5, output: 10 },
  "openai-gpt-54-mini": { input: 0.15, output: 0.6 },
  // Google
  "gemini-3-1-pro-preview": { input: 2.5, output: 10 },
  "gemini-3-flash-preview": { input: 0.3, output: 1.2 },
  // Open / smaller models — Venice rates approximate
  "deepseek-v4-pro": { input: 0.6, output: 2.4 },
  "deepseek-v4-flash": { input: 0.15, output: 0.6 },
  "kimi-k2-6": { input: 0.5, output: 2 },
  "qwen3-235b-a22b-instruct-2507": { input: 0.4, output: 1.5 },
  "qwen3-coder-480b-a35b-instruct": { input: 0.8, output: 3 },
  "qwen3-5-9b": { input: 0.05, output: 0.15 },
  "llama-3.3-70b": { input: 0.4, output: 1.2 },
  "llama-3.2-3b": { input: 0.04, output: 0.06 },
  "mistral-small-2603": { input: 0.2, output: 0.6 },
  "zai-org-glm-4.7": { input: 0.5, output: 1.5 },
  "zai-org-glm-5": { input: 0.6, output: 2 },
};

const FALLBACK_PRICING = { input: 1, output: 3 };

function priceForModel(model: string): { input: number; output: number } {
  return MODEL_PRICING[model] ?? FALLBACK_PRICING;
}

function computeCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): string {
  const { input, output } = priceForModel(model);
  const cost = (promptTokens * input + completionTokens * output) / 1_000_000;
  return cost.toFixed(8);
}

// Corpus capping. The 7-day window can hold hundreds of items (arXiv alone
// fires ~50/day); shipping all of them as input bloats per-call cost. Cap
// at 2 per source for diversity, then top N by tier × recency.
const CORPUS_MAX_ITEMS = 30;
const CORPUS_PER_SOURCE_CAP = 2;
const SOURCE_TIER = new Map(SOURCES.map((s) => [s.displayName, s.tier]));
const TIER_WEIGHTS: Record<number, number> = { 1: 4, 2: 3, 3: 2, 4: 1 };
const HALF_LIFE_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function scoreCorpusItem(item: CorpusItem, now: number): number {
  const tier = SOURCE_TIER.get(item.source) ?? 4;
  const tierWeight = TIER_WEIGHTS[tier] ?? 1;
  const ageDays = Math.max(0, (now - item.publishedAt.getTime()) / MS_PER_DAY);
  const decay = Math.exp((-Math.LN2 * ageDays) / HALF_LIFE_DAYS);
  return tierWeight * decay;
}

// The writer agent reads our 7-day rolling headline corpus and produces one
// post per day. Anti-hallucination is enforced by:
//   1. The model is told to *only* make claims supported by the corpus.
//   2. Every citation URL is validated to be a URL we actually ingested.
//      If any citation isn't in the corpus, we reject the draft.
//   3. Every sourceHeadlineId is validated against the corpus IDs.
//   4. The model is asked to write attribution inline (per X / according to
//      Y) rather than free-form analysis with no source.

const ALLOWED_TAGS = ["Analysis", "Market", "Practice", "Signals", "Field Notes"] as const;
const ALLOWED_MODES = ["digest", "deep_dive", "free_pick"] as const;

export type WriterMode = (typeof ALLOWED_MODES)[number];
export type WriterTag = (typeof ALLOWED_TAGS)[number];

export type CorpusItem = {
  id: number;
  source: string;
  category: string;
  title: string;
  url: string;
  publishedAt: Date;
};

export type Draft = {
  mode: WriterMode;
  tag: WriterTag;
  title: string;
  dek: string;
  bodyMarkdown: string;
  citations: string[];
  sourceHeadlineIds: number[];
  rationale: string;
};

export const DEFAULT_SYSTEM_PROMPT = `You are DeerPark's daily dispatch — one columnist publishing one analytical note per business day for an enterprise AI audience (operators, ops leaders, technical buyers). Your readers are smart, busy, skeptical. They don't need AI defined.

You will be given a corpus of recent AI headlines as JSON. EVERY factual claim must be traceable to at least one corpus item. You have no other source of facts.

Hard rules — never break:
1. Only write about events, releases, papers, or companies in the corpus.
2. Every claim is attributed inline: "per Anthropic", "according to METR", "(via TechCrunch)".
3. Do NOT predict, speculate, fabricate quotes, invent numbers, or describe details not in the headline title. If a headline says "Introducing GPT-5.5", you may say OpenAI introduced it on that date — you may NOT describe its capabilities, benchmarks, or architecture.
4. If the corpus is too thin, set "abort": true with a "rationale". Don't pad.
5. "citations" must be exactly the corpus URLs you drew from — no others, ever.

THE THREE MODES ARE STRUCTURALLY DIFFERENT. Pick the one the corpus supports today, then follow its shape — different length, different structure, different cadence.

==== digest (250–380 words) ====
Goal: cover 3–6 of the week's most consequential corpus items, tied together by a single short framing thesis at the top.
Structure:
  - Opening: 1–2 sentences naming what the week was about. State the thesis as a claim, not a summary.
  - Body: short paragraphs (2–4 sentences each), one per item or grouped item. Each paragraph follows a fixed shape:
      (1) WHAT happened, attributed: "Anthropic added agent-to-agent commerce to Claude Code (per Anthropic)."
      (2) WHY it matters for the reader: "For ops teams already wrestling with auth across internal tools, this is the first frontier-lab attempt to formalize machine-to-machine purchasing."
      (3) WHAT to do or watch (when the corpus supports it): "If you've been deferring agent commerce, this resets the conversation."
    Skip part (3) only if the corpus doesn't support it. Never skip (2). A paragraph without (2) is a recap, not a digest.
  - Close: one sentence noting what to watch. Not a prediction — a question or a tension worth tracking.
Voice: brisk, scannable, expository. Senior analyst's morning email.

==== deep_dive (480–680 words) ====
Goal: one corpus item or one tight cluster (max 3 items on the same subject), examined thoroughly. Not a survey of the week.
Structure:
  - Hook: 1 short paragraph (≤ 3 sentences). The concrete thing that happened, anchored.
  - What happened: 1 paragraph. Attributed details from the corpus.
  - What's actually new about it: 1–2 paragraphs. The interpretation. Why this matters that the headline alone doesn't carry.
  - Who it changes things for: 1 paragraph. Specific reader segment.
  - Close: 1 paragraph. The remaining open question.
Voice: investigative, careful at the sentence level, comfortable holding a single idea for several paragraphs. Stratechery brief.
This mode MUST be longer than digest. If you can't fill 480 words from the corpus, switch modes — don't pad.

==== free_pick (320–450 words) ====
Goal: a pattern, contradiction, or conspicuous absence visible across multiple corpus items.
Structure:
  - State the pattern in the opening line.
  - Cite the items that show it (each attributed).
  - Say why it's interesting / what it reveals.
  - Resist the urge to predict.
Voice: observational, slightly wry, essayistic. More writerly than digest, less depth than deep_dive.

Across all modes:
- Hold the post to ONE thesis. If it doesn't fit on a sticky note, narrow.
- Every paragraph advances the thesis. Don't pad with topic-shifts that read as a list of unrelated facts.
- INTERPRET, don't recap. The reader has already seen the headlines. Your job is to tell them what these items MEAN — for their work, their stack, their planning. After every fact, the next beat is "and so" or "which is interesting because" or "for buyers, this implies". Without interpretation, you are wasting their time.
- Connect items, don't list them. When two corpus items bear on each other, name the connection in plain English: "Both Anthropic and OpenAI published in the same week, but…" / "DeepMind's release sits next to Epoch's chart showing…" Adjacency in the corpus is not a connection — explicit reasoning is.
- Each item earns its inclusion. If you cite a headline, you must say something specific about why that item matters here. If you can't, drop it.
- Active verbs, concrete nouns, specific over generic.
- Vary sentence length within paragraphs but stay coherent.
- One opinion, clearly held. Don't both-sides routine claims.
- Trust the reader. Don't define jargon. No "this is significant because…". No "It will be interesting to see…".

NO FLOATING ABSTRACTIONS. Short pseudo-profound sentences like "The gap is structural", "The story is consolidation", "Scale wins again", "It comes down to incentives" sound like writing but say nothing. Every assertion must be grounded by the specific corpus item or items that justify it. If you write a sentence like that, the next sentence must immediately name the concrete thing it refers to — and if the concrete thing isn't in the corpus, delete the abstract sentence.

Title (≤ 80 chars): describes what the post is about. Specific beats clever. NOT clickbait.
  Good: "OpenAI's pricing card buries a sharper point"
  Bad: "OpenAI Drops Bombshell" (clickbait), "Model Releases Pile Up" (too vague), "What GPT-5.5 Means For You" (LLM cliché)

Dek (1–2 sentences, ≤ 220 chars): state the thesis directly. Not a teaser.

Forbidden phrases (mark you as an LLM, not a writer): "moves the market", "in this rapidly evolving landscape", "it's worth noting", "let's dive in", "navigate the complexities", "It will be interesting to see", "in conclusion", "stay tuned", exclamation points, em-dash chains, headers named "Introduction" or "Conclusion".

Tag (pick the one that fits the post you actually wrote — don't shoehorn):
- Analysis: broad pattern across multiple items
- Market: industry/business angle (pricing, deals, distribution)
- Practice: operating advice readers can use
- Signals: one event's downstream implications
- Field Notes: observations from the wild

CRITICAL output format: respond with ONE JSON object and absolutely nothing else. No prose before, no prose after, no code fences. First character is {, last is }. Anything outside the JSON gets the post rejected.

Schema:
{
  "mode": "digest" | "deep_dive" | "free_pick",
  "tag": "Analysis" | "Market" | "Practice" | "Signals" | "Field Notes",
  "title": string,
  "dek": string,
  "bodyMarkdown": string,
  "citations": string[],
  "sourceHeadlineIds": number[],
  "rationale": string
}

Or, if the corpus is too thin:
{ "abort": true, "rationale": string }`;

const promptKeyFor = (agentId: string) => `writer.${agentId}.system_prompt`;

export async function getSystemPrompt(agentId: string): Promise<{ prompt: string; isCustom: boolean }> {
  const [row] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, promptKeyFor(agentId)))
    .limit(1);
  if (row?.value) return { prompt: row.value, isCustom: true };
  return { prompt: DEFAULT_SYSTEM_PROMPT, isCustom: false };
}

export async function setSystemPrompt(agentId: string, value: string): Promise<void> {
  const key = promptKeyFor(agentId);
  await db
    .insert(settingsTable)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function resetSystemPrompt(agentId: string): Promise<void> {
  await db.delete(settingsTable).where(eq(settingsTable.key, promptKeyFor(agentId)));
}

const formatCorpus = (corpus: CorpusItem[]): string => {
  return corpus
    .map((c) => {
      const date = c.publishedAt.toISOString().slice(0, 10);
      return `[id=${c.id}] (${date}) [${c.source} · ${c.category}] ${c.title} — ${c.url}`;
    })
    .join("\n");
};

type RawDraft = {
  mode?: string;
  tag?: string;
  title?: string;
  dek?: string;
  bodyMarkdown?: string;
  citations?: unknown;
  sourceHeadlineIds?: unknown;
  rationale?: string;
  abort?: boolean;
};

// Pull the JSON object out of model output. Some providers (Venice) silently
// drop response_format=json_object, so the model may emit prose around the
// JSON or wrap it in code fences. Strategy: try the whole thing, then strip
// fences, then scan for the largest brace-balanced substring.
const extractJson = (text: string): RawDraft | null => {
  const tryParse = (s: string): RawDraft | null => {
    try {
      return JSON.parse(s) as RawDraft;
    } catch {
      return null;
    }
  };

  const trimmed = text.trim();
  let r = tryParse(trimmed);
  if (r) return r;

  const defenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  r = tryParse(defenced);
  if (r) return r;

  // Brace-balanced scan: find the first { and walk to its matching }.
  // Tracks string state so braces inside strings don't break the count.
  const start = defenced.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < defenced.length; i++) {
    const ch = defenced[i];
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
        return tryParse(defenced.slice(start, i + 1));
      }
    }
  }
  return null;
};

const validateDraft = (raw: RawDraft, corpus: CorpusItem[]): Draft | { error: string } => {
  if (raw.abort) {
    return { error: `Agent aborted: ${raw.rationale ?? "no rationale"}` };
  }
  if (typeof raw.mode !== "string" || !(ALLOWED_MODES as readonly string[]).includes(raw.mode)) {
    return { error: `Invalid mode: ${raw.mode}` };
  }
  if (typeof raw.tag !== "string" || !(ALLOWED_TAGS as readonly string[]).includes(raw.tag)) {
    return { error: `Invalid tag: ${raw.tag}` };
  }
  if (typeof raw.title !== "string" || !raw.title.trim()) return { error: "Missing title" };
  if (typeof raw.dek !== "string" || !raw.dek.trim()) return { error: "Missing dek" };
  if (typeof raw.bodyMarkdown !== "string") {
    return { error: "Missing bodyMarkdown" };
  }
  // Per-mode minimum body length so deep_dive can't be the same size as
  // digest — one of the user complaints was that all modes read identically.
  const bodyLen = raw.bodyMarkdown.length;
  const minByMode: Record<string, number> = {
    digest: 1200,
    deep_dive: 2400,
    free_pick: 1500,
  };
  const minLen = minByMode[String(raw.mode)] ?? 1200;
  if (bodyLen < minLen) {
    return { error: `Body too short for ${raw.mode}: ${bodyLen} chars (need ≥ ${minLen})` };
  }
  if (!Array.isArray(raw.citations) || raw.citations.length === 0) {
    return { error: "Missing citations" };
  }
  if (!Array.isArray(raw.sourceHeadlineIds) || raw.sourceHeadlineIds.length === 0) {
    return { error: "Missing sourceHeadlineIds" };
  }

  // Anti-hallucination check: every citation URL must be in the corpus.
  const corpusUrls = new Set(corpus.map((c) => c.url));
  const corpusIds = new Set(corpus.map((c) => c.id));
  const citations = raw.citations.filter((c): c is string => typeof c === "string");
  const ids = raw.sourceHeadlineIds.filter((n): n is number => typeof n === "number");

  const badUrls = citations.filter((u) => !corpusUrls.has(u));
  if (badUrls.length > 0) {
    return { error: `Hallucinated URLs not in corpus: ${badUrls.join(", ")}` };
  }
  const badIds = ids.filter((id) => !corpusIds.has(id));
  if (badIds.length > 0) {
    return { error: `Hallucinated headline IDs: ${badIds.join(", ")}` };
  }
  if (citations.length === 0) return { error: "No valid citations remain after filtering" };
  if (ids.length === 0) return { error: "No valid sourceHeadlineIds after filtering" };

  return {
    mode: raw.mode as WriterMode,
    tag: raw.tag as WriterTag,
    title: raw.title.trim(),
    dek: raw.dek.trim(),
    bodyMarkdown: raw.bodyMarkdown.trim(),
    citations,
    sourceHeadlineIds: ids,
    rationale: raw.rationale ?? "",
  };
};

export async function loadCorpus(days = 7): Promise<CorpusItem[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
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
    .where(gte(headlinesTable.publishedAt, since))
    .orderBy(desc(headlinesTable.publishedAt));

  // Per-source cap first so high-volume feeds (arXiv, HN) can't crowd out
  // weekly-cadence labs.
  const perSourceCount = new Map<string, number>();
  const candidates: CorpusItem[] = [];
  for (const row of rows) {
    const count = perSourceCount.get(row.source) ?? 0;
    if (count >= CORPUS_PER_SOURCE_CAP) continue;
    perSourceCount.set(row.source, count + 1);
    candidates.push(row);
  }

  // Then rank by tier × recency and take the top N.
  const now = Date.now();
  candidates.sort((a, b) => scoreCorpusItem(b, now) - scoreCorpusItem(a, now));
  return candidates.slice(0, CORPUS_MAX_ITEMS);
}

export type WriteResult =
  | { ok: true; postId: number; draft: Draft }
  | { ok: false; error: string };

export function getModelInfo(): { model: string; baseUrl: string; configured: boolean } {
  return {
    model: process.env["LLM_MODEL"] ?? DEFAULT_MODEL,
    baseUrl: process.env["LLM_BASE_URL"] ?? DEFAULT_BASE_URL,
    configured: Boolean(process.env["LLM_API_KEY"]),
  };
}

export async function generateAndSavePost(opts: {
  agentId?: string;
  modeHint?: WriterMode | "auto";
  model?: string;
  corpusDays?: number;
}): Promise<WriteResult> {
  const apiKey = process.env["LLM_API_KEY"];
  if (!apiKey) return { ok: false, error: "LLM_API_KEY not configured" };

  const agentId = opts.agentId ?? "daily-writer";
  const baseURL = process.env["LLM_BASE_URL"] ?? DEFAULT_BASE_URL;
  const model = opts.model ?? process.env["LLM_MODEL"] ?? DEFAULT_MODEL;
  const modeHint = opts.modeHint ?? "auto";

  const corpus = await loadCorpus(opts.corpusDays ?? 7);
  if (corpus.length < 5) {
    return { ok: false, error: `Corpus too thin: ${corpus.length} items in window` };
  }

  const client = new OpenAI({ apiKey, baseURL });

  const { prompt: systemPrompt } = await getSystemPrompt(agentId);

  const userMessage = [
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
    modeHint === "auto"
      ? "Pick whichever mode the corpus best supports."
      : `Mode hint: ${modeHint}. (You may override if the corpus doesn't support it — explain in rationale.)`,
    "",
    `Corpus (${corpus.length} headlines from the last ${opts.corpusDays ?? 7} days):`,
    formatCorpus(corpus),
  ].join("\n");

  let responseText: string;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  try {
    const response = await client.chat.completions.create({
      model,
      // 8192 leaves headroom for hidden reasoning tokens (Claude on Venice
      // appears to use them) plus the 250–680 word body. Smaller models
      // ignore the unused budget — no extra cost.
      max_tokens: 8192,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
    });
    responseText = response.choices[0]?.message?.content ?? "";
    promptTokens = response.usage?.prompt_tokens ?? 0;
    completionTokens = response.usage?.completion_tokens ?? 0;
    totalTokens = response.usage?.total_tokens ?? promptTokens + completionTokens;
    if (!responseText) {
      // Surface why the response is empty — finish_reason, tool calls, refusal,
      // content filter, etc. — so we can act on it instead of guessing.
      const choice = response.choices[0];
      const message = choice?.message as
        | { refusal?: unknown; tool_calls?: unknown }
        | undefined;
      logger.warn(
        {
          model,
          baseURL,
          finishReason: choice?.finish_reason,
          refusal: message?.refusal,
          toolCalls: message?.tool_calls,
          usage: response.usage,
          rawChoice: JSON.stringify(choice).slice(0, 1000),
        },
        "Empty response from model",
      );
      return {
        ok: false,
        error: `Empty response from model (finish_reason=${choice?.finish_reason ?? "?"})`,
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message, model, baseURL }, "LLM call failed");
    return { ok: false, error: `LLM call failed: ${message}` };
  }

  const raw = extractJson(responseText);
  if (!raw) {
    logger.warn(
      { model, baseURL, rawPreview: responseText.slice(0, 500), rawLength: responseText.length },
      "Response was not valid JSON",
    );
    return { ok: false, error: "Response was not valid JSON" };
  }

  const validated = validateDraft(raw, corpus);
  if ("error" in validated) {
    logger.warn({ rawLength: responseText.length, ...validated }, "Draft rejected");
    return { ok: false, error: validated.error };
  }

  const costUsd = computeCost(model, promptTokens, completionTokens);
  const insert: InsertPost = {
    agentId,
    mode: validated.mode,
    tag: validated.tag,
    title: validated.title,
    dek: validated.dek,
    bodyMarkdown: validated.bodyMarkdown,
    citations: validated.citations,
    sourceHeadlineIds: validated.sourceHeadlineIds,
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd,
  };
  const [row] = await db.insert(postsTable).values(insert).returning({ id: postsTable.id });
  if (!row) return { ok: false, error: "Insert returned no row" };

  logger.info(
    {
      postId: row.id,
      mode: validated.mode,
      tag: validated.tag,
      citations: validated.citations.length,
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd,
    },
    "Post written",
  );

  return { ok: true, postId: row.id, draft: validated };
}

let writerHandle: NodeJS.Timeout | null = null;

const WRITER_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function hasPostInLast24h(): Promise<boolean> {
  const since = new Date(Date.now() - WRITER_INTERVAL_MS);
  const rows = await db
    .select({ id: postsTable.id })
    .from(postsTable)
    .where(gte(postsTable.publishedAt, since))
    .limit(1);
  return rows.length > 0;
}

export function startWriterScheduler(intervalMs = WRITER_INTERVAL_MS): void {
  if (writerHandle) return;

  const tick = async () => {
    try {
      if (await hasPostInLast24h()) {
        logger.info("Writer tick: post already exists in last 24h, skipping");
        return;
      }
      logger.info("Writer tick: generating post");
      const result = await generateAndSavePost({});
      if (!result.ok) logger.warn({ error: result.error }, "Writer tick failed");
    } catch (err) {
      logger.error({ err }, "Writer tick threw");
    }
  };

  // Kick off after 30s so the server is fully up; then every interval.
  setTimeout(() => void tick(), 30_000);
  writerHandle = setInterval(() => void tick(), intervalMs);
}
