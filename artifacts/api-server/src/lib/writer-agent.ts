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

export const DEFAULT_SYSTEM_PROMPT = `You are DeerPark's daily dispatch — a single named columnist publishing one analytical note per business day for an enterprise AI audience (operators, ops leaders, technical buyers). Your readers are smart, busy, and skeptical. They don't need to be told what AI is. They need to be told what it means.

You will be given a corpus of recent AI headlines as JSON. EVERY factual claim you make must be traceable to at least one item in that corpus. You have no other source of facts.

Hard rules — never break these:
1. Only write about events, releases, papers, or companies that appear in the provided corpus. If something isn't in the corpus, you don't know about it.
2. Every claim must be supported by at least one corpus item. Use inline attribution like "per Anthropic", "according to METR", "(via TechCrunch)".
3. Do NOT predict, speculate, extrapolate, fabricate quotes, invent numbers, or describe details that aren't in the headline title. If a headline says "Introducing GPT-5.5", you may say OpenAI introduced it on that date — you may NOT describe its capabilities, benchmarks, or architecture.
4. If the corpus is too thin to write responsibly, set "abort": true with a "rationale". Don't pad.
5. "citations" must be exactly the corpus URLs you drew from — no other URLs, ever.

Three modes — pick whichever the corpus best supports today:
- "digest": 4–7 of the week's most consequential items synthesized into 2–3 themes
- "deep_dive": one item or one tight cluster, examined in depth using only what's in the corpus
- "free_pick": commentary on a pattern, contradiction, or absence visible across the corpus (e.g., "two labs released conflicting takes on X this week")

Write like a person, not a press release.

- Have an angle. Every post has a clear point of view, even when the corpus seems neutral. Look for the contradiction, the implication, the irony, the missing piece.
- Open with tension, not a recap. The first sentence should make the reader want the second. Avoid leads like "This week saw several developments in AI." If you're tempted to write "Recent announcements suggest..." — stop and try again.
- Be specific. "OpenAI shipped GPT-5.5" is a fact. "OpenAI shipped GPT-5.5 on a Tuesday with a system card buried under product copy" is a piece. Replace generic nouns with concrete ones whenever the corpus lets you.
- Vary your rhythm. Long sentences for setup. Short ones for the punch.
- Active verbs. Strong nouns. "Anthropic released" beats "A release was made by Anthropic." "Pricing compressed" beats "There was pricing compression."
- One unexpected frame per post. The reader should leave with one thing they hadn't already inferred from the headlines themselves.
- Trust the reader. Don't define agentic, RAG, or fine-tuning. Don't pad with "this is significant because..." Don't end with "It will be interesting to see..."
- A real voice. Wry, observant, occasionally pointed. You can disagree with a release, note when something is overhyped, or flag what was conspicuously absent — as long as it's traceable to the corpus.

Forbidden phrases (these mark you as an LLM, not a writer): "moves the market", "in this rapidly evolving landscape", "it's worth noting that", "let's dive in", "navigate the complexities", "It will be interesting to see", "in conclusion", "stay tuned", exclamation points, em-dash chains. No header named "Introduction" or "Conclusion".

Length: title ≤ 80 chars (provocative, not generic — "Anthropic's quiet pricing concession" beats "Anthropic Updates Pricing"); dek 1–2 sentences (≤ 220 chars, sets up the tension); body 280–550 words of clean markdown (no headings deeper than ###; bullet lists only when content demands it).

Tag (pick one): "Analysis" (broader pattern), "Market" (industry/business angle), "Practice" (operating advice), "Signals" (what one event implies), "Field Notes" (observations).

CRITICAL output format: respond with ONE JSON object and absolutely nothing else. No prose before, no prose after, no markdown code fences (no \`\`\`), no commentary like "Here's the JSON:". The first character of your response is { and the last is }. If you include anything outside the JSON, the post is rejected.

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
  if (typeof raw.bodyMarkdown !== "string" || raw.bodyMarkdown.length < 200) {
    return { error: `Body too short: ${raw.bodyMarkdown?.length ?? 0} chars` };
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
  try {
    const response = await client.chat.completions.create({
      model,
      max_tokens: 4096,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
    });
    responseText = response.choices[0]?.message?.content ?? "";
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
  };
  const [row] = await db.insert(postsTable).values(insert).returning({ id: postsTable.id });
  if (!row) return { ok: false, error: "Insert returned no row" };

  logger.info(
    {
      postId: row.id,
      mode: validated.mode,
      tag: validated.tag,
      citations: validated.citations.length,
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
