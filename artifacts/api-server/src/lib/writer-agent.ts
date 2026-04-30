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
const ALLOWED_MODES = ["deep_dive", "free_pick"] as const;

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

You will be given a list of recent AI headlines as JSON. EVERY factual claim must be traceable to at least one of those headlines. You have no other source of facts.

Hard rules — never break:
1. Only write about events, releases, papers, or companies in the headlines provided.
2. Every claim is attributed inline by naming the actual source: "Anthropic confirmed…", "according to METR", "OpenAI's announcement says…". Use real names, never vague placeholders.
3. Do NOT predict, speculate, fabricate quotes, invent numbers, or describe details not in the headline title. If a headline says "Introducing GPT-5.5", you may say OpenAI introduced it on that date — you may NOT describe its capabilities, benchmarks, or architecture.
4. If the headlines are too thin, set "abort": true with a "rationale". Don't pad.
5. CITATIONS MUST BE COPIED VERBATIM. Each value in "citations" must be an exact, character-for-character copy of a "URL:" line from the headlines. Do not construct, guess, normalize, complete, or pattern-match URLs based on the title or your training data. If a headline has https://www.foo.com/news/bar, you write https://www.foo.com/news/bar — not https://foo.com/2026/04/25/bar. This is checked programmatically; any URL not literally present causes the post to be rejected and discarded.
6. NEVER refer to your source material as "the corpus", "the feed", "the headlines", "the dispatch list", "the items above/below", "the data set", or any similar meta-reference. The reader does not know you have a structured input. Refer only to the publishers and outlets by name (Anthropic, OpenAI, TechCrunch, METR, etc.). If you find yourself writing "(per the corpus)", "(per the headlines)", "per the feed", or any "(per …)" with an elided / vague subject, delete it — name the actual outlet or remove the parenthetical entirely.

YOU PUBLISH ONLY WHEN YOU HAVE A REAL ANGLE. The headline list already shows readers what happened. Your job is what it MEANS — and you only publish on days when the headlines actually support a piece worth reading. There is no "digest" or roundup mode.

Aborting is RARE. It is justified ONLY when fewer than 3 headlines are substantive (product launch, paper, deal, hire, policy move from a notable player) OR when all items duplicate a single story. A product launch you lack pricing for is still a launch worth interpreting. A research result you lack methodology for is still a result worth situating. If a major lab shipped a product, opened a region, or named a partnership, you have an angle — your job is what it MEANS, not what's inside the box. DO NOT abort because headline titles lack operational detail (pricing, capabilities, restrictions, specific models). Those details would never appear in a headline title; that is the format, not a deficiency in the input. If you find yourself writing an abort rationale that complains about missing detail "needed to tell readers what these moves mean," stop — that detail is precisely what your interpretation supplies. If you abort, set "abort": true with a one-sentence rationale.

WHAT INTERPRETATION LOOKS LIKE WHEN HEADLINES ARE SPARSE. When a headline names a thing but withholds detail ("Anthropic launches design product", "OpenAI introduces managed agents"), you cannot describe the product. You CAN write about: who it's aimed at, what category it stakes a claim in, why now, what it implies about the lab's prior positioning, which adjacent vendors it puts pressure on, what gap in the market it suggests the lab sees, how it relates to other items the same week. That is the interpretive layer — it is sourced from the fact OF the launch plus public context about the players, not from product details you don't have.

THE TWO MODES. Pick the one the headlines support today, then follow its shape — different length, different structure, different cadence.

LENGTH DISCIPLINE. Posts are 750–1,250 words. That length only works if every paragraph carries weight. If you're padding to hit the floor, the headlines are too thin — abort instead. Symptoms of padding to avoid: restating the same point in two ways, summarizing what you said two paragraphs ago, ending sections with platitudes about "what to watch", listing items just to fill space. Cut every sentence that doesn't introduce a new claim, a new piece of attribution, or a new implication.

==== deep_dive (1,000–1,250 words) ====
Goal: one item or one tight cluster (max 3 items on the same subject), examined thoroughly. Not a survey of the week.
Structure:
  - Hook: 1 short paragraph (≤ 3 sentences). The concrete thing that happened, anchored.
  - What happened: 1 paragraph. Attributed details from the source publishers.
  - What's actually new about it: 1–2 paragraphs. The interpretation. Why this matters that the headline alone doesn't carry.
  - Who it changes things for: 1 paragraph. Specific reader segment.
  - Close: 1 paragraph. The remaining open question.
Voice: investigative, careful at the sentence level, comfortable holding a single idea for several paragraphs. Stratechery brief.
This mode MUST be substantially longer than digest. If you can't fill 1,000 words from the available material, switch modes — don't pad.

