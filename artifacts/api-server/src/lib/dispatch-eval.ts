// Regression-guard eval for archived dispatches. Four tracks:
//
//   1. Regex sweep — detects the specific banned phrases we've been
//      hardening the prompt against. Deterministic and cheap; runs every
//      time. The leak count is the most actionable signal because it's
//      grounded in concrete failures.
//
//   2. Formatting check — deterministic HTML/structure issues. Free.
//
//   3. LLM rubric (v2) — five qualitative dimensions, decomposed into one
//      call per dimension, run in parallel against THREE judge models from
//      different families (default: Claude Sonnet 4.6 / GPT-5.5 / Gemini
//      3.1 Pro). Each judge call pins `temperature: 0` plus a deterministic
//      `seed` so re-running gives the same score. The per-judge samples
//      land inside `evalScores.<dim>.samples[]`; the persisted top-level
//      `score` is the mean, the `note` is the sample closest to the mean,
//      and `worstItems` is the merged union (dedup by item+quote prefix).
//      Most recent operator feedback notes are folded into each prompt as
//      calibration anchors — anchors the judges against the operator's
//      taste without requiring a labeled golden set.
//
//   4. Pairwise specificity — one extra LLM call comparing this dispatch's
//      intro against the most recent previous dispatch of the same kind on
//      introSpecificity alone. Absolute 0-10 scoring is noisy across runs;
//      pairwise "is this intro more specific than the last one?" is far
//      more reliable as a regression signal. Result lands in `evalPairwise`.
//
// Engagement signal (`evalUnsubs24h`, `evalUnsubRate24h`) is filled by a
// separate delayed job — at eval time the dispatch has just gone out, so
// the only honest value is "not yet known." See `computeEngagementForDispatch`
// and `startDispatchEngagementScheduler` below.

import { createHash } from "node:crypto";
import OpenAI from "openai";
import {
  db,
  dispatchArchiveTable,
  subscribersTable,
  type DispatchArchive,
  type DispatchEvalScores,
  type DispatchEvalDimension,
  type DispatchEvalDimensionSample,
  type DispatchBannedPhraseHit,
  type DispatchFormattingIssue,
  type DispatchFormattingIssueType,
  type DispatchFormattingResult,
  type DispatchPairwiseSpecificity,
} from "@workspace/db";
import { and, desc, eq, gte, isNotNull, isNull, lt, lte, ne, sql } from "drizzle-orm";
import { logger } from "./logger";
import { logUsage } from "./llm-usage";
import { getAllBannedPatterns, type Severity } from "./banned-phrases";
import {
  ensureDispatchPhraseProposalsSchema,
  minePhraseProposalsInBackground,
} from "./dispatch-phrase-mining";
import { invalidateBestExamplesCache } from "./dispatch-best-examples";

const DEFAULT_BASE_URL = "https://api.venice.ai/api/v1";

// Default judge roster — three judges from three different model families
// to mitigate self-bias (Claude grading Claude prose) and reduce reliance
// on any single judge's idiosyncrasies. Cost on twice-weekly dispatches is
// ~$0.15/send, ~$15/year. Override via DISPATCH_EVAL_JUDGE_MODELS (comma-
// separated). The legacy DISPATCH_EVAL_MODEL env var is honored as a
// single-judge override for cheap-mode runs.
const DEFAULT_JUDGE_MODELS = [
  "claude-sonnet-4-6",
  "openai-gpt-55",
  "gemini-3-1-pro-preview",
] as const;

// Pinned generation params for every rubric call. temperature=0 makes a
// single judge deterministic; seed is the second belt-and-braces in case
// the upstream provider treats 0 as "near-zero" rather than greedy. The
// seed is derived per (dispatchId, dimension, model) so the score is
// reproducible AND different judges still produce independent samples.
const JUDGE_TEMPERATURE = 0;
const JUDGE_TOP_P = 1;
const JUDGE_MAX_TOKENS = 768;

// Most recent K dispatches with operator feedback that get folded into
// each rubric prompt as calibration anchors. Two is enough to nudge the
// judge toward the operator's taste without blowing the context budget.
const CALIBRATION_ANCHOR_COUNT = 2;

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

/** Read a previously-persisted banned-phrase scan off the row, or `null`
 *  if this row hasn't been scanned yet. Used by evaluateDispatch so a
 *  re-eval doesn't overwrite the original scan with one taken against a
 *  later, drifted catalogue — that would silently retroactively flag
 *  phrases the miner only added AFTER the dispatch shipped, corrupting
 *  the cross-time comparability evalRubricVersion exists to protect. */
