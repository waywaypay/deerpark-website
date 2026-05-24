// Decomposed writer pipeline (A/B alternative to writer-agent.ts).
//
// Why a v2: the v1 pipeline asks one Claude call to plan + write 700 words
// against ~150 lines of negative constraints. When the validator rejects,
// the retry must rewrite the whole post and often trips a different banned
// pattern (writer-agent.ts:1032-1034). The prompt grows every week as the
// miner adds new bans, and the writing doesn't improve because suppression
// doesn't generate; it just shifts the tics.
//
// v2 splits the work into three focused stages:
//
//   1. PLAN — one small JSON call: pick 10 (headline_id, publisher, verb,
//      lens, rhythm) tuples plus a one-line thesis. Lens rotation and the
//      ≤3-competitive cap are enforced as structural validators on the
//      plan, not as prose pleas inside the prompt.
//
//   2. DRAFT ITEMS — N parallel small calls, one per planned item. Each
//      call sees ONE headline, ONE lens, and ~80 words of POSITIVE-shape
//      constraints for that lens (name a workflow + a mechanism, etc.) —
//      not the union of every negative rule. Per-item retries regenerate
//      only the offending item.
//
//   3. DRAFT INTRO + TITLE + DEK — one small call seeing the finalized
//      items. The intro commits a through-line across 2+ items it can
//      actually see; the title/dek follow the same shape rules in a tiny
//      prompt.
//
// Output is the same `Draft` and `WriteResult` shapes as v1, and the row
// gets persisted to `postsTable` identically — so the eval rubric, the
// archive, the email digest, and the public site all consume v2 output
// without changes. Toggle via env WRITER_ENGINE=v2.

import OpenAI from "openai";
import {
  db,
  postsTable,
  type InsertPost,
} from "@workspace/db";
import { logger } from "./logger";
import { computeCostUsd, logUsage } from "./llm-usage";
import { findFirstViolation } from "./banned-phrases";
import { selectTopHeadlines } from "./top-headlines";
import {
  formatBestExamplesBlock,
  getRecentBestExamples,
} from "./dispatch-best-examples";
import {
  loadCorpus,
  loadRecentPosts,
  sanitizeKnownMisspellings,
  type CorpusItem,
  type Draft,
  type RecentPost,
  type WriteResult,
  type WriterMode,
  type WriterTag,
} from "./writer-agent";

const DEFAULT_BASE_URL = "https://api.venice.ai/api/v1";
const DEFAULT_MODEL = "claude-sonnet-4-5";

// Per-stage timeouts. Plan and intro are small prompts; items are tiny.
// Generous enough to absorb Venice reasoning bursts; tight enough that a
// stuck call doesn't dominate the whole run.
const PLAN_TIMEOUT_MS = 4 * 60 * 1000;
const ITEM_TIMEOUT_MS = 2 * 60 * 1000;
const INTRO_TIMEOUT_MS = 3 * 60 * 1000;

// Per-stage retry budgets. Item retries are surgical (regenerate one item
// of ~50 words) so the cost of an extra attempt is trivial — a higher
// budget here is cheap insurance against transient banned-phrase trips.
const PLAN_MAX_ATTEMPTS = 2;
const ITEM_MAX_ATTEMPTS = 3;
const INTRO_MAX_ATTEMPTS = 2;

// Parallel item drafting concurrency. 10 items × 1 call each; cap at 5 to
// be polite to the provider without serializing.
const ITEM_CONCURRENCY = 5;

// Citation Jaccard threshold against recent posts — same as v1.
const TOPICAL_OVERLAP_THRESHOLD = 0.35;

// ============================================================================
// Lens definitions — positive-shape constraints
// ============================================================================
// Each lens has a short positive instruction telling the model what the
// analysis sentence MUST name. The model only ever sees one lens per
// per-item call, so the instruction is ~3 lines instead of a 9-entry menu
// the model has to mentally rotate through.

type LensId =
  | "operational"
  | "gtm"
  | "infrastructure"
  | "regulatory"
  | "labor"
  | "pricing"
  | "integration"
  | "technical_limit"
  | "competitive"
  | "observational"
  | "skeptical";

type LensSpec = {
  id: LensId;
  name: string;
  positiveShape: string;
};

