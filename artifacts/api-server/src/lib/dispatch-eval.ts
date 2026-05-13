// Regression-guard eval for archived dispatches. Two stages:
//
//   1. Regex sweep — detects the specific banned phrases we've been
//      hardening the prompt against (sentence templates, filler verbs,
//      generic "this [noun]" references, hedging adverbs, etc.). Deterministic
//      and cheap — runs every time. The leak count is the most actionable
//      signal because it's grounded in concrete failures.
//
//   2. LLM rubric — scores five qualitative dimensions 0-10 with a short
//      note each: intro specificity, lens diversity, cadence variety, source
//      tiering, and concreteness. One call per dispatch on a small Haiku-class
//      model.
//
// The composite (mean of the five rubric scores) lands in a numeric column
// so the admin Feedback view can sort/trend without unpacking jsonb. Stored
// alongside the regex hit count so an operator can see at a glance "this
// send dropped from 7.4 to 5.1 — what changed?"

import OpenAI from "openai";
import {
  db,
  dispatchArchiveTable,
  type DispatchArchive,
  type DispatchEvalScores,
  type DispatchBannedPhraseHit,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import { logUsage } from "./llm-usage";

const DEFAULT_BASE_URL = "https://api.venice.ai/api/v1";
const DEFAULT_MODEL = "openai-gpt-4o-mini-2024-07-18";

// Banned phrase patterns. Word-boundary aware. Case-insensitive.
//
// Two severity tiers:
//   "violation" — specific sentence shapes / LLM-tic phrases that should
//     never appear. These drive the visible "X violations" count.
//   "warning"   — bare single-word bans ("increasingly", "transformative",
//     "leverages", etc) that catch both legitimate and synthetic uses.
//     Tracked + displayed but NOT counted toward the violations number, so
//     a clean send can plausibly hit zero violations even when 1-2 of these
//     show up incidentally.
type Severity = "violation" | "warning";
type Pattern = { phrase: string; re: RegExp; severity: Severity };

const BANNED_PATTERNS: Pattern[] = [
  // Intro shapes that kept leaking — VIOLATIONS
  { phrase: "increasingly reevaluating", re: /\bincreasingly\s+reevaluating\b/i, severity: "violation" },
  { phrase: "present(s) a picture", re: /\bpresents?\s+a\s+picture\b/i, severity: "violation" },
  { phrase: "paints a picture", re: /\bpaints\s+a\s+picture\b/i, severity: "violation" },
  { phrase: "growing response", re: /\bgrowing\s+response\b/i, severity: "violation" },
  { phrase: "integration efforts", re: /\bintegration\s+efforts\b/i, severity: "violation" },
  { phrase: "this technology", re: /\bthis\s+technology\b/i, severity: "violation" },
  // Generic "this [noun]" references that signal summary mode — VIOLATIONS
  { phrase: "this development", re: /\bthis\s+development\b/i, severity: "violation" },
  { phrase: "this initiative", re: /\bthis\s+initiative\b/i, severity: "violation" },
  { phrase: "this approach", re: /\bthis\s+approach\b/i, severity: "violation" },
  { phrase: "this expansion", re: /\bthis\s+expansion\b/i, severity: "violation" },
  { phrase: "this ambitious goal", re: /\bthis\s+ambitious\s+goal\b/i, severity: "violation" },
  // Hedging templates — VIOLATIONS
  { phrase: "may need to adapt", re: /\bmay\s+need\s+to\s+adapt\b/i, severity: "violation" },
  { phrase: "may reshape", re: /\bmay\s+reshape\b/i, severity: "violation" },
  { phrase: "could reshape", re: /\bcould\s+reshape\b/i, severity: "violation" },
  { phrase: "could influence", re: /\bcould\s+influence\b/i, severity: "violation" },
  { phrase: "could enable", re: /\bcould\s+enable\b/i, severity: "violation" },
  { phrase: "could enhance", re: /\bcould\s+enhance\b/i, severity: "violation" },
  { phrase: "may prove", re: /\bmay\s+prove\b/i, severity: "violation" },
  { phrase: "could become", re: /\bcould\s+become\b/i, severity: "violation" },
  // Vague cautionary endings — VIOLATIONS
  { phrase: "remains to be seen", re: /\bremains\s+to\s+be\s+seen\b/i, severity: "violation" },
  { phrase: "questions remain", re: /\bquestions\s+remain\b/i, severity: "violation" },
  { phrase: "raises concerns", re: /\braises\s+concerns\b/i, severity: "violation" },
  { phrase: "concerns linger", re: /\bconcerns\s+linger\b/i, severity: "violation" },
  { phrase: "the path forward is uncertain", re: /\bthe\s+path\s+forward\s+is\s+uncertain\b/i, severity: "violation" },
  { phrase: "time will tell", re: /\btime\s+will\s+tell\b/i, severity: "violation" },
  // Speculative competitive framing — VIOLATIONS
  { phrase: "puts pressure on", re: /\bputs?\s+pressure\s+on\b/i, severity: "violation" },
  { phrase: "putting pressure on", re: /\bputting\s+pressure\s+on\b/i, severity: "violation" },
  { phrase: "competitive edge", re: /\bcompetitive\s+edge\b/i, severity: "violation" },
  { phrase: "direct challenge", re: /\bdirect\s+challenge\b/i, severity: "violation" },
  { phrase: "intensifying scrutiny", re: /\bintensifying\s+scrutiny\b/i, severity: "violation" },
  // Cinematic drama — VIOLATIONS
  { phrase: "watershed moment", re: /\bwatershed\s+moment\b/i, severity: "violation" },
  { phrase: "seismic shift", re: /\bseismic\s+shift\b/i, severity: "violation" },
  { phrase: "existential threat", re: /\bexistential\s+threat\b/i, severity: "violation" },
  // Abstract business nouns — VIOLATIONS
  { phrase: "operational frameworks", re: /\boperational\s+frameworks?\b/i, severity: "violation" },
  { phrase: "innovation processes", re: /\binnovation\s+processes\b/i, severity: "violation" },
  { phrase: "customer engagement strategies", re: /\bcustomer\s+engagement\s+strateg(?:y|ies)\b/i, severity: "violation" },
  { phrase: "strategic execution", re: /\bstrategic\s+execution\b/i, severity: "violation" },
  { phrase: "data-driven insights", re: /\bdata[-\s]driven\s+insights\b/i, severity: "violation" },
  { phrase: "competitive landscape", re: /\bcompetitive\s+landscape\b/i, severity: "violation" },
  { phrase: "growth trajectory", re: /\bgrowth\s+trajectory\b/i, severity: "violation" },
  { phrase: "value proposition", re: /\bvalue\s+proposition\b/i, severity: "violation" },
  // Multi-word LLM-isms — VIOLATIONS
  { phrase: "positions itself", re: /\bpositions?\s+itself\b/i, severity: "violation" },
  { phrase: "drives value", re: /\bdrives\s+value\b/i, severity: "violation" },
  // Bare single-word bans — WARNINGS. These catch both legitimate and
  // synthetic uses, so they shouldn't drive the visible violations number.
  { phrase: "underscores", re: /\bunderscores?\b/i, severity: "warning" },
  { phrase: "thereby", re: /\bthereby\b/i, severity: "warning" },
  { phrase: "leverages", re: /\bleverag(?:e|es|ed|ing)\b/i, severity: "warning" },
  { phrase: "formidable", re: /\bformidable\b/i, severity: "warning" },
  { phrase: "swiftly", re: /\bswiftly\b/i, severity: "warning" },
  { phrase: "transformative", re: /\btransformative\b/i, severity: "warning" },
  { phrase: "increasingly (bare)", re: /\bincreasingly\b/i, severity: "warning" },
];

// "this" pattern that catches the LLM-tic of starting sentence 2 with "This".
// Detected separately because it's structural — counted as a hit when an
// item's commentary contains a sentence-starting "This " that isn't followed
// by a proper-noun-cased word (which would be legitimate, e.g. "This Microsoft
// initiative…"). The bolded lead is sentence 1; sentence 2 should not start
// with "This".
const SENTENCE_TWO_THIS_RE = /\.\s+This\s+[a-z]/g;

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function countMatches(re: RegExp, text: string): number {
  const flags = re.flags.includes("g") ? re.flags : re.flags + "g";
  const global = new RegExp(re.source, flags);
  let count = 0;
  while (global.exec(text) !== null) count++;
  return count;
}

type ScanResult = {
  hits: DispatchBannedPhraseHit[];
  /** Count of severity="violation" hits only. This is the headline number
   *  the admin UI shows as "X violations" — bare-word warnings don't count
   *  here, so a clean send can plausibly read zero. */
  violationCount: number;
  /** Count of severity="warning" hits only. Tracked for the warnings
   *  expandable in the admin UI; not part of the violations number. */
  warningCount: number;
};

function scanForBannedPhrases(row: DispatchArchive): ScanResult {
  const introText = stripHtml(row.introHtml);
  const subject = row.subject;
  const items = (row.headlinesSnapshot ?? []).map((it) => stripHtml(it.commentary ?? ""));

  const tallies = new Map<string, DispatchBannedPhraseHit>();
  const bump = (
    phrase: string,
    severity: Severity,
    where: DispatchBannedPhraseHit["locations"][number],
    count: number,
  ) => {
    if (count <= 0) return;
    const entry = tallies.get(phrase) ?? { phrase, count: 0, locations: [], severity };
    entry.count += count;
    for (let i = 0; i < count; i++) entry.locations.push(where);
    tallies.set(phrase, entry);
  };

  for (const pat of BANNED_PATTERNS) {
    bump(pat.phrase, pat.severity, "subject", countMatches(pat.re, subject));
    bump(pat.phrase, pat.severity, "intro", countMatches(pat.re, introText));
    items.forEach((text, i) =>
      bump(pat.phrase, pat.severity, `item:${i + 1}`, countMatches(pat.re, text)),
    );
  }

  // Structural "sentence 2 starts with This" tic — count once per item.
  // Severity: violation — this is the canonical LLM-tic shape.
  items.forEach((text, i) => {
    const hits = (text.match(SENTENCE_TWO_THIS_RE) ?? []).length;
    bump("sentence 2 starts with \"This\"", "violation", `item:${i + 1}`, hits);
  });

  const hits = Array.from(tallies.values()).sort((a, b) => {
    // Violations on top, then by count descending.
    const sevDelta = (a.severity === "violation" ? 0 : 1) - (b.severity === "violation" ? 0 : 1);
    if (sevDelta !== 0) return sevDelta;
    return b.count - a.count;
  });
  let violationCount = 0;
  let warningCount = 0;
  for (const h of hits) {
    if (h.severity === "warning") warningCount += h.count;
    else violationCount += h.count;
  }
  return { hits, violationCount, warningCount };
}

// LLM rubric ----------------------------------------------------------------

const RUBRIC_SYSTEM_PROMPT = `You score archived dispatch newsletters against a fixed editorial rubric. The dispatch is a 10-item AI/tech digest with an editorial intro and 2-3 sentence commentary per item. The voice target is institutional / CIO-briefing analysis — sharp, varied, grounded in named workflows, actors, and operational mechanics.

You will receive the subject, intro, and the full list of items (source, title, commentary). Return a JSON object with five 0-10 scores and a short note for each (one sentence max).

DIMENSIONS:

1. introSpecificity (0-10) — Does the intro name a directional claim with specific actors, workflows, governance structures, or buyers? 10 = directional thesis with named actors and connecting thread across multiple items. 5 = vaguely thematic but generic. 0 = "Companies are increasingly reevaluating…" / "today's headlines present a picture…" / interchangeable across any AI news day.

2. lensDiversity (0-10) — Do the 10 items rotate analytical lenses (operational / GTM / infrastructure / regulatory / labor / pricing / integration friction / technical limitation / competitive)? 10 = different lens for nearly every item. 5 = repeats one or two lenses across most items. 0 = every item asks "who loses competitively?".

3. cadenceVariety (0-10) — Does the prose vary sentence cadence, or does it repeat the templated formula "X announced Y. This [highlights/signals/underscores/reflects] Z."? 10 = each item structurally different. 5 = noticeable but not dominant template. 0 = same 2-sentence template across most items.

4. sourceTiering (0-10) — Does the editorial weight match source weight? Tier 1 (OpenAI / Microsoft / Google / Anthropic / IPOs / regulation) deserves fuller 3-sentence analytical treatment; Tier 3 (arXiv preprints) should be shorter and name a specific applied audience. 10 = clear weighting differential. 5 = mixed — some flattening visible. 0 = arXiv items get the same editorial weight as Microsoft strategy posts.

5. concreteness (0-10) — Does each item name a subject, a capability, a metric, an environment, or a workflow — or does it float in abstract business nouns ("operational capabilities", "strategic synergies", "growth trajectory", "data-driven insights")? 10 = nearly every item names concrete subjects. 5 = mixed. 0 = abstract throughout.

Return ONLY this JSON, no prose:
{
  "introSpecificity": { "score": <0-10>, "note": "<one sentence>" },
  "lensDiversity": { "score": <0-10>, "note": "<one sentence>" },
  "cadenceVariety": { "score": <0-10>, "note": "<one sentence>" },
  "sourceTiering": { "score": <0-10>, "note": "<one sentence>" },
  "concreteness": { "score": <0-10>, "note": "<one sentence>" }
}

Be strict. The dispatch we're scoring routinely tops out around 6-7 on these dimensions; reserve 9-10 for actually exceptional work.`;

function buildEvalUserMessage(row: DispatchArchive): string {
  const introText = stripHtml(row.introHtml);
  const itemBlocks = (row.headlinesSnapshot ?? [])
    .map((it, i) => {
      const num = String(i + 1).padStart(2, "0");
      return `${num}. [${it.source}] ${it.title}\n${(it.commentary ?? "(no commentary)").trim()}`;
    })
    .join("\n\n");
  return `SUBJECT: ${row.subject}\n\nINTRO: ${introText}\n\nITEMS:\n\n${itemBlocks}`;
}

function getClient(): { client: OpenAI; model: string } | null {
  const apiKey = process.env["LLM_API_KEY"];
  if (!apiKey) return null;
  const baseURL = process.env["LLM_BASE_URL"] ?? DEFAULT_BASE_URL;
  const model = process.env["DISPATCH_EVAL_MODEL"] ?? DEFAULT_MODEL;
  const client = new OpenAI({ apiKey, baseURL, timeout: 4 * 60_000, maxRetries: 0 });
  return { client, model };
}

function parseJson(text: string): unknown {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let end = -1;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const DIMENSIONS = [
  "introSpecificity",
  "lensDiversity",
  "cadenceVariety",
  "sourceTiering",
  "concreteness",
] as const;

function isDimensionPayload(v: unknown): v is { score: number; note: string } {
  if (!v || typeof v !== "object") return false;
  const o = v as { score?: unknown; note?: unknown };
  return (
    typeof o.score === "number" &&
    Number.isFinite(o.score) &&
    typeof o.note === "string"
  );
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 10) return 10;
  return Math.round(n * 10) / 10;
}

async function runRubricLlm(row: DispatchArchive): Promise<{
  scores: DispatchEvalScores;
  model: string;
} | { error: string }> {
  const setup = getClient();
  if (!setup) return { error: "no_api_key" };

  let text = "";
  try {
    const response = await setup.client.chat.completions.create({
      model: setup.model,
      max_tokens: 2048,
      messages: [
        { role: "system", content: RUBRIC_SYSTEM_PROMPT },
        { role: "user", content: buildEvalUserMessage(row) },
      ],
      response_format: { type: "json_object" },
    });
    await logUsage({
      caller: "dispatch_eval",
      callKind: "chat",
      model: setup.model,
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
    });
    text = response.choices[0]?.message?.content ?? "";
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  const parsed = parseJson(text);
  if (!parsed || typeof parsed !== "object") {
    return { error: "parse_failed" };
  }

  const obj = parsed as Record<string, unknown>;
  const out: Partial<DispatchEvalScores> = {};
  for (const dim of DIMENSIONS) {
    const v = obj[dim];
    if (!isDimensionPayload(v)) {
      return { error: `missing dimension: ${dim}` };
    }
    out[dim] = {
      score: clampScore(v.score),
      note: v.note.slice(0, 280),
    };
  }
  return { scores: out as DispatchEvalScores, model: setup.model };
}

// Public entry ---------------------------------------------------------------

export type EvalOutcome = {
  ok: boolean;
  composite?: number;
  bannedCount?: number;
  error?: string;
};

/**
 * Run regex scan + LLM rubric for one archived dispatch. Persists results on
 * the dispatch_archive row. Idempotent — re-running overwrites. Safe to call
 * fire-and-forget after archiveDispatch (does its own error handling).
 */
export async function evaluateDispatch(id: number): Promise<EvalOutcome> {
  const [row] = await db
    .select()
    .from(dispatchArchiveTable)
    .where(eq(dispatchArchiveTable.id, id))
    .limit(1);
  if (!row) return { ok: false, error: "not_found" };

  const scan = scanForBannedPhrases(row);

  const rubric = await runRubricLlm(row);
  if ("error" in rubric) {
    // Persist the regex sweep even if the LLM failed — that piece is the
    // most actionable signal and never costs anything to compute.
    await db
      .update(dispatchArchiveTable)
      .set({
        evalBannedPhrasesCount: scan.violationCount,
        evalBannedPhrases: scan.hits,
        evalRunAt: new Date(),
      })
      .where(eq(dispatchArchiveTable.id, id));
    logger.warn({ id, error: rubric.error }, "Dispatch eval: rubric LLM failed");
    return { ok: false, bannedCount: scan.violationCount, error: rubric.error };
  }

  const scores = rubric.scores;
  const composite =
    (scores.introSpecificity.score +
      scores.lensDiversity.score +
      scores.cadenceVariety.score +
      scores.sourceTiering.score +
      scores.concreteness.score) /
    DIMENSIONS.length;

  await db
    .update(dispatchArchiveTable)
    .set({
      evalScores: scores,
      evalCompositeScore: composite.toFixed(2),
      // evalBannedPhrasesCount stores VIOLATIONS only (severity="violation").
      // Bare-word warnings are persisted in the same evalBannedPhrases jsonb
      // with severity tagged, but don't drive the headline number.
      evalBannedPhrasesCount: scan.violationCount,
      evalBannedPhrases: scan.hits,
      evalModel: rubric.model,
      evalRunAt: new Date(),
    })
    .where(eq(dispatchArchiveTable.id, id));

  logger.info(
    {
      id,
      composite: Number(composite.toFixed(2)),
      bannedCount: scan.violationCount,
      warningCount: scan.warningCount,
    },
    "Dispatch eval: complete",
  );
  return { ok: true, composite, bannedCount: scan.violationCount };
}

/** Fire-and-forget wrapper for the post-archive hook. */
export function evaluateDispatchInBackground(id: number): void {
  evaluateDispatch(id).catch((err) => {
    logger.warn(
      { id, err: err instanceof Error ? err.message : String(err) },
      "Dispatch eval: background run failed",
    );
  });
}

/**
 * Idempotent self-heal — adds the eval columns if a prod DB predates the
 * migration. Safe to call on every boot. Mirrors migrations/0004.
 */
export async function ensureDispatchEvalSchema(): Promise<void> {
  await db.execute(sql`ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_scores JSONB`);
  await db.execute(sql`ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_composite_score NUMERIC(4, 2)`);
  await db.execute(sql`ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_banned_phrases_count INTEGER`);
  await db.execute(sql`ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_banned_phrases JSONB`);
  await db.execute(sql`ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_model TEXT`);
  await db.execute(sql`ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_run_at TIMESTAMPTZ`);
}