function readPersistedBannedPhrases(row: DispatchArchive): ScanResult | null {
  if (row.evalBannedPhrasesCount === null || row.evalBannedPhrases === null) {
    return null;
  }
  const hits = row.evalBannedPhrases ?? [];
  let violationCount = 0;
  let warningCount = 0;
  for (const h of hits) {
    if (h.severity === "warning") warningCount += h.count;
    else violationCount += h.count;
  }
  return { hits, violationCount, warningCount };
}

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

  // Static catalogue + dynamically mined proposals. Dynamic patterns are
  // refreshed periodically by the banned-phrases module (and on demand
  // after each mining run); reading the merged list here means the
  // eval scan stays in sync with whatever the runtime gate is enforcing.
  for (const pat of getAllBannedPatterns()) {
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

// LLM rubric (v2) -----------------------------------------------------------

// Shared framing every per-dimension judge sees. Kept here (not inside each
// dimension prompt) because changing this is what should bump the rubric
// version hash — it's the "what we're scoring" definition shared across
// dimensions. Per-dimension definitions live below as separate constants.
const RUBRIC_SHARED_PREAMBLE = `You are scoring an archived "dispatch" newsletter against a fixed editorial rubric. The dispatch is a 10-item AI/tech digest with an editorial intro and 2-3 sentence commentary per item. The voice target is institutional / CIO-briefing analysis — sharp, varied, grounded in named workflows, actors, and operational mechanics.

You will receive the subject line, intro text (item 0), and the full list of items 01..N (source, title, commentary).

You will also receive recent OPERATOR FEEDBACK from the human who runs this dispatch on previous sends, where available. These are not labeled with scores — treat them as anchors for what this operator cares about and considers good vs bad. Use them to calibrate your strictness, NOT to override the rubric.

Be strict. The dispatch we're scoring routinely tops out around 6-7 on these dimensions; reserve 9-10 for actually exceptional work.`;

const RUBRIC_OUTPUT_INSTRUCTIONS = `Return ONLY this JSON, no prose:
{
  "score": <0-10, one decimal allowed>,
  "note": "<one sentence, max 280 chars>",
  "worstItems": [{ "item": <0..N>, "quote": "<≤120 chars, copied verbatim from the offending text>" }]
}

worstItems should contain up to 3 entries flagging the items that most hurt the score. If the score is 9+, return an empty worstItems array. The intro is item 0.`;

const DIMENSION_PROMPTS: Record<keyof DispatchEvalScores, string> = {
  introSpecificity: `${RUBRIC_SHARED_PREAMBLE}

DIMENSION: introSpecificity (0-10)

Does the intro name a directional claim with specific actors, workflows, governance structures, or buyers? 10 = directional thesis with named actors and a connecting thread across multiple items. 5 = vaguely thematic but generic. 0 = "Companies are increasingly reevaluating…" / "today's headlines present a picture…" / interchangeable across any AI news day.

For this dimension, worstItems will typically only flag item 0 (the intro itself).

${RUBRIC_OUTPUT_INSTRUCTIONS}`,

  lensDiversity: `${RUBRIC_SHARED_PREAMBLE}

DIMENSION: lensDiversity (0-10)

Do the 10 items rotate analytical lenses (operational / GTM / infrastructure / regulatory / labor / pricing / integration friction / technical limitation / competitive)? 10 = different lens for nearly every item. 5 = repeats one or two lenses across most items. 0 = every item asks "who loses competitively?".

worstItems should flag items whose lens repeats one already used earlier in the dispatch.

${RUBRIC_OUTPUT_INSTRUCTIONS}`,

  cadenceVariety: `${RUBRIC_SHARED_PREAMBLE}

DIMENSION: cadenceVariety (0-10)

Does the prose vary sentence cadence, or does it repeat the templated formula "X announced Y. This [highlights/signals/underscores/reflects] Z."? 10 = each item structurally different. 5 = noticeable but not dominant template. 0 = same 2-sentence template across most items.

worstItems should flag items whose opening sentence follows the template.

${RUBRIC_OUTPUT_INSTRUCTIONS}`,

  sourceTiering: `${RUBRIC_SHARED_PREAMBLE}

DIMENSION: sourceTiering (0-10)

Does the editorial weight match source weight? Tier 1 (frontier-lab releases, top-tier vendor strategy posts, IPOs / M&A / regulation from OpenAI / Microsoft / Google / Anthropic etc) deserves fuller 3-sentence analytical treatment; lower-tier items (research-blog posts, secondary-vendor product updates, niche applied tooling) should be shorter and name a specific applied audience. 10 = clear weighting differential. 5 = mixed — some flattening visible. 0 = research-blog items get the same editorial weight as Microsoft strategy posts.

worstItems should flag items where the weighting is inverted or flat.

${RUBRIC_OUTPUT_INSTRUCTIONS}`,

  concreteness: `${RUBRIC_SHARED_PREAMBLE}



Does each item name a subject, a capability, a metric, an environment, or a workflow — or does it float in abstract business nouns ("operational capabilities", "strategic synergies", "growth trajectory", "data-driven insights")? 10 = nearly every item names concrete subjects. 5 = mixed. 0 = abstract throughout.

worstItems should quote the most abstract phrase from each offending item.

${RUBRIC_OUTPUT_INSTRUCTIONS}`,
};

const PAIRWISE_SPECIFICITY_PROMPT = `${RUBRIC_SHARED_PREAMBLE}

TASK: pairwise comparison on introSpecificity ONLY.

You will be given TWO dispatch intros: "CURRENT" (today's send) and "PREVIOUS" (the prior send). Decide which intro is more specific by the definition above (directional claim with named actors / workflows / structures, vs. generic AI-news framing).

Pairwise scoring is more reliable than absolute scoring — be decisive. Tie only when the two are genuinely indistinguishable on this dimension.

Return ONLY this JSON, no prose:
{
  "winner": "current" | "previous" | "tie",
  "margin": <0..3>,    // 0 only when winner = "tie"; 1 = slight, 2 = clear, 3 = decisive
  "rationale": "<one to two sentences, max 280 chars>"
}`;

const DIMENSIONS = [
  "introSpecificity",
  "lensDiversity",
  "cadenceVariety",
  "sourceTiering",
  "concreteness",
] as const;

/** Content-addressed identifier for the rubric prompt set. Hashes ONLY the
 *  static templates (preamble + per-dim prompts + output schema + pairwise
 *  prompt). Calibration anchors are excluded because they change every send;
 *  including them would invalidate the version on every dispatch and defeat
 *  the point of versioning. */
function computeRubricVersion(): string {
  const parts: string[] = [
    "v2",
    RUBRIC_SHARED_PREAMBLE,
    RUBRIC_OUTPUT_INSTRUCTIONS,
    ...DIMENSIONS.map((d) => `${d}::${DIMENSION_PROMPTS[d]}`),
    `pairwise::${PAIRWISE_SPECIFICITY_PROMPT}`,
  ];
  return createHash("sha256")
    .update(parts.join("\n----\n"))
    .digest("hex")
    .slice(0, 16);
}

const RUBRIC_VERSION = computeRubricVersion();

// --- Judge roster ---------------------------------------------------------

type Judge = { model: string };

function getJudgeRoster(): Judge[] {
  const envRoster = process.env["DISPATCH_EVAL_JUDGE_MODELS"]?.trim();
  if (envRoster) {
    const models = envRoster
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (models.length > 0) return models.map((model) => ({ model }));
  }
  // Legacy single-judge override — keeps old runs reproducible if an
  // operator was relying on DISPATCH_EVAL_MODEL.
  const legacy = process.env["DISPATCH_EVAL_MODEL"]?.trim();
  if (legacy) return [{ model: legacy }];
  return DEFAULT_JUDGE_MODELS.map((model) => ({ model }));
}

function getClient(): OpenAI | null {
  const apiKey = process.env["LLM_API_KEY"];
  if (!apiKey) return null;
  const baseURL = process.env["LLM_BASE_URL"] ?? DEFAULT_BASE_URL;
  return new OpenAI({ apiKey, baseURL, timeout: 4 * 60_000, maxRetries: 0 });
}

// Deterministic seed per (dispatchId, dimension, model) so re-runs are
// reproducible. 32-bit unsigned int from a sha256 prefix — fits Node's
// integer range and the OpenAI SDK's `seed` param. Different judges get
// different seeds naturally because the model name is in the hash.
function seedFor(dispatchId: number, dimension: string, model: string): number {
  const h = createHash("sha256")
    .update(`${dispatchId}::${dimension}::${model}::${RUBRIC_VERSION}`)
    .digest();
  // First 4 bytes → uint32. >>> 0 forces unsigned in JS.
  return (h.readUInt32BE(0) >>> 0);
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

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 10) return 10;
  return Math.round(n * 10) / 10;
}

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