const LENSES: Record<LensId, LensSpec> = {
  operational: {
    id: "operational",
    name: "operational workflow",
    positiveShape:
      "Name ONE specific workflow (e.g. research, coding, customer support, claims review, AP automation, transcript analysis, schema migration) and ONE concrete change to it (who is staffed differently, which step compresses, what gets audited). Do not predict outcomes.",
  },
  gtm: {
    id: "gtm",
    name: "GTM / procurement",
    positiveShape:
      "Name ONE change to pricing, packaging, channel, customer-acquisition motion, or procurement evaluation. Tie it to a named buyer category (asset managers, CISOs, dev tools teams, etc.).",
  },
  infrastructure: {
    id: "infrastructure",
    name: "infrastructure economics",
    positiveShape:
      "Name ONE specific cost, latency, throughput, or capacity threshold and the direction it just moved. Reference compute, storage, network, power, or data-layer cost shape.",
  },
  regulatory: {
    id: "regulatory",
    name: "regulatory / governance",
    positiveShape:
      "Name ONE governance, compliance, antitrust, audit, or export-control mechanism and the concrete obligation it creates for a named class of operator.",
  },
  labor: {
    id: "labor",
    name: "labor / staffing",
    positiveShape:
      "Name ONE role, contractor category, or function whose staffing or task-mix shifts. Be specific about which roles get reshaped or restaffed.",
  },
  pricing: {
    id: "pricing",
    name: "pricing / unit economics",
    positiveShape:
      "Name ONE specific price anchor, take-rate, margin, or discount mechanic that shifted and quantify it where the headline supports a number.",
  },
  integration: {
    id: "integration",
    name: "integration friction",
    positiveShape:
      "Name ONE specific friction that slows or accelerates rollout: integration cost, data prep, eval harness, switching cost, trust requirement, training time.",
  },
  technical_limit: {
    id: "technical_limit",
    name: "technical limitation",
    positiveShape:
      "Name ONE thing the announcement does NOT solve and ONE concrete way you'd measure whether it works in production.",
  },
  competitive: {
    id: "competitive",
    name: "competitive impact",
    positiveShape:
      "Name an evidenced competitive change — same product category, recent vintage (≤24 months). E.g. 'sits alongside Hebbia and Rogo as the third vertical-financial agent', not 'puts pressure on rivals'. Do not use 'puts pressure on', 'direct challenge', 'leaving X at a disadvantage', 'competitive edge'.",
  },
  observational: {
    id: "observational",
    name: "observational reporting",
    positiveShape:
      "Clean reporting only. Name what shipped (capability, scope, geo, GA-vs-beta) and ONE objectively-notable fact (round size, lead investor, partner count, model size). NO consequence framing, NO interpretation, NO 'this signals'.",
  },
  skeptical: {
    id: "skeptical",
    name: "skeptical caveat",
    positiveShape:
      "Flag ONE specific missing detail the announcement omits — a number, a date, a rollout geography, a benchmark methodology. Name what's missing concretely; do not write 'details remain unclear' or 'questions remain'.",
  },
};

const NON_COMPETITIVE_LENSES: LensId[] = [
  "operational", "gtm", "infrastructure", "regulatory",
  "labor", "pricing", "integration", "technical_limit",
];

const ALLOWED_TAGS: WriterTag[] = ["Analysis", "Market", "Practice", "Signals", "Field Notes"];

// ============================================================================
// Local utilities (intentionally duplicated from writer-agent.ts so v2 can
// evolve independently; identical behavior).
// ============================================================================

type RawJson = Record<string, unknown>;

const extractJson = <T = RawJson>(text: string): T | null => {
  const tryParse = (s: string): T | null => {
    try { return JSON.parse(s) as T; } catch { return null; }
  };
  // Repair raw newlines/tabs/control chars inside JSON string values —
  // Claude's most common failure on multi-line markdown.
  const repair = (s: string): string => {
    let out = "", inString = false, escaped = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i]!;
      if (escaped) { out += ch; escaped = false; continue; }
      if (ch === "\\") { out += ch; escaped = true; continue; }
      if (ch === '"') { out += ch; inString = !inString; continue; }
      if (inString) {
        if (ch === "\n") { out += "\\n"; continue; }
        if (ch === "\r") { out += "\\r"; continue; }
        if (ch === "\t") { out += "\\t"; continue; }
        if (ch.charCodeAt(0) < 0x20) continue;
      }
      out += ch;
    }
    return out;
  };
  const all = (s: string) => tryParse(s) ?? tryParse(repair(s));
  const trimmed = text.trim();
  const direct = all(trimmed);
  if (direct) return direct;
  const defenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const dd = all(defenced);
  if (dd) return dd;
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
    else if (ch === "}") { depth--; if (depth === 0) return all(defenced.slice(start, i + 1)); }
  }
  return null;
};

const extractSentence = (text: string, idx: number): string => {
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
};

