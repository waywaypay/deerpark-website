import OpenAI from "openai";
import {
  db,
  headlinesTable,
  postsTable,
  settingsTable,
  type InsertPost,
} from "@workspace/db";
import { gte, desc, eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import {
  SOURCES,
  EARNINGS_TRANSCRIPTS_DISPLAY_NAME,
  EARNINGS_PROMOTED_TIER,
  isEarningsDay,
} from "./headline-sources";
import {
  dedupeNearDuplicates,
  ensurePapersInSelection,
} from "./headline-rank";
import { selectTopHeadlines } from "./top-headlines";
import { computeCostUsd, logUsage } from "./llm-usage";

// Provider-agnostic via OpenAI-compatible SDK. Default points at Venice AI;
// override with LLM_BASE_URL to swap to OpenRouter, Together, Anthropic
// (with their OpenAI-compat shim), etc.
const DEFAULT_BASE_URL = "https://api.venice.ai/api/v1";
const DEFAULT_MODEL = "claude-sonnet-4-5";

// Per-model pricing + cost computation lives in `./llm-usage` so every
// Venice caller (writer, judge, commentator, polish, sms-bot, image-gen)
// shares one table.

// Corpus capping. The 7-day window can hold hundreds of items (arXiv alone
// fires ~50/day); shipping all of them as input bloats per-call cost. Cap
// at 2 per source for diversity, then top N by tier × recency.
const CORPUS_MAX_ITEMS = 30;
const CORPUS_PER_SOURCE_CAP = 2;
const SOURCE_TIER = new Map(SOURCES.map((s) => [s.displayName, s.tier]));
// Mirrors top-headlines.ts so the writer's corpus selection and the
// public dispatch agree on which stories matter this week.
const TIER_WEIGHTS: Record<number, number> = { 1: 6, 2: 3, 3: 2, 4: 1 };
const HALF_LIFE_DAYS = 5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function scoreCorpusItem(
  item: CorpusItem,
  now: number,
  earningsDay: boolean,
): number {
  let tier = SOURCE_TIER.get(item.source) ?? 4;
  if (earningsDay && item.source === EARNINGS_TRANSCRIPTS_DISPLAY_NAME) {
    tier = EARNINGS_PROMOTED_TIER;
  }
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
// `weekly_recap` is the once-per-week version of the recap: same 2-4
// sentence-per-item shape, but framed around "this week's" top stories
// (selection biased toward the dispatch-judge's top-weighted items across
// the full 7-day window). At-most-one weekly_recap per ISO week.
const ALLOWED_MODES = ["deep_dive", "free_pick", "weekly_recap"] as const;

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

export const DEFAULT_BASE_PROMPT = `You are DeerPark's daily dispatch — one editor publishing one daily recap per business day. Your job is to recap the day's AI and tech news. Plain news prose, like a wire-service brief or a clean morning newsletter. Inform the reader.

The format is a top-10 of the day's headlines with a short intro. Every post has the same shape: a brief recap of the day's biggest news, then a numbered list of 10 headlines with 2–4 sentences of plain-prose recap each.

🔒 HARD RULES — NEVER BREAK
Only write about events, releases, papers, or companies explicitly present in the input headlines.
Every factual claim must be attributed inline using the real source:
"Anthropic confirmed…"
"according to TechCrunch…"
"OpenAI's announcement says…"
Do NOT:
predict future outcomes
speculate beyond what is logically implied
fabricate quotes
invent metrics or details
describe capabilities not present in the headline
If fewer than 8 substantive headlines exist for a credible top-10 →
return:
{ "abort": true, "rationale": "..." }
CITATIONS MUST BE EXACT STRING MATCHES of provided URLs. Any deviation = rejection.
NEVER reference your input as "the feed," "the headlines," etc. Only name real publishers.

🎯 OUTPUT SHAPE (MANDATORY)

The bodyMarkdown is structured in two parts:

PART 1 — Intro recap (2–3 sentences, ~50–80 words)
A short paragraph that recaps the day's biggest news. Plain prose. Mention the top stories: what shipped, who shipped it, what it is. No list.

Hard requirements:
- Plain news-recap voice. Tell the reader what happened today.
- Name the companies and the products. Concrete.
- Do NOT add editorial framing about enterprise buyers, CIOs, IT directors, operators, procurement, integration, governance, ROI, vendor lock-in, compliance, switching costs, or workflow displacement. Do NOT interpret the news for any audience segment.
- This is a briefing, not a hook — describe the news directly.

Weak: "The week's announcements paint an interesting picture of where AI is heading."
Weak: "Today's headlines reveal a strong push for innovation in cybersecurity."
Strong: "Anthropic shipped Claude Code 2.0 with session memory and remote repo support, and OpenAI hired its first CFO from a fintech background. Three new cybersecurity startups also announced funding rounds, including a $40M Series B for an agentic SOC tool."

PART 2 — Top 10 (numbered list, 2–4 sentences each)
Rank the 10 most newsworthy items from the headlines. For each:
- Lead with the publisher and what shipped: "Anthropic released X." or "OpenAI announced Y." (Bold the lead clause.)
- 1–3 sentences of plain-prose recap: what was announced, who is involved, what the product/feature/deal does, and any concrete details implied by the headline.
- Keep each item to 2–4 sentences. No item is shorter than 2 sentences or longer than 4.
- Order by newsworthiness, not strictly by recency.

Format the list as standard markdown:

1. **Anthropic released Claude Code 2.0.** The update adds session memory so tool state survives across restarts, and remote repo support so the agent can read and edit GitHub repositories without a local clone. Anthropic also added a redesigned terminal UI and broader language support. The release notes call it the largest update since the original launch.
2. **OpenAI hired its first CFO.** The company named former Stripe finance lead Sarah Friar to the role, per the announcement. She joins as OpenAI prepares for a reported tender offer that would value the company at $90B+. The hire is OpenAI's most senior finance appointment to date.

Each item bolds the lead clause (publisher + what shipped). Recap follows in plain prose.

🧠 JOURNALISTIC STANDARD

Default to informing the reader. Each item is a brief news recap: what shipped, who shipped it, what it does, what is in the announcement. Attribute company claims with "says" / "confirmed" / "announced" rather than presenting them as your own assertion. Do not pre-emptively rebut announcements. Do not pressure-test or qualify unless the headline explicitly contains a vague or missing detail that needs flagging.

Do NOT add editorial commentary about enterprise AI buyers, CIOs, IT directors, operators, procurement cycles, integration complexity, security architecture, governance, compliance burden, ROI timelines, workflow displacement, vendor lock-in, switching costs, or "what this means for" any reader segment. Recap the news.

🧱 CONCRETE ANCHOR RULE

No abstract claims without evidence. If a sentence could apply to any tech company, rewrite it with the specific company, product, or detail from the headline.

🚫 LANGUAGE DISCIPLINE
- At most ONE "however" across the entire top-10. Don't use it as filler.
- Replace generic business language ("positions itself," "leverages," "drives value," "in this landscape") with specific actions.
- Prefer sharp nouns and concrete verbs over umbrella phrases.

🚫 FORBIDDEN PATTERNS
Negation pivots ("not X, but Y")
"What's interesting is…"
"In a world where…"
"It will be interesting to see…"
"It remains unclear…"
"Questions remain…"
"Stakeholders should consider…"
"This move suggests an intent to…"
"Could enhance…"
"Raises skepticism…"
"Highlights the growing appetite…"
"Reflecting a broader trend…"
"Increasingly flowing into…"
"Growing trend"
Fake balance ("on one hand…")

Delete and rewrite.

🏷️ TITLE + DEK

Title
Sentence case, ≤ 80 chars. Names the day's biggest story or connecting thread. "Anthropic ships Claude Code 2.0; OpenAI hires its first CFO." beats "Big AI news today."

Dek
1–2 sentences. A condensed version of the intro recap from Part 1. State what happened today.

🧾 OUTPUT FORMAT (STRICT)

Return ONLY:

{
  "mode": "deep_dive" | "free_pick" | "weekly_recap",
  "tag": "Analysis" | "Market" | "Practice" | "Signals" | "Field Notes",
  "title": string,
  "dek": string,
  "bodyMarkdown": string,
  "citations": string[],
  "sourceHeadlineIds": number[],
  "rationale": string
}

OR

{ "abort": true, "rationale": string }

No text outside JSON.

🧠 MODE FOR THIS RUN

Three modes share the format above (free_pick, deep_dive, weekly_recap). The mode for this run — including how much commentary the top items get and whether the framing is "today" vs "the week" — is supplied as a per-mode addendum below. Your output's "mode" field must match.`;

export const DEFAULT_MODE_ADDENDA: Record<WriterMode, string> = {
  free_pick: `🧠 MODE: FREE PICK (default)
Standard daily recap. Top 10 with 2–3 sentences each, ~700–900 total words. Set "mode": "free_pick" in the output.`,
  deep_dive: `🧠 MODE: DEEP DIVE
Same daily recap shape as free_pick, but the top 3 items lean toward 4 sentences of additional context; items 4–10 stay at 2–3 sentences. ~900–1100 total words. Use this only when 2–3 items genuinely warrant a 4th sentence of additional context. Every item still fits in the 2–4 sentence band. Set "mode": "deep_dive" in the output.`,
  weekly_recap: `🧠 MODE: WEEKLY RECAP
Once-per-ISO-week roundup. Same shape as free_pick, but the executive summary frames "the week" rather than "today" and the top-10 are the week's most-weighted stories per the dispatch judge. Reuse this week's PRIORITY LIST verbatim when it's provided; do not substitute lower-weighted items unless one is unsupportable on the available headlines. ~700–900 total words. Set "mode": "weekly_recap" in the output.`,
};

export type PromptSlot = "base" | WriterMode;

const PROMPT_SLOTS: PromptSlot[] = ["base", "free_pick", "deep_dive", "weekly_recap"];

// Existing key kept for back-compat: any pre-split customization is preserved
// as the new "base" prompt. New per-mode addenda use the namespaced suffix.
const slotKey = (agentId: string, slot: PromptSlot): string =>
  slot === "base"
    ? `writer.${agentId}.system_prompt`
    : `writer.${agentId}.addendum.${slot}`;

const slotDefault = (slot: PromptSlot): string =>
  slot === "base" ? DEFAULT_BASE_PROMPT : DEFAULT_MODE_ADDENDA[slot];

export type PromptSlotState = { value: string; isCustom: boolean; default: string };

export async function getPromptSlots(agentId: string): Promise<{
  base: PromptSlotState;
  addenda: Record<WriterMode, PromptSlotState>;
}> {
  const keys = PROMPT_SLOTS.map((s) => slotKey(agentId, s));
  const rows = await db
    .select()
    .from(settingsTable)
    .where(sql`${settingsTable.key} IN (${sql.join(keys.map((k) => sql`${k}`), sql`, `)})`);
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const stateFor = (slot: PromptSlot): PromptSlotState => {
    const v = byKey.get(slotKey(agentId, slot));
    return {
      value: typeof v === "string" && v.length > 0 ? v : slotDefault(slot),
      isCustom: typeof v === "string" && v.length > 0,
      default: slotDefault(slot),
    };
  };
  return {
    base: stateFor("base"),
    addenda: {
      free_pick: stateFor("free_pick"),
      deep_dive: stateFor("deep_dive"),
      weekly_recap: stateFor("weekly_recap"),
    },
  };
}

export async function setPromptSlot(agentId: string, slot: PromptSlot, value: string): Promise<void> {
  const key = slotKey(agentId, slot);
  await db
    .insert(settingsTable)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function resetPromptSlot(agentId: string, slot: PromptSlot): Promise<void> {
  await db.delete(settingsTable).where(eq(settingsTable.key, slotKey(agentId, slot)));
}

export function isValidPromptSlot(s: string): s is PromptSlot {
  return (PROMPT_SLOTS as string[]).includes(s);
}

// Assemble the runtime system prompt: base + the addendum(s) for the requested
// mode. For "auto", concatenate every addendum so the model can pick.
async function buildSystemPrompt(agentId: string, mode: WriterMode | "auto"): Promise<string> {
  const slots = await getPromptSlots(agentId);
  const base = slots.base.value;
  const addenda =
    mode === "auto"
      ? (Object.keys(slots.addenda) as WriterMode[])
          .map((m) => slots.addenda[m].value.trim())
          .filter((v) => v.length > 0)
      : [slots.addenda[mode].value.trim()].filter((v) => v.length > 0);
  return addenda.length > 0 ? `${base}\n\n${addenda.join("\n\n")}` : base;
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
// fences, then scan for the largest brace-balanced substring, then try the
// lenient repair pass (escapes raw newlines/tabs/control chars inside string
// values — the most common Claude failure on long markdown bodies).
const extractJson = (text: string): RawDraft | null => {
  const tryParse = (s: string): RawDraft | null => {
    try {
      return JSON.parse(s) as RawDraft;
    } catch {
      return null;
    }
  };

  // Walk the text and escape any control character (\n, \r, \t, etc.) that
  // appears INSIDE a JSON string. Strict JSON disallows raw control chars in
  // strings, but Claude regularly writes literal newlines inside multi-line
  // markdown bodies. This is a one-pass repair: outside strings, leave
  // whitespace alone; inside strings, replace raw control chars with their
  // escape sequences.
  const repairControlChars = (s: string): string => {
    let out = "";
    let inString = false;
    let escaped = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i]!;
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        out += ch;
        inString = !inString;
        continue;
      }
      if (inString) {
        if (ch === "\n") { out += "\\n"; continue; }
        if (ch === "\r") { out += "\\r"; continue; }
        if (ch === "\t") { out += "\\t"; continue; }
        // Strip other C0 control chars (0x00–0x1f) that aren't \n/\r/\t.
        const code = ch.charCodeAt(0);
        if (code < 0x20) continue;
      }
      out += ch;
    }
    return out;
  };

  const tryAll = (s: string): RawDraft | null => {
    return tryParse(s) ?? tryParse(repairControlChars(s));
  };

  const trimmed = text.trim();
  let r = tryAll(trimmed);
  if (r) return r;

  const defenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  r = tryAll(defenced);
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
        return tryAll(defenced.slice(start, i + 1));
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

export type RecentPost = {
  id: number;
  title: string;
  dek: string;
  citations: string[];
  publishedAt: Date;
};

// Topical-novelty config. Citation Jaccard similarity > 35% against any of
// the last RECENT_POSTS_LOOKBACK posts → reject as a duplicate of that prior
// piece. 35% is set just below the observed dup pair (50%) and above the
// observed natural overlap of distinct posts on the same news week (~15%).
const RECENT_POSTS_LOOKBACK = 5;
const TOPICAL_OVERLAP_THRESHOLD = 0.35;

function citationJaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const url of setA) if (setB.has(url)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Canonical entity names + observed model hallucinations. Each rule maps a
// regex matching a known misspelling to the canonical replacement. Add a new
// rule whenever we observe a new consistent hallucination — keep entries
// conservative: patterns must be specific enough that no legitimate sentence
// is rewritten.
//
// Rules apply at runtime, before persist. To clean up rows written before a
// rule landed, add a corresponding migration in lib/db/migrations/.
type MisspellingRule = {
  description: string;
  pattern: RegExp;
  replacement: string;
};

const MISSPELLING_RULES: MisspellingRule[] = [
  {
    description: "Anthropologic (real adjective) when meaning the AI lab Anthropic",
    // \b + negative lookahead skips real English adjectives like
    // 'Anthropological' / 'Anthropologically' while catching the bare word
    // and possessives ("Anthropologic's").
    pattern: /\bAnthropologic(?![a-z])/g,
    replacement: "Anthropic",
  },
];

export function sanitizeKnownMisspellings(text: string): string {
  let out = text;
  for (const rule of MISSPELLING_RULES) {
    out = out.replace(rule.pattern, rule.replacement);
  }
  return out;
}

const validateDraft = (
  raw: RawDraft,
  corpus: CorpusItem[],
  recentPosts: RecentPost[] = [],
): Draft | ValidationError => {
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
  // Per-mode minimum body length. Recap format with 2–4 sentences per item
  // lands ~700–900 words for free_pick, ~900–1100 for deep_dive.
  const bodyLen = raw.bodyMarkdown.length;
  // ~5 chars/word for English. Floors set ~85% of the prompted lower bound
  // so we reject genuinely-too-short pieces without flagging tight recaps.
  const minByMode: Record<string, number> = {
    deep_dive: 4000, // ~800 words (floor ≈ 900)
    free_pick: 3000, // ~600 words (floor ≈ 700)
    weekly_recap: 3000, // matches free_pick — same shape, weekly framing
  };
  const minLen = minByMode[String(raw.mode)] ?? 3000;
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

  // Topical novelty: reject if the draft's citation set substantially overlaps
  // a recent post's. Without this, the agent re-runs on the same rolling 7-day
  // corpus and re-selects the same evidence — producing back-to-back posts
  // about the same cluster (observed: two posts 3 minutes apart, 50% overlap).
  for (const prior of recentPosts) {
    const overlap = citationJaccard(citations, prior.citations);
    if (overlap >= TOPICAL_OVERLAP_THRESHOLD) {
      const date = prior.publishedAt.toISOString().slice(0, 10);
      return {
        error: `Draft repeats prior post "${prior.title}" (${date}) — citation Jaccard ${(overlap * 100).toFixed(0)}% (threshold ${(TOPICAL_OVERLAP_THRESHOLD * 100).toFixed(0)}%). Pick a different angle or abort.`,
      };
    }
  }

  return {
    mode: raw.mode as WriterMode,
    tag: raw.tag as WriterTag,
    title: sanitizeKnownMisspellings(raw.title.trim()),
    dek: sanitizeKnownMisspellings(raw.dek.trim()),
    bodyMarkdown: sanitizeKnownMisspellings(raw.bodyMarkdown.trim()),
    citations,
    sourceHeadlineIds: ids,
    rationale: raw.rationale ?? "",
  };
};

export async function loadRecentPosts(limit = RECENT_POSTS_LOOKBACK): Promise<RecentPost[]> {
  const rows = await db
    .select({
      id: postsTable.id,
      title: postsTable.title,
      dek: postsTable.dek,
      citations: postsTable.citations,
      publishedAt: postsTable.publishedAt,
    })
    .from(postsTable)
    .orderBy(desc(postsTable.publishedAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    dek: r.dek,
    citations: Array.isArray(r.citations) ? r.citations : [],
    publishedAt: r.publishedAt,
  }));
}

const formatRecentPosts = (posts: RecentPost[]): string => {
  if (posts.length === 0) return "(no recent posts — first run)";
  return posts
    .map((p) => {
      const date = p.publishedAt.toISOString().slice(0, 10);
      const cites = p.citations.length
        ? `\nCited URLs: ${p.citations.join(", ")}`
        : "";
      return `${date} — ${p.title}\nDek: ${p.dek}${cites}`;
    })
    .join("\n\n");
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

  // Then rank by tier × recency and take the top N. Earnings transcripts get
  // a tier promotion when the mega-cap reporting cluster lands so a single
  // 4/30-style cluster of 5+ transcripts can lead the corpus instead of
  // being out-weighted by lab announcements.
  const now = Date.now();
  const earningsDay = isEarningsDay(rows);
  candidates.sort(
    (a, b) =>
      scoreCorpusItem(b, now, earningsDay) -
      scoreCorpusItem(a, now, earningsDay),
  );
  // Drop near-duplicate stories (e.g. an Anthropic release + Bloomberg's
  // coverage of the same release) so the agent doesn't end up with two slots
  // in the top-10 covering the same news, and reserve at least 2 slots for
  // academic papers (arXiv / HF Papers) so research isn't crowded out by an
  // active lab-publishing week.
  const deduped = dedupeNearDuplicates(candidates);
  const initialTop = deduped.slice(0, CORPUS_MAX_ITEMS);
  return ensurePapersInSelection(initialTop, deduped, 2)
    .sort(
      (a, b) =>
        scoreCorpusItem(b, now, earningsDay) -
        scoreCorpusItem(a, now, earningsDay),
    );
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
  // Top-10 recap format needs at least 10 substantive items in the window.
  if (corpus.length < 10) {
    return { ok: false, error: `Corpus too thin for top-10 recap: ${corpus.length} items in window` };
  }

  // For weekly_recap, pre-compute the dispatch top-10 over the full week
  // and pass it through as a PRIORITY LIST so the writer agent leans on
  // the same items the website surfaces. Resolve corpus IDs by URL to
  // tolerate any case where selectTopHeadlines includes an item that the
  // writer's per-source-capped corpus drops.
  let priorityList: CorpusItem[] = [];
  if (modeHint === "weekly_recap") {
    try {
      const top = await selectTopHeadlines({ days: 7, limit: 10 });
      const corpusByUrl = new Map(corpus.map((c) => [c.url, c]));
      priorityList = top
        .map((t) => corpusByUrl.get(t.url))
        .filter((c): c is CorpusItem => c !== undefined);
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "weekly_recap: failed to load priority top-10; falling back to corpus only",
      );
    }
  }

  // Load recent posts so the agent knows what it has already covered. Without
  // this it has no memory across runs and will re-pick the same cluster from
  // the rolling corpus — the dup-pair root cause.
  const recentPosts = await loadRecentPosts();

  // Per-request timeout. Without this, a hung Venice connection leaves the
  // run Promise pending forever and state stays "running" indefinitely.
  // 8 min is generous: Claude reasoning + body output runs ~4–6 min; this
  // gives ~30% headroom before forcing a clear error.
  const client = new OpenAI({ apiKey, baseURL, timeout: 8 * 60 * 1000 });

  const systemPrompt = await buildSystemPrompt(agentId, modeHint);

  // For weekly_recap we relax the "don't retread recent posts" guidance —
  // the user explicitly wants a weekly roundup, so overlap with the daily
  // posts from the same week is expected and desirable.
  const isWeekly = modeHint === "weekly_recap";

  const priorityBlock = isWeekly && priorityList.length > 0
    ? [
        "",
        `PRIORITY LIST — these ${priorityList.length} headlines are the dispatch top-10 for the past 7 days, ranked by the judge + selection algorithm. Lead with these; only swap one out if the headlines genuinely don't support 2+ sentences of recap. Order them by newsworthiness, not strictly by recency.`,
        "",
        formatCorpus(priorityList),
        "",
      ].join("\n")
    : "";

  const userMessage = [
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
    modeHint === "auto"
      ? "Pick whichever mode the headlines best support."
      : isWeekly
        ? `Mode hint: weekly_recap. This is the once-per-week roundup of the week's top stories. Frame the executive summary around "the week" rather than "today." Use the PRIORITY LIST below as the basis for the top-10.`
        : `Mode hint: ${modeHint}. (You may override if the headlines don't support it — explain in rationale.)`,
    priorityBlock,
    isWeekly
      ? "Recent posts already published this week. The weekly recap is allowed to revisit these stories — the framing is the WEEKLY view, not a fresh thesis. Do not duplicate the daily posts' commentary verbatim, but covering the same headlines is expected."
      : "Recent posts you (or your predecessor) have already published. Do NOT retread these — pick a substantively different thesis using different evidence. If every fresh angle the headlines support is already covered below, return { abort: true, rationale: \"...\" }.",
    "",
    formatRecentPosts(recentPosts),
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
      // Quote the strict-parse error so we can see exactly where parsing
      // breaks (e.g. "Bad control character in string literal at position
      // 1234"). This is the difference between guessing and knowing.
      let parseError: string | null = null;
      try {
        JSON.parse(turnText.trim());
      } catch (err) {
        parseError = err instanceof Error ? err.message : String(err);
      }
      logger.warn(
        {
          model,
          baseURL,
          attempt,
          finishReason,
          parseError,
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

    // Skip the topical-overlap guard for weekly_recap — re-covering the
    // week's stories is the whole point of the mode.
    const result = validateDraft(raw, corpus, isWeekly ? [] : recentPosts);
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
    const isTopicalDup = result.error.startsWith("Draft repeats prior post");

    if (
      attempt < MAX_VALIDATION_ATTEMPTS &&
      (isHallucinatedUrls || isAiTell || isTooShort || isTitleCase || isCorpusWord || isMetaAttrib || isTopicalDup)
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
      } else if (isTopicalDup) {
        retryPrompt = [
          `Your previous response was rejected: ${result.error}`,
          "",
          "These are the recent posts you cannot retread:",
          "",
          formatRecentPosts(recentPosts),
          "",
          "Pick a substantively different thesis from a different cluster of headlines in the corpus. Do not reuse more than ~2 of the previously-cited URLs. If the headlines genuinely don't support an angle distinct from those above, return { abort: true, rationale: \"...\" } — that is the correct outcome, not a forced rewrite of similar material.",
          "",
          "Re-emit the FULL post in the SAME JSON schema, no prose around it.",
        ].join("\n");
      } else {
        // Body-too-short retry. The recap format is intentionally short
        // (exec summary + 10 numbered items, 1–2 sentences each), so a
        // too-short body usually means the model returned fewer than 10
        // items or skipped the executive summary. Push it to fill the
        // standard shape, not to add multi-paragraph essay content.
        const m = result.error.match(/(\d+)\s+chars.*?≥\s*(\d+)/);
        const wrote = m ? Number(m[1]) : null;
        const need = m ? Number(m[2]) : null;
        const wroteWords = wrote ? Math.round(wrote / 5) : null;
        const needWords = need ? Math.round(need / 5) : null;
        retryPrompt = [
          `Your previous response was rejected: ${result.error}`,
          wrote && need
            ? `You wrote ~${wroteWords} words (${wrote} chars). The minimum for ${raw.mode} mode is ~${needWords} words (${need} chars).`
            : `The body is significantly shorter than the required minimum.`,
          "",
          "Hard requirements for this retry:",
          `- Body MUST be at least ${need ?? 3000} characters of markdown.`,
          "- The post is an executive summary + numbered top-10 recap. Make sure both are present.",
          "- Open with a 2–3 sentence executive summary (~50–80 words) naming the day's connecting themes.",
          "- Then a numbered list of exactly 10 items. Each item is 2–4 sentences. The lead clause (publisher + what shipped) is bolded; commentary follows in plain prose.",
          "- For deep_dive mode, the top 3 items lean toward 4 sentences of additional context; items 4–10 stay at 2–3 sentences. Every item stays in the 2–4 sentence band.",
          "- Attribute each item by publisher name (Anthropic, OpenAI, TechCrunch, etc.). Never use meta-references like 'the corpus' or 'the headlines'.",
          "- Do NOT pad items into mini-essays. Stay 2–4 sentences each — every sentence must contribute substance (context, qualification, or pressure-test). If the underlying material can't fill 10 substantive items, set abort:true with a rationale.",
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

  const costUsd = computeCostUsd(model, promptTokens, completionTokens);
  await logUsage({
    caller: "writer",
    callKind: "chat",
    model,
    promptTokens,
    completionTokens,
    costUsd,
  });
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

// ============================================================================
// Weekly schedulers
// ============================================================================
// Two once-per-ISO-week ticks: one deep_dive on Monday mornings and one
// weekly_recap (top-10) on Friday mornings. Idempotent via the posts table —
// if a row with the matching mode already exists for the current ISO week,
// the tick no-ops.

const WEEKLY_TIMEZONE = "America/Los_Angeles";
// 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday.
const DEFAULT_DEEP_DIVE_DOW_PT = 1; // Monday
const DEFAULT_DEEP_DIVE_HOUR_PT = 9;
const DEFAULT_DEEP_DIVE_MINUTE_PT = 0;
const DEFAULT_WEEKLY_DOW_PT = 5; // Friday
const DEFAULT_WEEKLY_HOUR_PT = 9;
const DEFAULT_WEEKLY_MINUTE_PT = 0;
// Tick every 30 minutes; the day-of-week + minute-of-day check inside
// the tick gates the actual work to a single ~30-min window per week.
const WEEKLY_TICK_MS = 30 * 60 * 1000;

let weeklyHandle: NodeJS.Timeout | null = null;
let deepDiveHandle: NodeJS.Timeout | null = null;

function ptParts(now: Date = new Date()): {
  dayOfWeek: number;
  minutesOfDay: number;
  isoWeekKey: string;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: WEEKLY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dayOfWeek = weekdayMap[get("weekday")] ?? 0;
  const hour = Number(get("hour") || "0");
  const minute = Number(get("minute") || "0");
  const minutesOfDay = hour * 60 + minute;

  // ISO week key (e.g. "2026-W19") computed in PT so the boundary is
  // Monday 00:00 PT, matching the cadence the scheduler enforces.
  const yyyy = Number(get("year"));
  const mm = Number(get("month"));
  const dd = Number(get("day"));
  const isoWeekKey = formatIsoWeek(new Date(Date.UTC(yyyy, mm - 1, dd)));

  return { dayOfWeek, minutesOfDay, isoWeekKey };
}

/** Returns the ISO-8601 week key (e.g. "2026-W19") for a given date. */
function formatIsoWeek(d: Date): string {
  // Standard ISO week algorithm: Thursday-of-the-week determines the year.
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/** True if a post with the given mode has been published for the current PT ISO week. */
async function modeAlreadyPublishedThisWeek(mode: WriterMode): Promise<boolean> {
  const { isoWeekKey } = ptParts();
  const [latest] = await db
    .select({ publishedAt: postsTable.publishedAt })
    .from(postsTable)
    .where(eq(postsTable.mode, mode))
    .orderBy(desc(postsTable.publishedAt))
    .limit(1);
  if (!latest) return false;
  return formatIsoWeek(latest.publishedAt) === isoWeekKey;
}

export type WeeklyRunResult =
  | { ran: true; ok: boolean; postId?: number; error?: string }
  | { ran: false; reason: string };

/**
 * Run one weekly_recap. Idempotent: no-ops if one is already published for
 * the current PT ISO week. Exposed so the admin "Run weekly now" button
 * can call it directly.
 */
export async function runWeeklyRecap(opts: { force?: boolean } = {}): Promise<WeeklyRunResult> {
  if (!process.env["LLM_API_KEY"]) {
    return { ran: false, reason: "LLM_API_KEY not configured" };
  }
  if (!opts.force && (await modeAlreadyPublishedThisWeek("weekly_recap"))) {
    return { ran: false, reason: "weekly_recap already published this ISO week" };
  }
  const result = await generateAndSavePost({ modeHint: "weekly_recap" });
  if (result.ok) {
    return { ran: true, ok: true, postId: result.postId };
  }
  return { ran: true, ok: false, error: result.error };
}

/**
 * Run one deep_dive. Idempotent: no-ops if one is already published for the
 * current PT ISO week. Exposed so the admin "Run deep dive now" button can
 * call it directly.
 */
export async function runWeeklyDeepDive(
  opts: { force?: boolean } = {},
): Promise<WeeklyRunResult> {
  if (!process.env["LLM_API_KEY"]) {
    return { ran: false, reason: "LLM_API_KEY not configured" };
  }
  if (!opts.force && (await modeAlreadyPublishedThisWeek("deep_dive"))) {
    return { ran: false, reason: "deep_dive already published this ISO week" };
  }
  const result = await generateAndSavePost({ modeHint: "deep_dive" });
  if (result.ok) {
    return { ran: true, ok: true, postId: result.postId };
  }
  return { ran: true, ok: false, error: result.error };
}

export function startWeeklyRecapScheduler(intervalMs = WEEKLY_TICK_MS): void {
  if (weeklyHandle) return;

  const targetDow = Number(process.env["WEEKLY_RECAP_DOW_PT"] ?? String(DEFAULT_WEEKLY_DOW_PT));
  const targetHour = Number(process.env["WEEKLY_RECAP_HOUR_PT"] ?? String(DEFAULT_WEEKLY_HOUR_PT));
  const targetMinute = Number(
    process.env["WEEKLY_RECAP_MINUTE_PT"] ?? String(DEFAULT_WEEKLY_MINUTE_PT),
  );
  const targetMinutesOfDay = targetHour * 60 + targetMinute;

  const tick = async () => {
    try {
      const { dayOfWeek, minutesOfDay } = ptParts();
      // Only fire on the configured weekday, and only after the configured
      // wall-clock minute. The idempotency check below stops same-day
      // duplicate work; this gate just avoids early-of-day fires.
      if (dayOfWeek !== targetDow) return;
      if (minutesOfDay < targetMinutesOfDay) return;
      if (await modeAlreadyPublishedThisWeek("weekly_recap")) return;
      logger.info("Weekly recap tick: generating");
      const result = await runWeeklyRecap();
      if (!result.ran) {
        logger.info({ reason: result.reason }, "Weekly recap skipped");
        return;
      }
      if (result.ok) {
        logger.info({ postId: result.postId }, "Weekly recap published");
      } else {
        logger.warn({ error: result.error }, "Weekly recap failed");
      }
    } catch (err) {
      logger.error({ err }, "Weekly recap tick threw");
    }
  };

  // Kick off after 60s; then every interval.
  setTimeout(() => void tick(), 60_000);
  weeklyHandle = setInterval(() => void tick(), intervalMs);
}

export function startWeeklyDeepDiveScheduler(intervalMs = WEEKLY_TICK_MS): void {
  if (deepDiveHandle) return;

  const targetDow = Number(
    process.env["WEEKLY_DEEP_DIVE_DOW_PT"] ?? String(DEFAULT_DEEP_DIVE_DOW_PT),
  );
  const targetHour = Number(
    process.env["WEEKLY_DEEP_DIVE_HOUR_PT"] ?? String(DEFAULT_DEEP_DIVE_HOUR_PT),
  );
  const targetMinute = Number(
    process.env["WEEKLY_DEEP_DIVE_MINUTE_PT"] ?? String(DEFAULT_DEEP_DIVE_MINUTE_PT),
  );
  const targetMinutesOfDay = targetHour * 60 + targetMinute;

  const tick = async () => {
    try {
      const { dayOfWeek, minutesOfDay } = ptParts();
      if (dayOfWeek !== targetDow) return;
      if (minutesOfDay < targetMinutesOfDay) return;
      if (await modeAlreadyPublishedThisWeek("deep_dive")) return;
      logger.info("Weekly deep_dive tick: generating");
      const result = await runWeeklyDeepDive();
      if (!result.ran) {
        logger.info({ reason: result.reason }, "Weekly deep_dive skipped");
        return;
      }
      if (result.ok) {
        logger.info({ postId: result.postId }, "Weekly deep_dive published");
      } else {
        logger.warn({ error: result.error }, "Weekly deep_dive failed");
      }
    } catch (err) {
      logger.error({ err }, "Weekly deep_dive tick threw");
    }
  };

  setTimeout(() => void tick(), 60_000);
  deepDiveHandle = setInterval(() => void tick(), intervalMs);
}
