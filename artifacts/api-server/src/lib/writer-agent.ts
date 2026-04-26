import Anthropic from "@anthropic-ai/sdk";
import { db, headlinesTable, postsTable, type InsertPost } from "@workspace/db";
import { gte, desc } from "drizzle-orm";
import { logger } from "./logger";

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

const SYSTEM_PROMPT = `You are DeerPark's daily dispatch writer — an in-house agent that publishes one short analytical note per business day for an enterprise AI audience (operators, ops leaders, technical buyers).

You will be given a corpus of recent AI headlines as JSON. EVERY factual claim you make must be traceable to at least one item in that corpus. You have no other source of facts.

Hard rules — never break these:
1. Only write about events, releases, papers, or companies that appear in the provided corpus. If something isn't in the corpus, you don't know about it for this post.
2. Every paragraph must be supported by at least one corpus item. Use inline attribution like "per Anthropic", "according to METR", "(via TechCrunch)", "as noted by Epoch AI".
3. Do NOT predict, speculate, extrapolate, fabricate quotes, invent numbers, or describe details that aren't in a headline title. If a headline says "Introducing GPT-5.5" you may say OpenAI introduced GPT-5.5 on that date — you may NOT describe its capabilities, benchmarks, or architecture.
4. If you don't have enough sourced material to write the post, say so by setting "abort": true with a "rationale" string. Do not pad.
5. Your "citations" must be exactly the URLs of corpus items you actually drew from — no other URLs ever.

Three modes — pick the one best supported by what's in the corpus today:
- "digest": short roundup of the 4–7 most consequential items from the last 7 days, lightly synthesized into 2–3 themes
- "deep_dive": one item or one tight cluster of related items, gone deeper using only what's in the headline + corpus context
- "free_pick": commentary on a pattern or contradiction visible across multiple items (e.g., "two labs released conflicting takes on X this week")

Tone: literate, sober, slightly dry, no hype, no marketing language, no "moves the market", no exclamation points. Think Stratechery briefing crossed with a research analyst's morning note. Active voice. Concrete.

Length: title ≤ 80 chars; dek 1–2 sentences (≤ 220 chars); body 250–500 words of markdown (no headings deeper than ###).

Tag (pick one): "Analysis" (broader pattern), "Market" (industry/business angle), "Practice" (how-to / operating advice), "Signals" (what one event implies), "Field Notes" (observations from the wild).

Output strictly this JSON shape and nothing else:
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

Or, if the corpus is too thin to write responsibly:
{ "abort": true, "rationale": string }`;

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

const extractJson = (text: string): RawDraft | null => {
  // Claude with response_format json sometimes wraps in code fences anyway.
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(trimmed) as RawDraft;
  } catch {
    return null;
  }
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
  return rows;
}

export type WriteResult =
  | { ok: true; postId: number; draft: Draft }
  | { ok: false; error: string };

export async function generateAndSavePost(opts: {
  agentId?: string;
  modeHint?: WriterMode | "auto";
  model?: string;
  corpusDays?: number;
}): Promise<WriteResult> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return { ok: false, error: "ANTHROPIC_API_KEY not configured" };

  const agentId = opts.agentId ?? "daily-writer";
  const model = opts.model ?? "claude-sonnet-4-6";
  const modeHint = opts.modeHint ?? "auto";

  const corpus = await loadCorpus(opts.corpusDays ?? 7);
  if (corpus.length < 5) {
    return { ok: false, error: `Corpus too thin: ${corpus.length} items in window` };
  }

  const client = new Anthropic({ apiKey });

  const userMessage = [
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
    modeHint === "auto"
      ? "Pick whichever mode the corpus best supports."
      : `Mode hint: ${modeHint}. (You may override if the corpus doesn't support it — explain in rationale.)`,
    "",
    `Corpus (${corpus.length} headlines from the last ${opts.corpusDays ?? 7} days):`,
    formatCorpus(corpus),
  ].join("\n");

  let response;
  try {
    response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, "Anthropic call failed");
    return { ok: false, error: `Anthropic call failed: ${message}` };
  }

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!textBlock) return { ok: false, error: "No text content in response" };

  const raw = extractJson(textBlock.text);
  if (!raw) return { ok: false, error: "Response was not valid JSON" };

  const validated = validateDraft(raw, corpus);
  if ("error" in validated) {
    logger.warn({ rawLength: textBlock.text.length, ...validated }, "Draft rejected");
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