const citationJaccard = (a: string[], b: string[]): number => {
  if (a.length === 0 || b.length === 0) return 0;
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  for (const u of A) if (B.has(u)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
};

const AI_TELL_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\b(?:isn['’]?t|wasn['’]?t|aren['’]?t|weren['’]?t|are\s+not|is\s+not|was\s+not|were\s+not)\s+(?:just|only|merely|simply|solely)\b/i, label: "negation + just/only/merely" },
  { re: /\bnot\s+(?:just|only|merely|simply|solely)\s+(?:a|an|the|that|this|these|those)?\s*\w/i, label: "'not just/only/merely X'" },
  { re: /\bnot\s+only\s+\b[^.,;!?]{1,80}\b\s+but\s+(?:also\s+)?/i, label: "'not only X but also Y'" },
  { re: /\bmore\s+than\s+just\b/i, label: "'more than just X'" },
  { re: /\bwhat['’]?s\s+(?:striking|interesting|worth\s+noting|clear|notable|telling|remarkable|surprising)\s+(?:is|here)\b/i, label: "'what's striking/interesting is...'" },
  { re: /\bin\s+(?:a\s+world|an\s+era|a\s+landscape|a\s+time|an\s+age)\s+where\b/i, label: "'in a world/era/landscape where...'" },
  { re: /\bspeaks\s+volumes\b|\bsends?\s+a\s+(?:clear|strong|powerful)\s+(?:message|signal)\b/i, label: "'speaks volumes' / 'sends a clear message'" },
];

const scanForBanIssues = (text: string): { error: string; offendingSentence?: string } | null => {
  const viol = findFirstViolation(text);
  if (viol) {
    return {
      error: `Banned phrase: "${viol.pattern.phrase}"`,
      offendingSentence: extractSentence(text, viol.match.index),
    };
  }
  for (const { re, label } of AI_TELL_PATTERNS) {
    const m = re.exec(text);
    if (m) {
      return {
        error: `AI-tell pattern: ${label}`,
        offendingSentence: extractSentence(text, m.index),
      };
    }
  }
  if (/\bcorpus\b/i.test(text)) {
    const i = text.search(/\bcorpus\b/i);
    return { error: "Meta-reference: 'corpus'", offendingSentence: extractSentence(text, i) };
  }
  return null;
};

// ============================================================================
// Stage 1 — PLAN
// ============================================================================

type PlannedItem = {
  headlineId: number;
  publisher: string;
  actionVerb: string;
  lens: LensId;
};

type Plan = {
  thesis: string;
  items: PlannedItem[];
};

const buildPlanPrompt = (
  corpus: CorpusItem[],
  recentPosts: RecentPost[],
  mode: WriterMode,
  priorityList: CorpusItem[],
): { system: string; user: string } => {
  const corpusBlock = corpus
    .map((c) => `id=${c.id}  [${c.source}]  ${c.title}`)
    .join("\n");
  const recentBlock = recentPosts.length
    ? recentPosts
        .map((p) => `• ${p.title} (cited: ${p.citations.slice(0, 5).join(", ")}${p.citations.length > 5 ? "..." : ""})`)
        .join("\n")
    : "(no recent posts)";
  const priorityBlock = priorityList.length
    ? `\nPRIORITY LIST (the dispatch judge's top-10 for this period — lead with these):\n${priorityList.map((p) => `  id=${p.id}  ${p.title}`).join("\n")}\n`
    : "";

  const allowedLensList = Object.values(LENSES).map((l) => `  ${l.id} — ${l.name}`).join("\n");

  const modeFraming =
    mode === "weekly_recap"
      ? "This is a weekly recap — the thesis frames 'this week', not 'today'."
      : mode === "deep_dive"
        ? "This is a deep_dive — items 1–3 will get a longer treatment, so plan them as the most thesis-bearing."
        : "Standard daily dispatch.";

  return {
    system: [
      "You plan the structure of one DeerPark daily dispatch. You are NOT writing prose; you are picking 10 headlines, assigning each a lens, and writing a one-line thesis.",
      "",
      "OUTPUT JSON only — schema below. No prose around it.",
      "",
      "Schema:",
      "{",
      "  \"thesis\": string,         // ≤30 words, ONE sentence, names a concrete subject (workflow, buyer, governance structure, vertical, or 2+ named companies)",
      "  \"items\": [",
      "    { \"headline_id\": number, \"publisher\": string, \"action_verb\": string, \"lens\": string }",
      "  ]",
      "}",
      "",
      "Or, if fewer than 10 substantive headlines support a real top-10: { \"abort\": true, \"rationale\": string }",
      "",
      "Rules:",
      "- EXACTLY 10 items, ordered by consequence.",
      "- headline_id must reference an id from the headlines block.",
      "- publisher is the publisher name as you'd attribute it in prose (Anthropic, OpenAI, TechCrunch, Bloomberg, METR, etc.).",
      "- action_verb is ONE word matching what shipped: released, shipped, unveiled, rolled out, debuted, launched, opened, expanded, partnered, acquired, raised, hired, sued, sunset. Do NOT use 'announced'. Vary across items.",
      "- lens is one of:",
      allowedLensList,
      "- AT MOST 3 items may use lens 'competitive'.",
      "- Use lens 'observational' for 2–3 items (clean reporting, no consequence framing).",
      "- At most 1 item may use lens 'skeptical' (only when warranted).",
      "- Do NOT pick a cluster whose citation set substantially overlaps recent posts (35% Jaccard threshold).",
      "- Pick a thesis that connects 2+ of the items you chose. No category abstractions (no 'AI is advancing', 'the landscape', 'transformative').",
    ].join("\n"),

    user: [
      `Today is ${new Date().toISOString().slice(0, 10)}. ${modeFraming}`,
      priorityBlock,
      "",
      "Recent posts (do not retread):",
      recentBlock,
      "",
      `Headlines (${corpus.length}):`,
      corpusBlock,
    ].join("\n"),
  };
};

type ValidPlan = { ok: true; plan: Plan } | { ok: false; error: string; abort?: boolean };

const validatePlan = (
  raw: unknown,
  corpus: CorpusItem[],
  recentPosts: RecentPost[],
  allowOverlap: boolean,
): ValidPlan => {
  const obj = raw as { abort?: boolean; rationale?: string; thesis?: string; items?: unknown };
  if (obj?.abort) {
    return { ok: false, abort: true, error: obj.rationale ?? "Agent aborted with no rationale" };
  }
  if (typeof obj?.thesis !== "string" || obj.thesis.trim().length === 0) {
    return { ok: false, error: "Missing thesis" };
  }
  if (!Array.isArray(obj.items) || obj.items.length !== 10) {
    return { ok: false, error: `Plan must have exactly 10 items (got ${Array.isArray(obj.items) ? obj.items.length : "non-array"})` };
  }
  const corpusById = new Map(corpus.map((c) => [c.id, c]));
  const items: PlannedItem[] = [];
  const seenIds = new Set<number>();
  for (const it of obj.items as unknown[]) {
    const item = it as { headline_id?: unknown; publisher?: unknown; action_verb?: unknown; lens?: unknown };
    const id = typeof item.headline_id === "number" ? item.headline_id : NaN;
    if (!corpusById.has(id)) return { ok: false, error: `Plan references unknown headline_id ${item.headline_id}` };
    if (seenIds.has(id)) return { ok: false, error: `Plan duplicates headline_id ${id}` };
    seenIds.add(id);
    const publisher = typeof item.publisher === "string" ? item.publisher.trim() : "";
    if (!publisher) return { ok: false, error: `Plan item ${id} missing publisher` };
    const verb = typeof item.action_verb === "string" ? item.action_verb.trim().toLowerCase() : "";
    if (!verb || verb === "announced") return { ok: false, error: `Plan item ${id} has invalid verb '${item.action_verb}' (use a specific action verb, not 'announced')` };
    const lens = typeof item.lens === "string" ? (item.lens.trim() as LensId) : ("" as LensId);
    if (!(lens in LENSES)) return { ok: false, error: `Plan item ${id} has unknown lens '${item.lens}'` };
    items.push({ headlineId: id, publisher, actionVerb: verb, lens });
  }

  // Lens distribution. Mirrors the prompt rules so a model that ignored
  // them gets a deterministic retry.
  const compCount = items.filter((i) => i.lens === "competitive").length;
  if (compCount > 3) return { ok: false, error: `Plan uses competitive lens ${compCount}× (cap is 3)` };
  const obsCount = items.filter((i) => i.lens === "observational").length;
  if (obsCount < 2) return { ok: false, error: `Plan must include at least 2 observational items (got ${obsCount})` };
  const skepCount = items.filter((i) => i.lens === "skeptical").length;
  if (skepCount > 1) return { ok: false, error: `Plan must include at most 1 skeptical item (got ${skepCount})` };

  // Topical novelty against recent posts.
  if (!allowOverlap) {
    const planUrls = items.map((i) => corpusById.get(i.headlineId)!.url);
    for (const prior of recentPosts) {
      const j = citationJaccard(planUrls, prior.citations);
      if (j >= TOPICAL_OVERLAP_THRESHOLD) {
        return {
          ok: false,
          error: `Plan overlaps recent post "${prior.title}" at Jaccard ${(j * 100).toFixed(0)}% (threshold ${(TOPICAL_OVERLAP_THRESHOLD * 100).toFixed(0)}%) — pick a different cluster or abort`,
        };
      }
    }
  }

  // Thesis sanity — quick banned-phrase scan, same gate body will face.
  const thesisIssue = scanForBanIssues(obj.thesis);
  if (thesisIssue) return { ok: false, error: `Thesis: ${thesisIssue.error}` };

  return { ok: true, plan: { thesis: obj.thesis.trim(), items } };
};

// ============================================================================
// Stage 2 — DRAFT ITEM
// ============================================================================

type DraftedItem = {
  headlineId: number;
  publisher: string;
  url: string;
  markdown: string;
};

const buildItemPrompt = (
  planned: PlannedItem,
  headline: CorpusItem,
  allowExtraSentence: boolean,
): { system: string; user: string } => {
  const lens = LENSES[planned.lens];
  const sentenceBudget = allowExtraSentence ? "2–3 sentences" : "2 sentences (3 only if the analysis genuinely needs the room)";

  return {
    system: [
      `You are writing ONE numbered item for DeerPark's daily dispatch. The analytical lens is "${lens.name}".`,
      "",
      "Required shape:",
      `- ${sentenceBudget} total.`,
      `- Sentence 1 — bolded lead clause: **${planned.publisher} ${planned.actionVerb} <what shipped>.** Use the assigned verb ("${planned.actionVerb}"). Do NOT use "announced".`,
      `- Sentence 2 (and optional sentence 3) — analysis through the ${lens.name} lens: ${lens.positiveShape}`,
      "- Sentence 2 must NOT begin with the word 'This'. Name the actor or consequence directly.",
      "- At most ONE em-dash (—) in the whole item.",
      "- Do NOT predict outcomes ('could', 'may', 'might'). Do NOT use 'puts pressure on', 'direct challenge', 'competitive edge', 'transformative', 'leverages', 'positions itself', 'value proposition', 'growth trajectory'.",
      "- Do NOT pad to a third sentence with a warning or hedge ('questions remain', 'time will tell', 'the path forward is uncertain', 'remains to be seen'). If the analysis fits in 2 sentences, ship 2.",
      "- Attribute claims about the company's own product by using 'says' / 'confirmed' (e.g. 'Anthropic says...'). Do not present company claims as your own assertion.",
      "",
      "Output JSON only:",
      `{ "markdown": "**${planned.publisher} ${planned.actionVerb} ...** ..." }`,
    ].join("\n"),

    user: [
      "Headline you are interpreting:",
      `  Publisher: ${planned.publisher}`,
      `  Source: ${headline.source} (${headline.category})`,
      `  Title: ${headline.title}`,
      `  URL: ${headline.url}`,
      "",
      `Lens: ${lens.name}`,
      `Required of the analysis sentence(s): ${lens.positiveShape}`,
    ].join("\n"),
  };
};

const validateItem = (
  markdown: string,
  planned: PlannedItem,
): { ok: true; markdown: string } | { ok: false; error: string; offendingSentence?: string } => {
  const md = markdown.trim();
  if (!md) return { ok: false, error: "Empty item" };

  // Lead-clause shape: starts with **Publisher verb ...** in bold.
  const leadRe = /^\*\*([^*]+)\*\*/;
  const leadMatch = leadRe.exec(md);
  if (!leadMatch) return { ok: false, error: "Item must open with a **bolded lead clause**" };
  const lead = leadMatch[1]!.toLowerCase();
  if (!lead.includes(planned.publisher.toLowerCase())) {
    return { ok: false, error: `Lead clause must name the publisher "${planned.publisher}"` };
  }
  if (lead.includes("announced")) {
    return { ok: false, error: "Lead clause uses 'announced' — replace with the assigned action verb" };
  }

  // Sentence count: 2 or 3. Splitting outside the bold so the lead counts as
  // sentence 1 even if the model didn't end it with a period before the next.
  const sentenceSplit = md.replace(/\*\*/g, "").split(/(?<=[.!?])\s+(?=[A-Z(])/).map((s) => s.trim()).filter(Boolean);
  if (sentenceSplit.length < 2) return { ok: false, error: `Item has ${sentenceSplit.length} sentence(s); need 2–3` };
  if (sentenceSplit.length > 3) return { ok: false, error: `Item has ${sentenceSplit.length} sentences; cap is 3` };

  // Sentence 2 must not start with "This".
  const s2 = sentenceSplit[1] ?? "";
  if (/^This\s+[a-z]/.test(s2)) {
    return { ok: false, error: "Sentence 2 starts with 'This' — restructure to name the actor or consequence directly", offendingSentence: s2 };
  }

  // Em-dash cap (one max).
  const emDashes = (md.match(/—/g) ?? []).length;
  if (emDashes > 1) {
    return { ok: false, error: `Item contains ${emDashes} em-dashes; cap is 1` };
  }

  // Banned phrases + AI-tells.
  const issue = scanForBanIssues(md);
  if (issue) return { ok: false, error: issue.error, offendingSentence: issue.offendingSentence };

  return { ok: true, markdown: md };
};

// ============================================================================
// Stage 3 — DRAFT INTRO + TITLE + DEK
// ============================================================================

type IntroBlock = {
  title: string;
  dek: string;
  intro: string;
};

const buildIntroPrompt = (
  thesis: string,
  items: DraftedItem[],
  mode: WriterMode,
): { system: string; user: string } => {
  const framing = mode === "weekly_recap" ? "this week" : "today";
  return {
    system: [
      `You are writing the title, dek, and intro thesis for today's DeerPark dispatch. The 10 items are written; you are framing the through-line for ${framing}.`,
      "",
      "Output JSON only:",
      "{ \"title\": string, \"dek\": string, \"intro\": string }",
      "",
      "Title:",
      "- Sentence case, ≤80 chars. Capitalize only the first word + proper nouns (OpenAI, Anthropic, GPT-5, etc.).",
      "- Names the day's editorial angle, not a single item's feature.",
      "",
      "Dek (1–2 sentences, 25–45 words):",
      "- Compresses the through-line. Names at least ONE concrete anchor: a workflow, a buyer category, a deployment surface, a governance structure, a vertical, or 2+ named companies that share the thread.",
      "- NOT a single-item summary. Connects 2+ items.",
      "- No filler verbs ('highlights', 'showcases', 'demonstrates', 'underscores', 'reflects', 'aims to', 'seeks to'). No speculation ('could reshape', 'may boost'). No 'this X highlights Y' press-release shape.",
      "",
      "Intro (2–3 sentences, 50–70 words):",
      "- Opens with a claim that names something concrete (workflow / buyer / governance / deployment surface) — not a category abstraction.",
      "- States what is changing operationally, commercially, or strategically — and for whom.",
      "- Connects 2+ of the items below under one thread.",
      "- No 'today's stories show', 'the week's announcements paint', 'unmistakable trend', 'implications of AI', 'significant transformation', 'transformative'.",
      "",
      `Suggested through-line (from planner): "${thesis}". You may sharpen it; keep the core thread.`,
    ].join("\n"),

    user: [
      "The 10 items in order:",
      "",
      ...items.map((it, i) => `${i + 1}. ${it.markdown}`),
    ].join("\n"),
  };
};

const validateIntro = (raw: unknown): { ok: true; intro: IntroBlock } | { ok: false; error: string; offendingSentence?: string } => {
  const obj = raw as { title?: unknown; dek?: unknown; intro?: unknown };
  if (typeof obj?.title !== "string" || !obj.title.trim()) return { ok: false, error: "Missing title" };
  if (typeof obj?.dek !== "string" || !obj.dek.trim()) return { ok: false, error: "Missing dek" };
  if (typeof obj?.intro !== "string" || !obj.intro.trim()) return { ok: false, error: "Missing intro" };
  const title = obj.title.trim();
  const dek = obj.dek.trim();
  const intro = obj.intro.trim();

  if (title.length > 80) return { ok: false, error: `Title is ${title.length} chars (cap 80)` };

  // Title case detector — same logic as v1.
  const TITLE_CASE_SMALL = new Set(["The","Of","In","On","And","Or","Nor","But","Yet","So","A","An","To","For","With","By","From","As","At","Up","Down","Out","Over","Under","Into","Onto","Off","About","Via","Than","Vs","If"]);
  const toks = title.split(/\s+/);
  let plainCap = 0, lower = 0;
  for (let i = 1; i < toks.length; i++) {
    const t = toks[i]!;
    const stripped = t.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
    if (TITLE_CASE_SMALL.has(stripped)) return { ok: false, error: `Title is Title Case (mid-title "${stripped}" capitalized)` };
    if (stripped.length < 2) continue;
    if (/\d/.test(t)) continue;
    if (/^[A-Z]{2,}$/.test(stripped)) continue;
    if (/[A-Z]/.test(stripped.slice(1))) continue;
    if (/^[A-Z][a-z]+$/.test(stripped)) plainCap++;
    else if (/^[a-z]/.test(stripped)) lower++;
  }
  if (plainCap >= 2 && lower === 0) return { ok: false, error: "Title is Title Case — use sentence case" };

  // Dek length: ~25-45 words.
  const dekWords = dek.split(/\s+/).filter(Boolean).length;
  if (dekWords < 18) return { ok: false, error: `Dek is ${dekWords} words (need ≥18)` };
  if (dekWords > 55) return { ok: false, error: `Dek is ${dekWords} words (cap 55)` };

  // Intro word count: roughly 40-90.
  const introWords = intro.split(/\s+/).filter(Boolean).length;
  if (introWords < 35) return { ok: false, error: `Intro is ${introWords} words (need ≥35)` };
  if (introWords > 100) return { ok: false, error: `Intro is ${introWords} words (cap 100)` };

  // Banned + AI-tell scan across all three.
  for (const [field, text] of [["title", title], ["dek", dek], ["intro", intro]] as const) {
    const issue = scanForBanIssues(text);
    if (issue) return { ok: false, error: `${field}: ${issue.error}`, offendingSentence: issue.offendingSentence };
  }

  return { ok: true, intro: { title, dek, intro } };
};

// ============================================================================
// Orchestrator
// ============================================================================

type ClientCtx = {
  client: OpenAI;
  model: string;
  totalPromptTokens: number;
  totalCompletionTokens: number;
};

const callLlm = async (
  ctx: ClientCtx,
  system: string,
  user: string,
  opts: { timeoutMs: number; maxTokens: number; label: string; assistantHistory?: { role: "assistant" | "user"; content: string }[] },
): Promise<{ text: string } | { error: string }> => {
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: system },
    { role: "user", content: user },
    ...(opts.assistantHistory ?? []),
  ];
  try {
    const response = await ctx.client.chat.completions.create(
      {
        model: ctx.model,
        max_tokens: opts.maxTokens,
        messages,
        response_format: { type: "json_object" },
      },
      { timeout: opts.timeoutMs },
    );
    ctx.totalPromptTokens += response.usage?.prompt_tokens ?? 0;
    ctx.totalCompletionTokens += response.usage?.completion_tokens ?? 0;
    const text = response.choices[0]?.message?.content ?? "";
    if (!text) {
      const finish = response.choices[0]?.finish_reason ?? "?";
      logger.warn({ label: opts.label, finish, usage: response.usage }, "v2: empty response");
      return { error: `Empty response (finish_reason=${finish})` };
    }
    return { text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ label: opts.label, err: msg }, "v2: LLM call failed");
    return { error: `LLM call failed: ${msg}` };
  }
};

