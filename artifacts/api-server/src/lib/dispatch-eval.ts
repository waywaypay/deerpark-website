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
  type DispatchFormattingIssue,
  type DispatchFormattingIssueType,
  type DispatchFormattingResult,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import { logUsage } from "./llm-usage";
import { BANNED_PATTERNS, type Severity } from "./banned-phrases";

const DEFAULT_BASE_URL = "https://api.venice.ai/api/v1";
const DEFAULT_MODEL = "openai-gpt-4o-mini-2024-07-18";

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

You will receive the subject, intro (item 00), and the full list of items 01..N (source, title, commentary). Return a JSON object with five 0-10 scores. For each dimension also return a short note (one sentence max) AND a "worstItems" array of up to 3 items that most hurt this dimension's score — each with the item number (the 2-digit prefix you see; use 0 for the intro) and a short quoted span (≤120 chars, copied verbatim from the offending text) that shows why. If the dimension scores 9+, return an empty worstItems array. The worstItems are the actionable output: an operator should be able to use them to rewrite exactly those items before next send.

DIMENSIONS:

1. introSpecificity (0-10) — Does the intro name a directional claim with specific actors, workflows, governance structures, or buyers? 10 = directional thesis with named actors and connecting thread across multiple items. 5 = vaguely thematic but generic. 0 = "Companies are increasingly reevaluating…" / "today's headlines present a picture…" / interchangeable across any AI news day. For this dimension, worstItems will typically only flag item 0 (the intro).

2. lensDiversity (0-10) — Do the 10 items rotate analytical lenses (operational / GTM / infrastructure / regulatory / labor / pricing / integration friction / technical limitation / competitive)? 10 = different lens for nearly every item. 5 = repeats one or two lenses across most items. 0 = every item asks "who loses competitively?". worstItems should flag items whose lens repeats one already used earlier.

3. cadenceVariety (0-10) — Does the prose vary sentence cadence, or does it repeat the templated formula "X announced Y. This [highlights/signals/underscores/reflects] Z."? 10 = each item structurally different. 5 = noticeable but not dominant template. 0 = same 2-sentence template across most items. worstItems should flag items whose opening sentence follows the template.

4. sourceTiering (0-10) — Does the editorial weight match source weight? Tier 1 (OpenAI / Microsoft / Google / Anthropic / IPOs / regulation) deserves fuller 3-sentence analytical treatment; Tier 3 (academic preprints) should be shorter and name a specific applied audience. 10 = clear weighting differential. 5 = mixed — some flattening visible. 0 = paper items get the same editorial weight as Microsoft strategy posts. worstItems should flag items where the weighting is inverted or flat.

5. concreteness (0-10) — Does each item name a subject, a capability, a metric, an environment, or a workflow — or does it float in abstract business nouns ("operational capabilities", "strategic synergies", "growth trajectory", "data-driven insights")? 10 = nearly every item names concrete subjects. 5 = mixed. 0 = abstract throughout. worstItems should quote the most abstract phrase from each offending item.

Return ONLY this JSON, no prose. Schema for each dimension is identical:
{
  "introSpecificity": { "score": <0-10>, "note": "<one sentence>", "worstItems": [{ "item": <0..N>, "quote": "<short quoted span>" }] },
  "lensDiversity":    { "score": <0-10>, "note": "<one sentence>", "worstItems": [...] },
  "cadenceVariety":   { "score": <0-10>, "note": "<one sentence>", "worstItems": [...] },
  "sourceTiering":    { "score": <0-10>, "note": "<one sentence>", "worstItems": [...] },
  "concreteness":     { "score": <0-10>, "note": "<one sentence>", "worstItems": [...] }
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

function isDimensionPayload(
  v: unknown,
): v is { score: number; note: string; worstItems?: unknown } {
  if (!v || typeof v !== "object") return false;
  const o = v as { score?: unknown; note?: unknown };
  return (
    typeof o.score === "number" &&
    Number.isFinite(o.score) &&
    typeof o.note === "string"
  );
}

// Coerce/validate the per-dimension worstItems array. Tolerant of:
//   - missing/empty (older prompt versions, or 9+ scores)
//   - item numbers as numeric strings ("03")
//   - out-of-range numbers (clamp to 0..itemCount)
// Caps at 3 entries and truncates quotes to 120 chars.
function coerceWorstItems(
  v: unknown,
  itemCount: number,
): Array<{ item: number; quote: string }> {
  if (!Array.isArray(v)) return [];
  const out: Array<{ item: number; quote: string }> = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as { item?: unknown; quote?: unknown };
    const itemN =
      typeof r.item === "number"
        ? r.item
        : typeof r.item === "string"
          ? Number(r.item)
          : NaN;
    if (!Number.isFinite(itemN)) continue;
    const clamped = Math.max(0, Math.min(itemCount, Math.trunc(itemN)));
    const quote = typeof r.quote === "string" ? r.quote.trim().slice(0, 120) : "";
    if (!quote) continue;
    out.push({ item: clamped, quote });
    if (out.length >= 3) break;
  }
  return out;
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

  const itemCount = (row.headlinesSnapshot ?? []).length;
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
      worstItems: coerceWorstItems(v.worstItems, itemCount),
    };
  }
  return { scores: out as DispatchEvalScores, model: setup.model };
}