// --- Calibration anchors --------------------------------------------------
//
// Fetch the most recent K dispatches that have operator feedback. These get
// folded into every rubric prompt to anchor the judge's strictness against
// the operator's actual taste. We intentionally include feedback only (not
// the full intro/items of each anchor) because the prompts are already
// long, and the feedback text is the part that conveys the operator's
// preferences. The composite score of the anchor dispatch is included so
// the judge can correlate "feedback this critical → score around X".

type CalibrationAnchor = {
  dispatchId: number;
  subject: string;
  composite: number | null;
  feedback: string;
};

async function getCalibrationAnchors(
  excludeId: number,
  limit = CALIBRATION_ANCHOR_COUNT,
): Promise<CalibrationAnchor[]> {
  if (limit <= 0) return [];
  const rows = await db
    .select({
      id: dispatchArchiveTable.id,
      subject: dispatchArchiveTable.subject,
      composite: dispatchArchiveTable.evalCompositeScore,
      feedback: dispatchArchiveTable.feedback,
    })
    .from(dispatchArchiveTable)
    .where(
      and(
        ne(dispatchArchiveTable.id, excludeId),
        isNotNull(dispatchArchiveTable.feedback),
        sql`length(${dispatchArchiveTable.feedback}) > 0`,
      ),
    )
    .orderBy(desc(dispatchArchiveTable.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    dispatchId: r.id,
    subject: r.subject,
    composite: r.composite === null ? null : Number(r.composite),
    feedback: (r.feedback ?? "").trim().slice(0, 2000),
  }));
}