const runPlan = async (
  ctx: ClientCtx,
  corpus: CorpusItem[],
  recentPosts: RecentPost[],
  mode: WriterMode,
  priorityList: CorpusItem[],
  allowOverlap: boolean,
): Promise<{ ok: true; plan: Plan } | { ok: false; error: string; abort?: boolean }> => {
  const { system, user } = buildPlanPrompt(corpus, recentPosts, mode, priorityList);
  const history: { role: "assistant" | "user"; content: string }[] = [];

  for (let attempt = 1; attempt <= PLAN_MAX_ATTEMPTS; attempt++) {
    const call = await callLlm(ctx, system, user, {
      timeoutMs: PLAN_TIMEOUT_MS,
      maxTokens: 4096,
      label: `plan/attempt-${attempt}`,
      assistantHistory: history,
    });
    if ("error" in call) return { ok: false, error: call.error };
    const raw = extractJson(call.text);
    if (!raw) return { ok: false, error: "Plan response was not parseable JSON" };
    const valid = validatePlan(raw, corpus, recentPosts, allowOverlap);
    if (valid.ok) return valid;
    if (valid.abort) return { ok: false, error: valid.error, abort: true };
    logger.warn({ attempt, error: valid.error }, "v2: plan rejected");
    if (attempt < PLAN_MAX_ATTEMPTS) {
      history.push({ role: "assistant", content: call.text });
      history.push({ role: "user", content: `Your plan was rejected: ${valid.error}. Re-emit the SAME JSON schema, fixing only the issue noted. No prose around it.` });
      continue;
    }
    return { ok: false, error: valid.error };
  }
  return { ok: false, error: "Plan attempts exhausted" };
};