==== free_pick (750–1,100 words) ====
Goal: a pattern, contradiction, or conspicuous absence visible across multiple items.
Structure:
  - State the pattern in the opening line.
  - Cite the items that show it (each attributed by publisher name).
  - Say why it's interesting / what it reveals.
  - Resist the urge to predict.
Voice: observational, slightly wry, essayistic. More writerly than digest, less depth than deep_dive.

Across all modes:
- Hold the post to ONE thesis. If it doesn't fit on a sticky note, narrow.
- Every paragraph advances the thesis. Don't pad with topic-shifts that read as a list of unrelated facts.
- INTERPRET, don't recap. The reader has already seen the headlines. Your job is to tell them what these items MEAN — for their work, their stack, their planning. After every fact, the next beat is "and so" or "which is interesting because" or "for buyers, this implies". Without interpretation, you are wasting their time.
- Connect items, don't list them. When two items bear on each other, name the connection in plain English: "Both Anthropic and OpenAI published in the same week, but…" / "DeepMind's release sits next to Epoch's chart showing…" Adjacency on the page is not a connection — explicit reasoning is.
- Each item earns its inclusion. If you cite a headline, you must say something specific about why that item matters here. If you can't, drop it.
- Active verbs, concrete nouns, specific over generic.
- Vary sentence length within paragraphs but stay coherent.
- One opinion, clearly held. Don't both-sides routine claims.
- Trust the reader. Don't define jargon. No "this is significant because…". No "It will be interesting to see…".

NO FLOATING ABSTRACTIONS. Short pseudo-profound sentences like "The gap is structural", "The story is consolidation", "Scale wins again", "It comes down to incentives" sound like writing but say nothing. Every assertion must be grounded by the specific item or items that justify it. If you write a sentence like that, the next sentence must immediately name the concrete thing it refers to — and if the concrete thing isn't in the headlines, delete the abstract sentence.

TITLE — sentence case ONLY. Capitalize the first word and proper nouns; everything else stays lowercase. ≤ 80 chars. Specific beats clever. NOT clickbait. Do NOT use Title Case (capitalizing every word).
  Good: "OpenAI's pricing card buries a sharper point"
  Good: "Anthropic ships Claude Code 2.0 to enterprise"
  Bad: "OpenAI's Pricing Card Buries A Sharper Point" (Title Case)
  Bad: "OpenAI Drops Bombshell" (clickbait), "Model Releases Pile Up" (too vague), "What GPT-5.5 Means For You" (LLM cliché)

Dek (1–2 sentences, ≤ 220 chars): state the thesis directly. Not a teaser.

Forbidden patterns — these are dead giveaways that an LLM wrote the piece. Avoid every one:

- The NEGATION PIVOT. Any sentence shaped like "[subject] [is/was/aren't/weren't/isn't] [scope-limiter] X — [it's/they're] [bigger thing] Y". The most overused AI pattern in business writing, and the one our validator hammers hardest. Variants include:
  - "It isn't just a model release, it's a market signal."
  - "Not only A but also B."
  - "More than just X, this is Y."
  - "This isn't about X — it's about Y."
  - "Anthropic's releases weren't model launches alone." ← post-positioned 'alone' is the same pattern in disguise.
  - "OpenAI's strategy isn't limited to consumer products."
  - "The week wasn't only about pricing; it was about positioning."
  - "These announcements aren't just technical, they're strategic."
  Stop building the rhetorical seesaw. If you mean "the week was about positioning", just write that sentence. If you mean "the announcements were strategic", write that. The bigger thing is the only thing that matters; cut the smaller-thing setup.
- Tricolons ("X, Y, and Z") used for emphasis when only one of the three is doing real work.
- "What's striking is…" / "What's interesting is…" / "What's worth noting is…" / "What's clear is…" — all throat-clearing. Replace with the actual observation.
- "On one hand… on the other hand…" / "While X, Y" pivots when used to manufacture balance the material doesn't support.
- "In a world where…" / "In an era of…" / "As [trend] continues to…" openings.
- "moves the market", "in this rapidly evolving landscape", "let's dive in", "navigate the complexities", "It will be interesting to see", "in conclusion", "stay tuned", "speaks volumes", "sends a clear message".
- Exclamation points. Em-dash chains (more than one em-dash in a sentence). Headers named "Introduction" or "Conclusion".
- "(per …)" with an elided/vague subject, "per the corpus", "per the feed", "per the headlines", "per our list", or any meta-reference to your input. Use the actual publisher name or no parenthetical at all.

If a sentence uses any of these patterns, delete it and rewrite from the underlying claim. Don't soften them — remove them.