// Formatting eval -----------------------------------------------------------
//
// Deterministic structural checks. No LLM cost. Score = 10 minus issue
// count, clamped to [0, 10]. Scoped to issues that are usually fixed by
// template / post-processing changes — not the prose itself — which is
// why this is a separate track from the writing rubric.

const FORMATTING_SAMPLE_LEN = 80;

const sample = (s: string): string => {
  const trimmed = s.replace(/\s+/g, " ").trim();
  return trimmed.length <= FORMATTING_SAMPLE_LEN
    ? trimmed
    : `${trimmed.slice(0, FORMATTING_SAMPLE_LEN - 1)}…`;
};

function pushIssue(
  out: Map<DispatchFormattingIssueType, DispatchFormattingIssue>,
  type: DispatchFormattingIssueType,
  count: number,
  sampleText?: string,
): void {
  if (count <= 0) return;
  const existing = out.get(type);
  if (existing) {
    existing.count += count;
    if (!existing.sample && sampleText) existing.sample = sample(sampleText);
    return;
  }
  out.set(type, {
    type,
    count,
    ...(sampleText ? { sample: sample(sampleText) } : {}),
  });
}

function evaluateFormatting(row: DispatchArchive): DispatchFormattingResult {
  const body = row.bodyHtml ?? "";
  const intro = row.introHtml ?? "";
  const issues = new Map<DispatchFormattingIssueType, DispatchFormattingIssue>();

  // 1. Empty paragraphs in body or intro — visible vertical-gap bugs.
  const emptyP = (body + intro).match(/<p[^>]*>\s*(?:&nbsp;| |\s)*<\/p>/gi);
  if (emptyP) pushIssue(issues, "empty_paragraph", emptyP.length, emptyP[0]);

  // 2. Runs of consecutive &nbsp; (3+) — usually a copy-paste artifact.
  const nbspRun = body.match(/(?:&nbsp;| ){3,}/gi);
  if (nbspRun) pushIssue(issues, "nbsp_run", nbspRun.length, nbspRun[0]);

  // 3. Double spaces inside text content (between a letter and a letter,
  //    not inside HTML attributes). Sample one if found.
  const doubleSpace = body.match(/[A-Za-z),.!?]  +[A-Za-z(]/g);
  if (doubleSpace)
    pushIssue(issues, "double_space", doubleSpace.length, doubleSpace[0]);

  // 4. Anchors without href, or with empty/placeholder href.
  const brokenAnchorMatches = Array.from(body.matchAll(/<a\b([^>]*)>/gi));
  let brokenAnchorCount = 0;
  let brokenAnchorSample = "";
  for (const m of brokenAnchorMatches) {
    const attrs = m[1] ?? "";
    const hrefMatch = /\bhref\s*=\s*"([^"]*)"/i.exec(attrs);
    const href = hrefMatch?.[1] ?? "";
    if (!hrefMatch || href.length === 0 || href === "#" || href === "about:blank") {
      brokenAnchorCount++;
      if (!brokenAnchorSample) brokenAnchorSample = m[0];
    }
  }
  if (brokenAnchorCount > 0)
    pushIssue(issues, "broken_anchor", brokenAnchorCount, brokenAnchorSample);

  // 5. Item count mismatch — top-10 dispatch should always be exactly 10.
  const itemCount = (row.headlinesSnapshot ?? []).length;
  if (itemCount !== 10) {
    pushIssue(
      issues,
      "item_count_mismatch",
      1,
      `expected 10 items, got ${itemCount}`,
    );
  }

  // 6. <img> without alt — accessibility + most clients render the alt as
  //    fallback text on image-blocking inboxes.
  const imgs = Array.from(body.matchAll(/<img\b([^>]*)>/gi));
  let missingAlt = 0;
  let missingAltSample = "";
  for (const m of imgs) {
    if (!/\balt\s*=/i.test(m[1] ?? "")) {
      missingAlt++;
      if (!missingAltSample) missingAltSample = m[0];
    }
  }
  if (missingAlt > 0) pushIssue(issues, "missing_alt", missingAlt, missingAltSample);

  // 7. Unrendered template tokens — `{{stories}}`, `{{motif}}`, etc that
  //    survived rendering. Strong signal something broke.
  const tokens = body.match(/\{\{\s*\w+\s*\}\}/g);
  if (tokens) pushIssue(issues, "unrendered_token", tokens.length, tokens[0]);

  // 8. Duplicate hrefs — same item link appearing more than once in the
  //    body (often a sign the same headline got picked up twice).
  const hrefSeen = new Map<string, number>();
  for (const m of body.matchAll(/<a\b[^>]*\bhref\s*=\s*"([^"]+)"[^>]*>/gi)) {
    const href = m[1] ?? "";
    if (href.startsWith("mailto:") || href === "#") continue;
    hrefSeen.set(href, (hrefSeen.get(href) ?? 0) + 1);
  }
  let dupCount = 0;
  let dupSample = "";
  for (const [href, n] of hrefSeen) {
    if (n > 1) {
      dupCount += n - 1;
      if (!dupSample) dupSample = href;
    }
  }
  if (dupCount > 0) pushIssue(issues, "duplicate_link", dupCount, dupSample);

  const arr = Array.from(issues.values()).sort((a, b) => b.count - a.count);
  return {
    issues: arr,
    totalIssues: arr.reduce((s, i) => s + i.count, 0),
  };
}