const runItem = async (
  ctx: ClientCtx,
  planned: PlannedItem,
  headline: CorpusItem,
  allowExtraSentence: boolean,
): Promise<{ ok: true; item: DraftedItem } | { ok: false; error: string }> => {
  const { system, user } = buildItemPrompt(planned, headline, allowExtraSentence);
  const history: { role: "assistant" | "user"; content: string }[] = [];

  for (let attempt = 1; attempt <= ITEM_MAX_ATTEMPTS; attempt++) {
    const call = await callLlm(ctx, system, user, {
      timeoutMs: ITEM_TIMEOUT_MS,
      maxTokens: 2048,
      label: `item/${headline.id}/attempt-${attempt}`,
      assistantHistory: history,
    });
    if ("error" in call) return { ok: false, error: `Item ${headline.id}: ${call.error}` };
    const raw = extractJson<{ markdown?: unknown }>(call.text);
    if (!raw || typeof raw.markdown !== "string") {
      return { ok: false, error: `Item ${headline.id}: response missing 'markdown'` };
    }
    const valid = validateItem(sanitizeKnownMisspellings(raw.markdown), planned);
    if (valid.ok) {
      return {
        ok: true,
        item: {
          headlineId: headline.id,
          publisher: planned.publisher,
          url: headline.url,
          markdown: valid.markdown,
        },
      };
    }
    logger.warn({ headlineId: headline.id, attempt, error: valid.error }, "v2: item rejected");
    if (attempt < ITEM_MAX_ATTEMPTS) {
      history.push({ role: "assistant", content: call.text });
      const offending = valid.offendingSentence ? `\n\nThe sentence that tripped the validator:\n> ${valid.offendingSentence}\n` : "";
      history.push({
        role: "user",
        content: [
          `Your item was rejected: ${valid.error}.${offending}`,
          "Rewrite ONLY the offending part. Same JSON schema, no prose around it.",
        ].join("\n"),
      });
      continue;
    }
    return { ok: false, error: `Item ${headline.id} (${planned.lens}): ${valid.error}` };
  }
  return { ok: false, error: `Item ${headline.id}: attempts exhausted` };
};