function buildCalibrationBlock(anchors: CalibrationAnchor[]): string {
  if (anchors.length === 0) {
    return "OPERATOR FEEDBACK ON PRIOR SENDS: (none yet — score against the rubric definition above)";
  }
  const blocks = anchors.map((a) => {
    const score =
      a.composite === null ? "no prior eval" : `prior rubric composite: ${a.composite.toFixed(2)}/10`;
    return `--- Prior dispatch #${a.dispatchId} ("${a.subject}") — ${score} ---\nOperator wrote:\n${a.feedback}`;
  });
  return `OPERATOR FEEDBACK ON PRIOR SENDS (use as calibration anchors, not as rubric overrides):\n\n${blocks.join("\n\n")}`;
}

// --- Per-dimension user message -------------------------------------------

function buildDimensionUserMessage(
  row: DispatchArchive,
  calibrationBlock: string,
): string {
  const introText = stripHtml(row.introHtml);
  const itemBlocks = (row.headlinesSnapshot ?? [])
    .map((it, i) => {
      const num = String(i + 1).padStart(2, "0");
      return `${num}. [${it.source}] ${it.title}\n${(it.commentary ?? "(no commentary)").trim()}`;
    })
    .join("\n\n");
  return `${calibrationBlock}\n\n--- DISPATCH UNDER REVIEW ---\n\nSUBJECT: ${row.subject}\n\nINTRO: ${introText}\n\nITEMS:\n\n${itemBlocks}`;
}

// --- One (dimension × judge) call -----------------------------------------

type JudgeCallResult =
  | { ok: true; sample: DispatchEvalDimensionSample }
  | { ok: false; error: string };

async function runDimensionAgainstJudge(
  client: OpenAI,
  judge: Judge,
  dimension: keyof DispatchEvalScores,
  row: DispatchArchive,
  calibrationBlock: string,
): Promise<JudgeCallResult> {
  const itemCount = (row.headlinesSnapshot ?? []).length;
  const userMessage = buildDimensionUserMessage(row, calibrationBlock);
  const seed = seedFor(row.id, dimension, judge.model);

  let text = "";
  try {
    const response = await client.chat.completions.create({
      model: judge.model,
      temperature: JUDGE_TEMPERATURE,
      top_p: JUDGE_TOP_P,
      seed,
      max_tokens: JUDGE_MAX_TOKENS,
      messages: [
        { role: "system", content: DIMENSION_PROMPTS[dimension] },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
    });
    await logUsage({
      caller: "dispatch_eval",
      callKind: "chat",
      model: judge.model,
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
    });
    text = response.choices[0]?.message?.content ?? "";
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const parsed = parseJson(text);
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "parse_failed" };
  }
  const obj = parsed as { score?: unknown; note?: unknown; worstItems?: unknown };
  if (typeof obj.score !== "number" || !Number.isFinite(obj.score)) {
    return { ok: false, error: "missing score" };
  }
  if (typeof obj.note !== "string") {
    return { ok: false, error: "missing note" };
  }
  return {
    ok: true,
    sample: {
      model: judge.model,
      score: clampScore(obj.score),
      note: obj.note.slice(0, 280),
      worstItems: coerceWorstItems(obj.worstItems, itemCount),
    },
  };
}

// --- Aggregate per-dimension samples into the persisted DispatchEvalDimension