function formattingScoreFrom(result: DispatchFormattingResult): number {
  const penalty = result.totalIssues;
  return Math.max(0, Math.min(10, 10 - penalty));
}

// Public entry ---------------------------------------------------------------

export type EvalOutcome = {
  ok: boolean;
  composite?: number;
  bannedCount?: number;
  formattingScore?: number;
  formattingIssues?: number;
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
  const formatting = evaluateFormatting(row);
  const formattingScore = formattingScoreFrom(formatting);

  const rubric = await runRubricLlm(row);
  if ("error" in rubric) {
    // Persist deterministic results even if the LLM failed — regex + HTML
    // checks are the most actionable signals and never cost anything.
    await db
      .update(dispatchArchiveTable)
      .set({
        evalBannedPhrasesCount: scan.violationCount,
        evalBannedPhrases: scan.hits,
        evalFormatting: formatting,
        evalFormattingScore: formattingScore.toFixed(2),
        evalRunAt: new Date(),
      })
      .where(eq(dispatchArchiveTable.id, id));
    logger.warn({ id, error: rubric.error }, "Dispatch eval: rubric LLM failed");
    return {
      ok: false,
      bannedCount: scan.violationCount,
      formattingScore,
      formattingIssues: formatting.totalIssues,
      error: rubric.error,
    };
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
      evalFormatting: formatting,
      evalFormattingScore: formattingScore.toFixed(2),
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
      formattingScore,
      formattingIssues: formatting.totalIssues,
    },
    "Dispatch eval: complete",
  );
  return {
    ok: true,
    composite,
    bannedCount: scan.violationCount,
    formattingScore,
    formattingIssues: formatting.totalIssues,
  };
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
 * migration. Safe to call on every boot. Mirrors migrations/0004 + 0007.
 */
export async function ensureDispatchEvalSchema(): Promise<void> {
  await db.execute(sql`ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_scores JSONB`);
  await db.execute(sql`ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_composite_score NUMERIC(4, 2)`);
  await db.execute(sql`ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_banned_phrases_count INTEGER`);
  await db.execute(sql`ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_banned_phrases JSONB`);
  await db.execute(sql`ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_model TEXT`);
  await db.execute(sql`ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_run_at TIMESTAMPTZ`);
  // Three-track eval columns (PR A: formatting; PR B: banner).
  await db.execute(sql`ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_formatting JSONB`);
  await db.execute(sql`ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_formatting_score NUMERIC(4, 2)`);
  await db.execute(sql`ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_banner_scores JSONB`);
  await db.execute(sql`ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_banner_composite_score NUMERIC(4, 2)`);
  await db.execute(sql`ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_banner_model TEXT`);
}