const runIntro = async (
  ctx: ClientCtx,
  plan: Plan,
  items: DraftedItem[],
  mode: WriterMode,
): Promise<{ ok: true; intro: IntroBlock } | { ok: false; error: string }> => {
  const { system, user } = buildIntroPrompt(plan.thesis, items, mode);
  const history: { role: "assistant" | "user"; content: string }[] = [];

  for (let attempt = 1; attempt <= INTRO_MAX_ATTEMPTS; attempt++) {
    const call = await callLlm(ctx, system, user, {
      timeoutMs: INTRO_TIMEOUT_MS,
      maxTokens: 2048,
      label: `intro/attempt-${attempt}`,
      assistantHistory: history,
    });
    if ("error" in call) return { ok: false, error: call.error };
    const raw = extractJson(call.text);
    if (!raw) return { ok: false, error: "Intro response was not parseable JSON" };
    const valid = validateIntro(raw);
    if (valid.ok) {
      return {
        ok: true,
        intro: {
          title: sanitizeKnownMisspellings(valid.intro.title),
          dek: sanitizeKnownMisspellings(valid.intro.dek),
          intro: sanitizeKnownMisspellings(valid.intro.intro),
        },
      };
    }
    logger.warn({ attempt, error: valid.error }, "v2: intro rejected");
    if (attempt < INTRO_MAX_ATTEMPTS) {
      history.push({ role: "assistant", content: call.text });
      const offending = valid.offendingSentence ? `\n\nThe sentence that tripped the validator:\n> ${valid.offendingSentence}\n` : "";
      history.push({
        role: "user",
        content: `Your intro/title/dek was rejected: ${valid.error}.${offending}\nRe-emit the FULL JSON schema, fixing only the issue noted. No prose around it.`,
      });
      continue;
    }
    return { ok: false, error: valid.error };
  }
  return { ok: false, error: "Intro attempts exhausted" };
};