function aggregateDimensionSamples(
  samples: DispatchEvalDimensionSample[],
): DispatchEvalDimension {
  // Mean for the headline score. We trust the ensemble; we don't outlier-
  // reject because n=3 is too small for that to be reliable.
  const mean = samples.reduce((s, x) => s + x.score, 0) / samples.length;
  const score = clampScore(mean);

  // Pick the note from the sample closest to the mean — the "median voice"
  // — so the displayed rationale matches the displayed score. Ties broken
  // by the first sample (deterministic given the roster order).
  let bestIdx = 0;
  let bestDelta = Math.abs(samples[0]!.score - mean);
  for (let i = 1; i < samples.length; i++) {
    const d = Math.abs(samples[i]!.score - mean);
    if (d < bestDelta) {
      bestDelta = d;
      bestIdx = i;
    }
  }
  const note = samples[bestIdx]!.note;

  // Merge worstItems across judges. Dedup by (item, first 40 chars of the
  // quote) so the same complaint phrased slightly differently doesn't
  // appear three times. Cap at 3 to match the original UI affordance.
  const seen = new Set<string>();
  const merged: Array<{ item: number; quote: string }> = [];
  for (const sample of samples) {
    for (const wi of sample.worstItems ?? []) {
      const key = `${wi.item}::${wi.quote.slice(0, 40).toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(wi);
      if (merged.length >= 3) break;
    }
    if (merged.length >= 3) break;
  }

  return { score, note, worstItems: merged, samples };
}

// --- Full rubric: 5 dimensions × N judges, all in parallel ----------------

type RubricResult =
  | {
      ok: true;
      scores: DispatchEvalScores;
      judgeModels: string[];
    }
  | { ok: false; error: string };

async function runFullRubric(
  client: OpenAI,
  judges: Judge[],
  row: DispatchArchive,
): Promise<RubricResult> {
  const anchors = await getCalibrationAnchors(row.id);
  const calibrationBlock = buildCalibrationBlock(anchors);

  // 5 × N calls in parallel. At 3 judges, that's 15 calls — fine to
  // promise.all because each provider tolerates the concurrency and any
  // individual failure just drops a sample, doesn't fail the dispatch.
  const callPlan: Array<{
    dimension: keyof DispatchEvalScores;
    judge: Judge;
  }> = [];
  for (const dimension of DIMENSIONS) {
    for (const judge of judges) callPlan.push({ dimension, judge });
  }

  const results = await Promise.all(
    callPlan.map((p) =>
      runDimensionAgainstJudge(client, p.judge, p.dimension, row, calibrationBlock).then(
        (r) => ({ ...p, result: r }),
      ),
    ),
  );

  // Bucket samples by dimension. If a dimension has zero successful samples
  // across all judges we fail the rubric — the row stays without a v2 score
  // and the deterministic tracks still persist.
  const bucketed: Partial<Record<keyof DispatchEvalScores, DispatchEvalDimensionSample[]>> = {};
  for (const r of results) {
    if (r.result.ok) {
      const arr = bucketed[r.dimension] ?? [];
      arr.push(r.result.sample);
      bucketed[r.dimension] = arr;
    } else {
      logger.warn(
        { dispatchId: row.id, dimension: r.dimension, model: r.judge.model, error: r.result.error },
        "Dispatch eval: judge call failed",
      );
    }
  }

  const out: Partial<DispatchEvalScores> = {};
  const expectedJudges = judges.length;
  for (const dim of DIMENSIONS) {
    const samples = bucketed[dim] ?? [];
    if (samples.length === 0) {
      return { ok: false, error: `all judges failed on ${dim}` };
    }
    if (samples.length < expectedJudges) {
      // Persisted samples[] already encodes the per-dimension count, but
      // surface the ensemble shrink at log time so an operator comparing
      // composite trends notices when this row's mean is computed against
      // a smaller-than-roster sample. The full roster ran; some judges
      // dropped this dimension specifically (truncated JSON, missing
      // field, etc).
      logger.warn(
        {
          dispatchId: row.id,
          dimension: dim,
          samples: samples.length,
          expected: expectedJudges,
        },
        "Dispatch eval: dimension scored by partial ensemble",
      );
    }
    out[dim] = aggregateDimensionSamples(samples);
  }

  // Use the union of judge models that produced at least one sample. If a
  // judge crashed on every dimension it doesn't get credit on the row.
  const usedJudges = new Set<string>();
  for (const r of results) {
    if (r.result.ok) usedJudges.add(r.judge.model);
  }

  return {
    ok: true,
    scores: out as DispatchEvalScores,
    judgeModels: Array.from(usedJudges),
  };
}

// --- Pairwise specificity -------------------------------------------------

async function findPreviousDispatch(
  row: DispatchArchive,
): Promise<DispatchArchive | null> {
  const [prev] = await db
    .select()
    .from(dispatchArchiveTable)
    .where(
      and(
        eq(dispatchArchiveTable.kind, row.kind),
        ne(dispatchArchiveTable.id, row.id),
        lt(dispatchArchiveTable.createdAt, row.createdAt),
      ),
    )
    .orderBy(desc(dispatchArchiveTable.createdAt))
    .limit(1);
  return prev ?? null;
}

async function runPairwiseSpecificity(
  client: OpenAI,
  judges: Judge[],
  current: DispatchArchive,
  previous: DispatchArchive,
): Promise<DispatchPairwiseSpecificity | null> {
  // Pairwise uses a SINGLE judge (one call, not the full ensemble) — a
  // three-judge ensemble on a pairwise call would just majority-vote, and
  // the pairwise signal is already noise-resistant relative to absolute
  // scoring. Iterate the roster in order so a misconfigured / unreachable
  // first judge doesn't permanently null out the pairwise field — the
  // healthy judges further down the roster get a chance instead.
  if (judges.length === 0) return null;

  const currentIntro = stripHtml(current.introHtml);
  const previousIntro = stripHtml(previous.introHtml);
  const userMessage =
    `CURRENT (dispatch #${current.id}, "${current.subject}"):\n${currentIntro}\n\n` +
    `PREVIOUS (dispatch #${previous.id}, "${previous.subject}"):\n${previousIntro}`;

  for (const judge of judges) {
    const seed = seedFor(current.id, "pairwise:introSpecificity", judge.model);
    let text = "";
    try {
      const response = await client.chat.completions.create({
        model: judge.model,
        temperature: JUDGE_TEMPERATURE,
        top_p: JUDGE_TOP_P,
        seed,
        max_tokens: JUDGE_MAX_TOKENS,
        messages: [
          { role: "system", content: PAIRWISE_SPECIFICITY_PROMPT },
          { role: "user", content: userMessage },
        ],
        response_format: { type: "json_object" },
      });
      await logUsage({
        caller: "dispatch_eval",
        callKind: "chat",
        model: judge.model,
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
      });
      text = response.choices[0]?.message?.content ?? "";
    } catch (err) {
      logger.warn(
        {
          dispatchId: current.id,
          model: judge.model,
          error: err instanceof Error ? err.message : String(err),
        },
        "Dispatch eval: pairwise call failed — trying next judge",
      );
      continue;
    }

    const parsed = parseJson(text);
    if (!parsed || typeof parsed !== "object") continue;
    const obj = parsed as { winner?: unknown; margin?: unknown; rationale?: unknown };
    const winner =
      obj.winner === "current" || obj.winner === "previous" || obj.winner === "tie"
        ? obj.winner
        : null;
    if (!winner) continue;
    const marginRaw = typeof obj.margin === "number" ? obj.margin : Number(obj.margin);
    if (!Number.isFinite(marginRaw)) continue;
    const margin = Math.max(0, Math.min(3, Math.trunc(marginRaw))) as 0 | 1 | 2 | 3;
    // Coherence: a tie must have margin 0, and a non-tie must have margin ≥ 1.
    if (winner === "tie" && margin !== 0) continue;
    if (winner !== "tie" && margin === 0) continue;
    const rationale =
      typeof obj.rationale === "string" ? obj.rationale.trim().slice(0, 280) : "";
    if (!rationale) continue;

    return {
      comparedToId: previous.id,
      winner,
      margin,
      rationale,
      model: judge.model,
    };
  }

  return null;
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
  // The middle alternative is U+00A0 written as a Unicode escape (an actual
  // NBSP byte) so the source stays pure-ASCII; behaviorally redundant with
  // \s on the current JS engine but kept explicit so intent survives future
  // edits.
  const emptyP = (body + intro).match(/<p[^>]*>\s*(?:&nbsp;|\u00a0|\s)*<\/p>/gi);
  if (emptyP) pushIssue(issues, "empty_paragraph", emptyP.length, emptyP[0]);

  // 2. Runs of consecutive &nbsp; (3+) — usually a copy-paste artifact.
  // Matches either the entity OR a literal NBSP byte (\u00a0); a plain
  // space here would over-match ordinary indentation and conflict with the
  // double_space check below.
  const nbspRun = body.match(/(?:&nbsp;|\u00a0){3,}/gi);
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
  /** Pairwise winner against the previous dispatch on introSpecificity.
   *  Absent on the first dispatch or when the pairwise call failed. */
  pairwise?: { winner: "current" | "previous" | "tie"; margin: number };
  rubricVersion?: string;
  judgeModels?: string[];
  error?: string;
};

/**
 * Run regex scan + formatting check + multi-judge LLM rubric + pairwise
 * specificity for one archived dispatch. Persists results on the
 * dispatch_archive row. Idempotent — re-running overwrites. Safe to call
 * fire-and-forget after archiveDispatch (does its own error handling).
 *
 * Engagement signal is NOT computed here — see computeEngagementForDispatch.
 */
export async function evaluateDispatch(id: number): Promise<EvalOutcome> {
  const [row] = await db
    .select()
    .from(dispatchArchiveTable)
    .where(eq(dispatchArchiveTable.id, id))
    .limit(1);
  if (!row) return { ok: false, error: "not_found" };

  // First eval: scan against the current catalogue (static + mined) and
  // persist. Re-eval: preserve the original scan — the runtime gate keeps
  // moving as the miner promotes new phrases, but the row's recorded
  // count must reflect the catalogue active at compose time, otherwise
  // historical composite trends silently re-score against newer rules.
  // To force a fresh scan (e.g. after a catalogue cleanup), clear
  // eval_banned_phrases / eval_banned_phrases_count on the row manually.
  const scan = readPersistedBannedPhrases(row) ?? scanForBannedPhrases(row);
  const formatting = evaluateFormatting(row);
  const formattingScore = formattingScoreFrom(formatting);

  const client = getClient();
  if (!client) {
    // No LLM key — persist the deterministic tracks and bail. This is the
    // same fallback path as the legacy code: regex + formatting are the
    // most actionable signals and never cost anything.
    await db
      .update(dispatchArchiveTable)
      .set({
        evalBannedPhrasesCount: scan.violationCount,
        evalBannedPhrases: scan.hits,
        evalFormatting: formatting,
        evalFormattingScore: formattingScore.toFixed(2),
        evalRunAt: new Date(),
        evalRubricVersion: RUBRIC_VERSION,
      })
      .where(eq(dispatchArchiveTable.id, id));
    return {
      ok: false,
      bannedCount: scan.violationCount,
      formattingScore,
      formattingIssues: formatting.totalIssues,
      rubricVersion: RUBRIC_VERSION,
      error: "no_api_key",
    };
  }

  const judges = getJudgeRoster();

  // Run the full multi-judge rubric and the pairwise call in parallel.
  // findPreviousDispatch is a 1-row select on an indexed column — cheap
  // and not worth deferring. If there's no previous dispatch (first send
  // ever, or first of a kind), the pairwise just resolves to null.
  const previousPromise = findPreviousDispatch(row);
  const [rubric, previous] = await Promise.all([
    runFullRubric(client, judges, row),
    previousPromise,
  ]);

  let pairwise: DispatchPairwiseSpecificity | null = null;
  if (previous) {
    pairwise = await runPairwiseSpecificity(client, judges, row, previous);
  }

  if (!rubric.ok) {
    // Persist deterministic tracks + pairwise (if it succeeded) even if the
    // rubric failed wholesale. Don't poison evalScores with a partial run.
    await db
      .update(dispatchArchiveTable)
      .set({
        evalBannedPhrasesCount: scan.violationCount,
        evalBannedPhrases: scan.hits,
        evalFormatting: formatting,
        evalFormattingScore: formattingScore.toFixed(2),
        evalPairwise: pairwise,
        evalRubricVersion: RUBRIC_VERSION,
        evalRunAt: new Date(),
      })
      .where(eq(dispatchArchiveTable.id, id));
    logger.warn({ id, error: rubric.error }, "Dispatch eval: rubric failed");
    return {
      ok: false,
      bannedCount: scan.violationCount,
      formattingScore,
      formattingIssues: formatting.totalIssues,
      rubricVersion: RUBRIC_VERSION,
      ...(pairwise ? { pairwise: { winner: pairwise.winner, margin: pairwise.margin } } : {}),
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
      // evalModel keeps a flat back-compat string ("|"-joined) for old UI
      // code that reads it as a single value. The structured list lives in
      // evalJudgeModels.
      evalModel: rubric.judgeModels.join("|"),
      evalJudgeModels: rubric.judgeModels,
      evalRubricVersion: RUBRIC_VERSION,
      evalPairwise: pairwise,
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
      judges: rubric.judgeModels,
      pairwise: pairwise ? { winner: pairwise.winner, margin: pairwise.margin, vs: pairwise.comparedToId } : null,
      rubricVersion: RUBRIC_VERSION,
    },
    "Dispatch eval: complete",
  );

  // Closed-loop hooks. Mining tries to extract recurring n-grams from
  // the worstItems quotes we just persisted, and the best-examples cache
  // gets invalidated so the next compose pulls fresh exemplars that
  // include this row when its composite warrants. Both are fire-and-
  // forget — eval already returned its scores before this runs.
  minePhraseProposalsInBackground();
  invalidateBestExamplesCache();
  return {
    ok: true,
    composite,
    bannedCount: scan.violationCount,
    formattingScore,
    formattingIssues: formatting.totalIssues,
    rubricVersion: RUBRIC_VERSION,
    judgeModels: rubric.judgeModels,
    ...(pairwise ? { pairwise: { winner: pairwise.winner, margin: pairwise.margin } } : {}),
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

// --- Engagement signal ----------------------------------------------------
//
// The only engagement data the schema currently captures is
// `subscribers.unsubscribed_at`. There's no open or click tracking, so the
// honest "did this dispatch land" signal is "how many recipients unsubbed
// in the N hours after we sent it." Computed lazily by a periodic tick:
//
//   * Runs at most once per row (idempotent via evalEngagementRunAt).
//   * Skips rows under the window (createdAt > now - 24h) — the value would
//     be incomplete.
//   * Divides by recipientCount when available; otherwise stores the raw
//     count but leaves rate NULL.

const ENGAGEMENT_WINDOW_HOURS = 24;

export type EngagementOutcome = {
  ok: boolean;
  unsubs?: number;
  rate?: number | null;
  reason?: "too_recent" | "not_found" | "no_recipients" | "computed";
};

export async function computeEngagementForDispatch(
  id: number,
): Promise<EngagementOutcome> {
  const [row] = await db
    .select({
      id: dispatchArchiveTable.id,
      createdAt: dispatchArchiveTable.createdAt,
      recipientCount: dispatchArchiveTable.recipientCount,
    })
    .from(dispatchArchiveTable)
    .where(eq(dispatchArchiveTable.id, id))
    .limit(1);
  if (!row) return { ok: false, reason: "not_found" };

  const windowEnd = new Date(row.createdAt.getTime() + ENGAGEMENT_WINDOW_HOURS * 3_600_000);
  if (windowEnd.getTime() > Date.now()) {
    // Window hasn't closed yet — refuse to write a partial value.
    return { ok: false, reason: "too_recent" };
  }

  // Only count subscribers who existed at send time. Without the
  // createdAt filter, a user who signs up AFTER the dispatch and
  // unsubscribes within the 24h window would inflate the numerator
  // against a denominator (recipientCount) that never included them.
  // Two overlapping dispatch windows would also double-count the same
  // new-signup-then-unsub event against both rows.
  const [row0] = await db
    .select({ unsubs: sql<number>`count(*)::int` })
    .from(subscribersTable)
    .where(
      and(
        isNotNull(subscribersTable.unsubscribedAt),
        gte(subscribersTable.unsubscribedAt, row.createdAt),
        lte(subscribersTable.unsubscribedAt, windowEnd),
        lt(subscribersTable.createdAt, row.createdAt),
      ),
    );
  const unsubs = row0?.unsubs ?? 0;

  const recipients = row.recipientCount ?? 0;
  const rate = recipients > 0 ? unsubs / recipients : null;

  await db
    .update(dispatchArchiveTable)
    .set({
      evalUnsubs24h: unsubs,
      evalUnsubRate24h: rate === null ? null : rate.toFixed(4),
      evalEngagementRunAt: new Date(),
    })
    .where(eq(dispatchArchiveTable.id, id));

  return {
    ok: true,
    unsubs,
    rate,
    reason: recipients > 0 ? "computed" : "no_recipients",
  };
}

/** Find dispatches that have closed their 24h window but haven't had the
 *  engagement signal computed yet, and run it for them. Called by the
 *  scheduler tick below. */
async function backfillEngagementSignals(limit = 20): Promise<number> {
  const cutoff = new Date(Date.now() - ENGAGEMENT_WINDOW_HOURS * 3_600_000);
  const rows = await db
    .select({ id: dispatchArchiveTable.id })
    .from(dispatchArchiveTable)
    .where(
      and(
        isNull(dispatchArchiveTable.evalEngagementRunAt),
        lt(dispatchArchiveTable.createdAt, cutoff),
      ),
    )
    .orderBy(desc(dispatchArchiveTable.createdAt))
    .limit(limit);
  let done = 0;
  for (const r of rows) {
    try {
      const result = await computeEngagementForDispatch(r.id);
      if (result.ok) done++;
    } catch (err) {
      logger.warn(
        { id: r.id, err: err instanceof Error ? err.message : String(err) },
        "Dispatch engagement: backfill iteration failed",
      );
    }
  }
  return done;
}

let engagementTimer: NodeJS.Timeout | null = null;

/** Start the periodic engagement backfill tick. Hourly is plenty — the
 *  signal only changes when a dispatch crosses the 24h mark, and we have
 *  at most a couple of dispatches per week. */
export function startDispatchEngagementScheduler(intervalMs = 3_600_000): void {
  if (engagementTimer) return;
  const tick = async (): Promise<void> => {
    try {
      const count = await backfillEngagementSignals();
      if (count > 0) {
        logger.info({ count }, "Dispatch engagement: backfilled");
      }
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "Dispatch engagement: tick failed",
      );
    }
  };
  // Run once on boot, then on interval.
  void tick();
  engagementTimer = setInterval(() => void tick(), intervalMs);
}

export function stopDispatchEngagementScheduler(): void {
  if (engagementTimer) {
    clearInterval(engagementTimer);
    engagementTimer = null;
  }
}

/**
 * Idempotent self-heal — adds the eval columns if a prod DB predates the
 * migration. Safe to call on every boot. Mirrors migrations/0004 + 0007 + 0008.
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
  // Rubric v2 + pairwise + engagement (migrations/0008).
  await db.execute(sql`ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_rubric_version TEXT`);
  await db.execute(sql`ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_judge_models JSONB`);
  await db.execute(sql`ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_pairwise JSONB`);
  await db.execute(sql`ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_unsubs_24h INTEGER`);
  await db.execute(sql`ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_unsub_rate_24h NUMERIC(6, 4)`);
  await db.execute(sql`ALTER TABLE dispatch_archive ADD COLUMN IF NOT EXISTS eval_engagement_run_at TIMESTAMPTZ`);
  // CONCURRENTLY so a fresh boot that finds the index missing (e.g. a
  // crashed migration) doesn't ACCESS-EXCLUSIVE-lock the table that fronts
  // the public archive page. db.execute runs each statement on its own
  // connection without a wrapping transaction, so CONCURRENTLY is valid
  // here even though it would be rejected inside db.transaction(...).
  await db.execute(sql`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS dispatch_archive_eval_engagement_run_at_idx
      ON dispatch_archive (eval_engagement_run_at)
  `);
  // Closed-loop phrase-mining table (migrations/0009). Schema lives in
  // its own module but the eval pipeline is the natural owner of "make
  // sure the eval-related tables exist before the first eval runs."
  await ensureDispatchPhraseProposalsSchema();
}

/** Exposed for tests / admin so the current rubric version can be displayed
 *  alongside historical rows. */
export const CURRENT_RUBRIC_VERSION = RUBRIC_VERSION;