Tag (pick the one that fits the post you actually wrote — don't shoehorn):
- Analysis: broad pattern across multiple items
- Market: industry/business angle (pricing, deals, distribution)
- Practice: operating advice readers can use
- Signals: one event's downstream implications
- Field Notes: observations from the wild

CRITICAL output format: respond with ONE JSON object and absolutely nothing else. No prose before, no prose after, no code fences. First character is {, last is }. Anything outside the JSON gets the post rejected.

Schema:
{
  "mode": "deep_dive" | "free_pick",
  "tag": "Analysis" | "Market" | "Practice" | "Signals" | "Field Notes",
  "title": string,
  "dek": string,
  "bodyMarkdown": string,
  "citations": string[],
  "sourceHeadlineIds": number[],
  "rationale": string
}

Or, if the headlines are too thin:
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
  // Each item formatted on its own block with URL on its own line. The
  // explicit "URL:" prefix and the structure make it harder for the model
  // to invent a URL by pattern-matching the title — it has to copy the
  // exact string from the line above.
  return corpus
    .map((c) => {
      const date = c.publishedAt.toISOString().slice(0, 10);
      return `--- id=${c.id} ---
Date: ${date}
Source: ${c.source} (${c.category})
Title: ${c.title}
URL: ${c.url}`;
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

// Walks back/forward from a match index to the surrounding sentence so the
// retry prompt can quote the exact offending sentence to the model. Without
// this, the retry says "you used a banned pattern somewhere" and the model
// often rewrites the wrong half of the post and trips a different banned
// pattern on the next attempt.
const extractSentence = (text: string, idx: number): string => {
  let start = idx;
  while (start > 0) {
    const ch = text[start - 1];
    if (ch === "." || ch === "!" || ch === "?" || ch === "\n") break;
    start--;
  }
  let end = idx;
  while (end < text.length) {
    const ch = text[end];
    if (ch === "." || ch === "!" || ch === "?" || ch === "\n") {
      if (ch === "." || ch === "!" || ch === "?") end++;
      break;
    }
    end++;
  }
  return text.slice(start, end).trim();
};

type ValidationError = { error: string; offendingSentence?: string };

const validateDraft = (raw: RawDraft, corpus: CorpusItem[]): Draft | ValidationError => {
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

  // Title must be sentence case, not Title Case. Two heuristics:
  //   (1) any capitalized small word ("The", "Of", "A", "And", ...) after the
  //       first token is a hard signal of Title Case.
  //   (2) if 2+ non-first tokens are plain capitalized words (Cap-then-lower,
  //       not proper nouns) and zero non-first tokens are lowercase, also
  //       Title Case.
  // The first token is exempt because sentence case capitalizes it. Tokens
  // that look like brand names (OpenAI, GPT, Claude Code, GPT-5) are skipped
  // by the regex filters in (2).
  const TITLE_CASE_SMALL = new Set([
    "The","Of","In","On","And","Or","Nor","But","Yet","So","A","An","To","For","With","By","From","As","At","Up","Down","Out","Over","Under","Into","Onto","Off","About","Via","Than","Vs","If",
  ]);
  const titleTokens = raw.title.trim().split(/\s+/);
  let plainCapCount = 0;
  let lowerCount = 0;
  for (let i = 1; i < titleTokens.length; i++) {
    const tok = titleTokens[i];
    if (!tok) continue;
    const stripped = tok.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
    if (TITLE_CASE_SMALL.has(stripped)) {
      return {
        error: `Title looks like Title Case (capitalized small word "${stripped}"). Use sentence case — only the first word and proper nouns capitalized.`,
      };
    }
    if (stripped.length < 2) continue;
    if (/\d/.test(tok)) continue; // contains a digit — likely brand/version (GPT-5, 4o)
    if (/^[A-Z]{2,}$/.test(stripped)) continue; // all-caps acronym (GPT, AI)
    if (/[A-Z]/.test(stripped.slice(1))) continue; // internal capital (OpenAI, DeepMind)
    if (/^[A-Z][a-z]+$/.test(stripped)) plainCapCount++;
    else if (/^[a-z]/.test(stripped)) lowerCount++;
  }
  if (plainCapCount >= 2 && lowerCount === 0) {
    return {
      error: `Title looks like Title Case (${plainCapCount} plain words capitalized, 0 lowercase). Use sentence case — only the first word and proper nouns capitalized.`,
    };
  }

  // Forbidden meta-references. The reader should never see the word "corpus"
  // or any "(per the corpus / headlines / feed)" elided attribution. Run on
  // title + dek + body so it catches every visible field.
  const visibleText = `${raw.title}\n${raw.dek}\n${raw.bodyMarkdown}`;
  if (/\bcorpus\b/i.test(visibleText)) {
    return {
      error: "Output contains the word 'corpus'. Refer to publishers by name; never use the word 'corpus'.",
      offendingSentence: extractSentence(visibleText, visibleText.search(/\bcorpus\b/i)),
    };
  }
  const metaAttribPatterns: { pattern: RegExp; label: string }[] = [
    { pattern: /\(\s*per\s*\.{2,}\s*\)/i, label: "literal '(per…)' with elided source" },
    { pattern: /\(\s*per\s*\)/i, label: "empty '(per)' parenthetical" },
    { pattern: /\bper\s+(?:the|our|this)\s+(?:corpus|feed|headlines?|dispatch|list|items?|data\s*set|round\s*up|digest|sources?)\b/i, label: "'per the corpus / feed / headlines / list / etc.'" },
    { pattern: /\baccording\s+to\s+(?:the|our|this)\s+(?:corpus|feed|headlines?|dispatch|list|items?|data\s*set|round\s*up|digest|sources?)\b/i, label: "'according to the corpus / feed / headlines / etc.'" },
  ];
  for (const { pattern, label } of metaAttribPatterns) {
    const match = pattern.exec(visibleText);
    if (match) {
      return {
        error: `Meta-reference attribution detected: ${label}. Attribute by publisher name (e.g. "Anthropic", "OpenAI", "TechCrunch"), or remove the parenthetical.`,
        offendingSentence: extractSentence(visibleText, match.index),
      };
    }
  }
  // Per-mode minimum body length so deep_dive can't be the same size as
  // digest — one of the user complaints was that all modes read identically.
  const bodyLen = raw.bodyMarkdown.length;
  // ~5 chars/word for English. Minimums set ~95% of the prompted floor so
  // the validator rejects genuinely-too-short pieces but not posts that
  // land at the lower end of the requested range.
  const minByMode: Record<string, number> = {
    deep_dive: 4700, // ~940 words (floor ≈ 1,000)
    free_pick: 3500, // ~700 words (floor ≈ 750)
  };
  const minLen = minByMode[String(raw.mode)] ?? 3500;
  if (bodyLen < minLen) {
    return { error: `Body too short for ${raw.mode}: ${bodyLen} chars (need ≥ ${minLen})` };
  }
  // AI-tell pattern check: the "negation pivot" (some flavor of "not just X,
  // it's Y") is the most common LLM giveaway. Catches its variants and rejects
  // so the model has to restructure rather than just rephrase.
  const aiTellPatterns: { pattern: RegExp; label: string }[] = [
    // Pre-positioned negation: "isn't just / not just / not only / not merely / not simply"
    { pattern: /\b(?:isn['’]?t|wasn['’]?t|aren['’]?t|weren['’]?t|are\s+not|is\s+not|was\s+not|were\s+not)\s+(?:just|only|merely|simply|solely)\b/i, label: "negation + 'just/only/merely/simply' (e.g. 'isn't just a release')" },
    { pattern: /\bnot\s+(?:just|only|merely|simply|solely)\s+(?:a|an|the|that|this|these|those)?\s*\w/i, label: "'not just/only/merely X'" },
    { pattern: /\bnot\s+only\s+\b[^.,;!?]{1,80}\b\s+but\s+(?:also\s+)?/i, label: "'not only X but [also] Y'" },
    { pattern: /\bmore\s+than\s+just\b/i, label: "'more than just X'" },
    // Post-positioned 'alone' / 'by itself' — the variant the user just
    // flagged: "the week's announcements weren't model launches alone".
    { pattern: /\b(?:isn['’]?t|wasn['’]?t|aren['’]?t|weren['’]?t|is\s+not|was\s+not|are\s+not|were\s+not)\s+\b[^.,;!?]{1,80}\b\s+(?:alone|by\s+(?:itself|themselves))\b/i, label: "'X weren't [Y] alone' / 'X wasn't [Y] by itself'" },
    // Scope-limit pivots: "limited to", "confined to", "restricted to", "about"
    { pattern: /\b(?:isn['’]?t|aren['’]?t|wasn['’]?t|weren['’]?t|is\s+not|are\s+not|was\s+not|were\s+not)\s+(?:limited|confined|restricted)\s+to\b/i, label: "'X isn't limited/confined/restricted to Y'" },
    { pattern: /\bthis\s+(?:isn['’]?t|wasn['’]?t)\s+about\s+\b[^.,;!?]{1,80}\b\s+[—-]\s*it['’]?s\s+about\b/i, label: "'this isn't about X — it's about Y'" },
    // "What's striking / interesting / etc" throat-clearing
    { pattern: /\bwhat['’]?s\s+(?:striking|interesting|worth\s+noting|clear|notable|telling|remarkable|surprising)\s+(?:is|here)\b/i, label: "'what's striking/interesting/etc is...'" },
    // "In a world where..." / "In an era of..."
    { pattern: /\bin\s+(?:a\s+world|an\s+era|a\s+landscape|a\s+time|an\s+age)\s+where\b/i, label: "'in a world/era/landscape where...'" },
    // "Speaks volumes / sends a clear message"
    { pattern: /\bspeaks\s+volumes\b|\bsends?\s+a\s+(?:clear|strong|powerful)\s+(?:message|signal)\b/i, label: "'speaks volumes' / 'sends a clear message'" },
  ];
  for (const { pattern, label } of aiTellPatterns) {
    const match = pattern.exec(raw.bodyMarkdown);
    if (match) {
      const offending = extractSentence(raw.bodyMarkdown, match.index);
      return {
        error: `AI-tell pattern detected: ${label}. Rewrite without it.`,
        offendingSentence: offending,
      };
    }
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
    return { error: `Hallucinated URLs not in the provided headlines: ${badUrls.join(", ")}` };
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

  // Per-request timeout. Without this, a hung Venice connection leaves the
  // run Promise pending forever and state stays "running" indefinitely.
  // 8 min is generous: Claude reasoning + body output runs ~4–6 min; this
  // gives ~30% headroom before forcing a clear error.
  const client = new OpenAI({ apiKey, baseURL, timeout: 8 * 60 * 1000 });

  const { prompt: systemPrompt } = await getSystemPrompt(agentId);

  const userMessage = [
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
    modeHint === "auto"
      ? "Pick whichever mode the headlines best support."
      : `Mode hint: ${modeHint}. (You may override if the headlines don't support it — explain in rationale.)`,
    "",
    `Headlines (${corpus.length} items from the last ${opts.corpusDays ?? 7} days):`,
    formatCorpus(corpus),
  ].join("\n");

  // Multi-turn so we can give the model targeted feedback if validation fails
  // on hallucinated URLs and let it correct citations using the actual corpus.
  // Hard cap so a stubbornly broken model can't burn unbounded tokens, but
  // generous enough that AI-tell rewrites don't fail user-facing — the model
  // sometimes trips a *different* banned pattern on its first rewrite, so it
  // needs more than one shot.
  const MAX_VALIDATION_ATTEMPTS = 4;
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  let responseText = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let validated: Draft | null = null;
  let lastValidationError: string | null = null;

  const corpusUrlsList = corpus.map((c) => c.url);

  for (let attempt = 1; attempt <= MAX_VALIDATION_ATTEMPTS; attempt++) {
    let response;
    try {
      response = await client.chat.completions.create({
        model,
        // Claude on Venice exposes reasoning via message.reasoning_content,
        // and that reasoning counts against max_tokens. With this prompt
        // (~5k input tokens, 30-item corpus), reasoning observed at 7–8k
        // tokens before the final JSON. 32768 gives 4× headroom; only used
        // tokens are billed so the higher cap has zero average-case cost.
        max_tokens: 32768,
        messages,
        response_format: { type: "json_object" },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err: message, model, baseURL, attempt }, "LLM call failed");
      return { ok: false, error: `LLM call failed: ${message}` };
    }

    const turnText = response.choices[0]?.message?.content ?? "";
    logger.info(
      { model, attempt, usage: response.usage ?? null },
      "LLM response usage",
    );
    promptTokens += response.usage?.prompt_tokens ?? 0;
    completionTokens += response.usage?.completion_tokens ?? 0;
    totalTokens += response.usage?.total_tokens ?? 0;
    responseText = turnText;

    if (!turnText) {
      const choice = response.choices[0];
      const message = choice?.message as
        | { refusal?: unknown; tool_calls?: unknown }
        | undefined;
      logger.warn(
        {
          model,
          baseURL,
          attempt,
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

    const raw = extractJson(turnText);
    if (!raw) {
      const finishReason = response.choices[0]?.finish_reason ?? "?";
      const wasTruncated = finishReason === "length";
      logger.warn(
        {
          model,
          baseURL,
          attempt,
          finishReason,
          rawHead: turnText.slice(0, 500),
          rawTail: turnText.slice(-500),
          rawLength: turnText.length,
        },
        "Response was not valid JSON",
      );
      // Fast-fail. Each Claude call on Venice is 4–6 min of reasoning, so a
      // multi-attempt retry blows past the 8-min frontend timeout while
      // burning tokens on the same failure mode each time. Better to surface
      // a clear cause and let the user re-run.
      return {
        ok: false,
        error: wasTruncated
          ? `Response was truncated by max_tokens (finish_reason=length). The post ran past the token budget — try shortening the system prompt or raising max_tokens.`
          : `Response was not valid JSON (finish_reason=${finishReason}). The model emitted output the JSON parser couldn't recover. See logs for head/tail of the raw response.`,
      };
    }

    const result = validateDraft(raw, corpus);
    if (!("error" in result)) {
      validated = result;
      break;
    }

    lastValidationError = result.error;
    logger.warn({ attempt, ...result }, "Draft rejected");

    // Retry on a few specific failure modes the model can plausibly fix
    // with targeted feedback. Other failures (missing fields, wrong tag)
    // aren't worth a second LLM call.
    const isHallucinatedUrls = result.error.startsWith("Hallucinated URLs");
    const isAiTell = result.error.startsWith("AI-tell pattern");
    const isTooShort = result.error.startsWith("Body too short");
    const isTitleCase = result.error.startsWith("Title looks like Title Case");
    const isCorpusWord = result.error.startsWith("Output contains the word 'corpus'");
    const isMetaAttrib = result.error.startsWith("Meta-reference attribution detected");

    if (
      attempt < MAX_VALIDATION_ATTEMPTS &&
      (isHallucinatedUrls || isAiTell || isTooShort || isTitleCase || isCorpusWord || isMetaAttrib)
    ) {
      messages.push({ role: "assistant", content: turnText });
      let retryPrompt: string;
      if (isHallucinatedUrls) {
        retryPrompt = [
          `Your previous response cited URLs that are NOT in the provided headlines. ${result.error}`,
          "",
          "These are the ONLY valid URL strings you may use in citations — copy them character-for-character:",
          ...corpusUrlsList.map((u) => `  ${u}`),
          "",
          "Re-emit the SAME post with citations replaced by valid URLs from the list above (and sourceHeadlineIds matching). Same JSON schema, no prose around it.",
        ].join("\n");
      } else if (isAiTell) {
        const offending = result.offendingSentence;
        retryPrompt = [
          `Your previous response was rejected for using an AI-tell pattern. ${result.error}`,
          "",
          ...(offending
            ? [
                "The exact sentence that tripped the validator:",
                "",
                `> ${offending}`,
                "",
                "Rewrite ONLY that sentence. Keep every other sentence in the body verbatim — same words, same order, same paragraph breaks. State the underlying claim as a direct assertion.",
              ]
            : ["Rewrite the offending sentence as a direct claim. Keep the rest of the body verbatim."]),
          "",
          "The rewrite must NOT introduce any of these other banned patterns:",
          "  - 'not just X but Y' / 'not only X but Y' / 'more than just X'",
          "  - 'isn't merely / isn't simply / isn't limited to'",
          "  - 'X weren't Y alone' / 'X wasn't Y by itself'",
          "  - 'this isn't about X — it's about Y'",
          "  - 'what's striking/interesting/worth noting/clear/notable is...'",
          "  - 'in a world/era/landscape/age where...'",
          "  - 'speaks volumes' / 'sends a clear message'",
          "  - exclamation points, em-dash chains (more than one — per sentence)",
          "",
          "Re-emit the FULL post in the SAME JSON schema, no prose around it.",
        ].join("\n");
      } else if (isTitleCase) {
        retryPrompt = [
          `Your previous response was rejected: ${result.error}`,
          "",
          `The title you submitted: "${raw.title}"`,
          "",
          "Rewrite ONLY the title in sentence case. Capitalize the first word and proper nouns (OpenAI, Anthropic, Claude, GPT-5, etc.); everything else stays lowercase. Articles and prepositions like 'the', 'of', 'a', 'and', 'to', 'for' must be lowercase when they appear mid-title.",
          "",
          "Keep the dek and bodyMarkdown verbatim — same words, same order, same paragraph breaks. Re-emit the FULL post in the SAME JSON schema, no prose around it.",
        ].join("\n");
      } else if (isCorpusWord || isMetaAttrib) {
        const offending = result.offendingSentence;
        retryPrompt = [
          `Your previous response was rejected: ${result.error}`,
          "",
          ...(offending
            ? [
                "The exact sentence that tripped the validator:",
                "",
                `> ${offending}`,
                "",
              ]
            : []),
          "Readers do not know you have a structured input. Never refer to your sources collectively as 'the corpus', 'the feed', 'the headlines', 'the dispatch', 'our list', or any similar meta-reference. Attribute by the actual publisher name (Anthropic, OpenAI, METR, TechCrunch, etc.) or remove the parenthetical. Replace any literal '(per …)' / '(per the corpus)' / 'per the headlines' phrasing with named attribution or no parenthetical at all.",
          "",
          "Rewrite ONLY the offending phrasing wherever it appears in the title, dek, or body. Keep every other sentence verbatim. Re-emit the FULL post in the SAME JSON schema, no prose around it.",
        ].join("\n");
      } else {
        // Body-too-short retry — be explicit about the numbers because the
        // user's custom system prompt may understate the actual length
        // requirement. The validator floor is the authoritative minimum.
        const m = result.error.match(/(\d+)\s+chars.*?≥\s*(\d+)/);
        const wrote = m ? Number(m[1]) : null;
        const need = m ? Number(m[2]) : null;
        const wroteWords = wrote ? Math.round(wrote / 5) : null;
        const needWords = need ? Math.round(need / 5) : null;
        retryPrompt = [
          `Your previous response was rejected: ${result.error}`,
          wrote && need
            ? `You wrote ~${wroteWords} words (${wrote} chars). The minimum for ${raw.mode} mode is ~${needWords} words (${need} chars). You need to AT LEAST DOUBLE the body length.`
            : `The body is significantly shorter than the required minimum.`,
          "",
          "Hard requirements for this retry:",
          `- Body MUST be at least ${need ?? 6800} characters of markdown.`,
          "- Each item you cite gets multiple paragraphs of interpretation, not a single attribution sentence.",
          "- For each item, work through: what the publisher reported → what's actually new about it → who it changes things for → which open questions it raises → how it relates to the other items you cited. Attribute by publisher name (Anthropic, OpenAI, etc.), never by meta-references like 'the corpus' or 'the headlines'.",
          "- Add a clear opening section establishing the week's framing thesis (3–5 sentences, not 1).",
          "- Add a substantive closing section connecting the items into a single argument (3–5 sentences).",
          "- Do NOT pad with restatement or filler. Add real interpretive content.",
          "- If the available material genuinely cannot support this length, set abort:true with a rationale instead of producing a short post.",
          "",
          "Re-emit the FULL post in the SAME JSON schema, no prose around it.",
        ].join("\n");
      }
      messages.push({ role: "user", content: retryPrompt });
      continue;
    }
    return { ok: false, error: result.error };
  }

  if (!validated) {
    return { ok: false, error: lastValidationError ?? "Validation failed after retries" };
  }

  // Token estimation fallback when the provider didn't populate usage.
  if (totalTokens === 0) {
    const estTokens = (s: string) => Math.max(1, Math.ceil(s.length / 4));
    promptTokens = estTokens(systemPrompt) + estTokens(userMessage);
    completionTokens = estTokens(responseText);
    totalTokens = promptTokens + completionTokens;
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

// Run-state for the manual writer UI. Persisted in the settings table so
// both Fly machines share the same view — without this, a POST /run on
// machine A and a GET /run-status on machine B would disagree.
type RunStatus = {
  status: "idle" | "running" | "ok" | "error" | "aborted";
  startedAt: string | null;
  finishedAt: string | null;
  // Updated periodically while a run is in flight. Lets the stale check
  // distinguish a long-running healthy job from a crashed one.
  lastHeartbeatAt: string | null;
  postId: number | null;
  error: string | null;
  rationale: string | null;
  mode: string | null;
};

const RUN_STATE_KEY = "writer.daily-writer.run-state";
// Heartbeat cadence + stale window. Heartbeats fire every 30s while a run
// is alive; if 90s elapse without one (3 missed beats), the run is treated
// as crashed and surfaced as an error. The previous absolute-age check at
// 5 min false-positived on healthy 5–6 min Claude reasoning runs.
const HEARTBEAT_INTERVAL_MS = 30 * 1000;
const STALE_RUN_MS = 90 * 1000;

const IDLE_STATE: RunStatus = {
  status: "idle",
  startedAt: null,
  finishedAt: null,
  lastHeartbeatAt: null,
  postId: null,
  error: null,
  rationale: null,
  mode: null,
};

async function readRunState(): Promise<RunStatus> {
  const [row] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, RUN_STATE_KEY))
    .limit(1);
  if (!row?.value) return { ...IDLE_STATE };
  try {
    return JSON.parse(row.value) as RunStatus;
  } catch {
    return { ...IDLE_STATE };
  }
}

async function writeRunState(state: RunStatus): Promise<void> {
  await db
    .insert(settingsTable)
    .values({ key: RUN_STATE_KEY, value: JSON.stringify(state) })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value: JSON.stringify(state), updatedAt: new Date() },
    });
}

export async function getRunStatus(): Promise<RunStatus> {
  const state = await readRunState();
  // Heartbeat-based stale check. A healthy long-running job keeps writing
  // lastHeartbeatAt; a crashed/restarted process stops. If no heartbeat in
  // STALE_RUN_MS, surface the run as crashed so the UI can recover.
  // Falls back to startedAt for runs from before the heartbeat field existed.
  if (state.status === "running") {
    const lastSeen = state.lastHeartbeatAt ?? state.startedAt;
    if (lastSeen) {
      const age = Date.now() - new Date(lastSeen).getTime();
      if (age > STALE_RUN_MS) {
        const stale: RunStatus = {
          ...state,
          status: "error",
          finishedAt: new Date().toISOString(),
          error: `Run died — no heartbeat in ${Math.round(age / 1000)}s. The API container likely restarted mid-run.`,
        };
        await writeRunState(stale);
        return stale;
      }
    }
  }
  return state;
}

// Bump the heartbeat for the run that started at startedAt. Bails out if a
// different run has since started, so a leftover heartbeat from an older run
// can't overwrite a newer run's state.
async function bumpHeartbeat(startedAt: string): Promise<void> {
  try {
    const current = await readRunState();
    if (current.status !== "running") return;
    if (current.startedAt !== startedAt) return;
    await writeRunState({ ...current, lastHeartbeatAt: new Date().toISOString() });
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "Heartbeat write failed");
  }
}

export async function startWriterRun(opts: {
  agentId?: string;
  modeHint?: WriterMode | "auto";
}): Promise<{ accepted: boolean; status: RunStatus }> {
  const current = await getRunStatus();
  if (current.status === "running") {
    return { accepted: false, status: current };
  }
  const startedAt = new Date().toISOString();
  const startState: RunStatus = {
    status: "running",
    startedAt,
    finishedAt: null,
    lastHeartbeatAt: startedAt,
    postId: null,
    error: null,
    rationale: null,
    mode: opts.modeHint ?? "auto",
  };
  await writeRunState(startState);

  // Fire and forget. The promise outlives the HTTP request that started it.
  // Heartbeat ticks update lastHeartbeatAt every 30s so a healthy long run
  // doesn't trip the stale check; the interval is cleared on completion.
  (async () => {
    const heartbeat = setInterval(() => {
      void bumpHeartbeat(startedAt);
    }, HEARTBEAT_INTERVAL_MS);
    try {
      const result = await generateAndSavePost(opts);
      let final: RunStatus;
      if (result.ok) {
        final = {
          ...startState,
          status: "ok",
          finishedAt: new Date().toISOString(),
          postId: result.postId,
        };
      } else if (result.error.startsWith("Agent aborted:")) {
        // Abort is an expected clean outcome — corpus too thin to support
        // a real piece, no point publishing slop. Surface as "aborted" so
        // the admin can show it as informational, not a failure.
        final = {
          ...startState,
          status: "aborted",
          finishedAt: new Date().toISOString(),
          rationale: result.error.replace(/^Agent aborted:\s*/, "").trim() || null,
        };
      } else {
        final = {
          ...startState,
          status: "error",
          finishedAt: new Date().toISOString(),
          error: result.error,
        };
      }
      await writeRunState(final);
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined },
        "Writer run threw — surfacing as error",
      );
      await writeRunState({
        ...startState,
        status: "error",
        finishedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      clearInterval(heartbeat);
    }
  })();
  return { accepted: true, status: startState };
}

// Manual reset for the case where state is genuinely stuck (the heartbeat
// stale check should usually catch this automatically within ~90s).
export async function clearRunState(): Promise<void> {
  await writeRunState({ ...IDLE_STATE });
}

let writerHandle: NodeJS.Timeout | null = null;

// Tick every 12h, but only attempt a new post if the last one is older than
// the floor. With a 36h floor, that produces roughly 2 posts per 3 days when
// the corpus supports it (and fewer on thin weeks since the agent will abort
// rather than publish slop).
const WRITER_TICK_MS = 12 * 60 * 60 * 1000;
const WRITER_FLOOR_MS = 36 * 60 * 60 * 1000;

async function hasPostInLastFloor(): Promise<boolean> {
  const since = new Date(Date.now() - WRITER_FLOOR_MS);
  const rows = await db
    .select({ id: postsTable.id })
    .from(postsTable)
    .where(gte(postsTable.publishedAt, since))
    .limit(1);
  return rows.length > 0;
}

export function startWriterScheduler(intervalMs = WRITER_TICK_MS): void {
  if (writerHandle) return;

  const tick = async () => {
    try {
      if (await hasPostInLastFloor()) {
        logger.info("Writer tick: recent post within floor, skipping");
        return;
      }
      logger.info("Writer tick: generating post");
      const result = await generateAndSavePost({});
      if (!result.ok) {
        // Abort (corpus too thin to write a real piece) is the expected
        // clean outcome on slow days. Log at info, not warn.
        if (result.error.startsWith("Agent aborted:")) {
          logger.info({ rationale: result.error }, "Writer tick aborted (clean)");
        } else {
          logger.warn({ error: result.error }, "Writer tick failed");
        }
      }
    } catch (err) {
      logger.error({ err }, "Writer tick threw");
    }
  };

  // Kick off after 30s so the server is fully up; then every interval.
  setTimeout(() => void tick(), 30_000);
  writerHandle = setInterval(() => void tick(), intervalMs);
}