// Tiny parallel pool — runs jobs with a max concurrency, returns in input
// order. Avoids pulling in a dependency for one use site.
const mapWithConcurrency = async <T, R>(
  inputs: T[],
  limit: number,
  fn: (t: T, i: number) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(inputs.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, inputs.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= inputs.length) return;
      results[i] = await fn(inputs[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
};

const assembleBody = (intro: IntroBlock, items: DraftedItem[]): string => {
  const numbered = items.map((it, i) => `${i + 1}. ${it.markdown}`).join("\n\n");
  return `${intro.intro}\n\n${numbered}`;
};

const pickTag = (lensCounts: Map<LensId, number>): WriterTag => {
  // Tag-from-lens-distribution — rough mapping so the eval / archive can
  // still segment by tag. Defaults to Analysis if nothing dominates.
  const top = [...lensCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  switch (top) {
    case "gtm":
    case "pricing": return "Market";
    case "operational":
    case "integration": return "Practice";
    case "regulatory":
    case "labor": return "Signals";
    case "observational": return "Field Notes";
    default: return "Analysis";
  }
};

export async function generateAndSavePostV2(opts: {
  agentId?: string;
  modeHint?: WriterMode;
  model?: string;
  corpusDays?: number;
}): Promise<WriteResult> {
  const apiKey = process.env["LLM_API_KEY"];
  if (!apiKey) return { ok: false, error: "LLM_API_KEY not configured" };

  const agentId = opts.agentId ?? "daily-writer";
  const baseURL = process.env["LLM_BASE_URL"] ?? DEFAULT_BASE_URL;
  const model = opts.model ?? process.env["LLM_MODEL"] ?? DEFAULT_MODEL;
  const mode: WriterMode = opts.modeHint ?? "free_pick";
  const isWeekly = mode === "weekly_recap";

  const corpus = await loadCorpus(opts.corpusDays ?? 7);
  if (corpus.length < 10) {
    return { ok: false, error: `Corpus too thin for top-10 recap: ${corpus.length} items` };
  }

  let priorityList: CorpusItem[] = [];
  if (isWeekly) {
    try {
      const top = await selectTopHeadlines({ days: 7, limit: 10 });
      const byUrl = new Map(corpus.map((c) => [c.url, c]));
      priorityList = top.map((t) => byUrl.get(t.url)).filter((c): c is CorpusItem => c !== undefined);
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, "v2: weekly priority list load failed");
    }
  }

  const recentPosts = await loadRecentPosts();

  // Best-examples block is currently only used by v1's user message. v2's
  // per-item prompts are tiny and lens-specific, so the exemplar carries
  // less signal there; we surface it once on the intro call instead, where
  // the model is composing prose at a comparable scope.
  const bestExamples = await getRecentBestExamples(3);
  const bestExamplesBlock = formatBestExamplesBlock(bestExamples);

  const client = new OpenAI({ apiKey, baseURL, timeout: 5 * 60 * 1000 });
  const ctx: ClientCtx = { client, model, totalPromptTokens: 0, totalCompletionTokens: 0 };

  // ── Stage 1: PLAN ────────────────────────────────────────────────────
  const planResult = await runPlan(ctx, corpus, recentPosts, mode, priorityList, isWeekly);
  if (!planResult.ok) {
    return planResult.abort
      ? { ok: false, error: `Agent aborted: ${planResult.error}` }
      : { ok: false, error: `Plan stage: ${planResult.error}` };
  }
  const plan = planResult.plan;
  logger.info({ thesis: plan.thesis, items: plan.items.length }, "v2: plan accepted");

  // ── Stage 2: DRAFT ITEMS (parallel) ──────────────────────────────────
  const corpusById = new Map(corpus.map((c) => [c.id, c]));
  const itemResults = await mapWithConcurrency(plan.items, ITEM_CONCURRENCY, (planned, i) => {
    const headline = corpusById.get(planned.headlineId)!;
    const allowExtra = mode === "deep_dive" && i < 3;
    return runItem(ctx, planned, headline, allowExtra);
  });
  const failed = itemResults.filter((r) => !r.ok) as { ok: false; error: string }[];
  if (failed.length > 0) {
    return { ok: false, error: `Item stage: ${failed.length}/10 failed — ${failed.map((f) => f.error).join("; ")}` };
  }
  const items = itemResults.map((r) => (r as { ok: true; item: DraftedItem }).item);

  // ── Stage 3: INTRO + TITLE + DEK ─────────────────────────────────────
  const introResult = await runIntro(ctx, plan, items, mode);
  if (!introResult.ok) return { ok: false, error: `Intro stage: ${introResult.error}` };
  const intro = introResult.intro;

  // ── Assemble + persist ───────────────────────────────────────────────
  const bodyMarkdown = assembleBody(intro, items);

  // Final defense scan on the assembled body. Anything caught here is a
  // bug in per-stage validation; surface it so we can tighten the relevant
  // stage rather than silently shipping.
  const finalIssue = scanForBanIssues(bodyMarkdown);
  if (finalIssue) {
    return { ok: false, error: `Assembled body still trips gate: ${finalIssue.error}` };
  }

  const lensCounts = new Map<LensId, number>();
  for (const it of plan.items) lensCounts.set(it.lens, (lensCounts.get(it.lens) ?? 0) + 1);
  const tag = pickTag(lensCounts);

  const citations = items.map((it) => it.url);
  const sourceHeadlineIds = items.map((it) => it.headlineId);

  const promptTokens = ctx.totalPromptTokens;
  const completionTokens = ctx.totalCompletionTokens;
  const totalTokens = promptTokens + completionTokens;
  const costUsd = computeCostUsd(model, promptTokens, completionTokens);

  await logUsage({
    caller: "writer",
    callKind: "chat",
    model,
    promptTokens,
    completionTokens,
    costUsd,
  });

  const draft: Draft = {
    mode,
    tag,
    title: intro.title,
    dek: intro.dek,
    bodyMarkdown,
    citations,
    sourceHeadlineIds,
    rationale: plan.thesis,
  };

  const insert: InsertPost = {
    agentId,
    mode: draft.mode,
    tag: draft.tag,
    title: draft.title,
    dek: draft.dek,
    bodyMarkdown: draft.bodyMarkdown,
    citations: draft.citations,
    sourceHeadlineIds: draft.sourceHeadlineIds,
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
      engine: "v2",
      postId: row.id,
      mode: draft.mode,
      tag: draft.tag,
      citations: draft.citations.length,
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd,
      bestExamplesUsed: bestExamples.length,
      // bestExamplesBlock currently unused by v2 prompts — logged so we can
      // see whether we should plumb it into the intro stage based on eval
      // signal once both engines have shipped enough samples.
      bestExamplesBlockBytes: bestExamplesBlock.length,
    },
    "v2: post written",
  );

  return { ok: true, postId: row.id, draft };
}
