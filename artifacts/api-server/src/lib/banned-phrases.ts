// Shared banned-phrase catalogue. Used as both a pre-publish gate (writer
// agent draft validation, commentator output filter) and a post-publish
// regression-eval metric. One source of truth so the eval can never flag
// something the generators are allowed to ship.
//
// Two severity tiers:
//   "violation" — specific sentence shapes / LLM-tic phrases that should
//     never appear. These are gate-worthy: drafts/commentary that hit them
//     get rejected/dropped.
//   "warning"   — bare single-word bans ("increasingly", "transformative",
//     "leverages", etc) that catch both legitimate and synthetic uses.
//     Tracked + displayed but NOT treated as failures by the gates, so
//     incidental uses don't blow up the pipeline.
//
// Dynamic patterns: the eval-mining loop (dispatch-phrase-mining.ts)
// writes auto-mined n-grams from worstItems quotes into
// dispatch_phrase_proposals. Those rows are merged with the static list
// at runtime via a process-local cache that reloads on a 5 min interval
// and on demand after each mining run. The cache must be hydrated
// asynchronously (loadDynamicBannedPatterns) before the sync gates have
// the full picture; on boot the cache is empty and the gates fall back
// to the static list only, which is safe.

import { logger } from "./logger";
import { db, dispatchPhraseProposalsTable } from "@workspace/db";
import { isNull } from "drizzle-orm";

export type Severity = "violation" | "warning";
export type Pattern = { phrase: string; re: RegExp; severity: Severity };

export const BANNED_PATTERNS: Pattern[] = [
  // Intro shapes that kept leaking — VIOLATIONS
  { phrase: "increasingly reevaluating", re: /\bincreasingly\s+reevaluating\b/i, severity: "violation" },
  { phrase: "present(s) a picture", re: /\bpresents?\s+a\s+picture\b/i, severity: "violation" },
  { phrase: "paints a picture", re: /\bpaints\s+a\s+picture\b/i, severity: "violation" },
  { phrase: "landscape of", re: /\b(?:the\s+)?landscape\s+of\b/i, severity: "violation" },
  { phrase: "growing response", re: /\bgrowing\s+response\b/i, severity: "violation" },
  { phrase: "integration efforts", re: /\bintegration\s+efforts\b/i, severity: "violation" },
  { phrase: "this technology", re: /\bthis\s+technology\b/i, severity: "violation" },
  // Generic "this [noun]" references that signal summary mode — VIOLATIONS
  { phrase: "this development", re: /\bthis\s+development\b/i, severity: "violation" },
  { phrase: "this initiative", re: /\bthis\s+initiative\b/i, severity: "violation" },
  { phrase: "this approach", re: /\bthis\s+approach\b/i, severity: "violation" },
  { phrase: "this expansion", re: /\bthis\s+expansion\b/i, severity: "violation" },
  { phrase: "this acquisition", re: /\bthis\s+acquisition\b/i, severity: "violation" },
  { phrase: "this move", re: /\bthis\s+(?:potential\s+)?move\b/i, severity: "violation" },
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
  // Generic product/expansion fluff — VIOLATIONS
  { phrase: "bolster their product offerings", re: /\bbolster\s+(?:their|its)\s+product\s+offerings?\b/i, severity: "violation" },
  { phrase: "stronger foothold", re: /\bstronger\s+foothold\b/i, severity: "violation" },
  { phrase: "tech giant", re: /\btech\s+giants?\b/i, severity: "violation" },
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
  // synthetic uses, so they shouldn't drive gates or violation counts.
  { phrase: "underscores", re: /\bunderscores?\b/i, severity: "warning" },
  { phrase: "thereby", re: /\bthereby\b/i, severity: "warning" },
  { phrase: "leverages", re: /\bleverag(?:e|es|ed|ing)\b/i, severity: "warning" },
  { phrase: "formidable", re: /\bformidable\b/i, severity: "warning" },
  { phrase: "swiftly", re: /\bswiftly\b/i, severity: "warning" },
  { phrase: "transformative", re: /\btransformative\b/i, severity: "warning" },
  { phrase: "increasingly (bare)", re: /\bincreasingly\b/i, severity: "warning" },
];

// Process-local cache of patterns mined from prior dispatch evals. Hydrated
// by loadDynamicBannedPatterns on boot and reloaded periodically (or on
// demand after a mining run). Empty until the first successful load; the
// gates degrade gracefully to static-only when empty.
let dynamicPatternsCache: Pattern[] = [];
let lastDynamicReloadAt = 0;
const DYNAMIC_RELOAD_INTERVAL_MS = 5 * 60_000;

/** Snapshot of the patterns the runtime gate currently checks against.
 *  Static catalogue plus any mined proposals not flagged as dismissed.
 *  Returned as a new array so callers can iterate without worrying
 *  about cache mutation during reload. */
export function getAllBannedPatterns(): Pattern[] {
  return BANNED_PATTERNS.concat(dynamicPatternsCache);
}

/** Force a reload of the dynamic-patterns cache. Called by
 *  dispatch-phrase-mining after each mining run so the next compose
 *  sees the new patterns without waiting for the periodic refresh. */
export async function reloadDynamicBannedPatterns(): Promise<void> {
  try {
    const rows = await db
      .select({
        phrase: dispatchPhraseProposalsTable.phrase,
        regexSource: dispatchPhraseProposalsTable.regexSource,
        severity: dispatchPhraseProposalsTable.severity,
      })
      .from(dispatchPhraseProposalsTable)
      .where(isNull(dispatchPhraseProposalsTable.dismissedAt));
    const next: Pattern[] = [];
    for (const r of rows) {
      const sev = r.severity === "violation" ? "violation" : "warning";
      try {
        next.push({
          phrase: r.phrase,
          re: new RegExp(r.regexSource, "i"),
          severity: sev,
        });
      } catch (err) {
        logger.warn(
          { phrase: r.phrase, regexSource: r.regexSource, err: String(err) },
          "Banned phrases: skipping invalid dynamic pattern",
        );
      }
    }
    dynamicPatternsCache = next;
    lastDynamicReloadAt = Date.now();
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Banned phrases: dynamic reload failed (keeping previous cache)",
    );
  }
}

/** Hydrate the cache if it hasn't been loaded recently. Cheap no-op if
 *  the previous reload was within the interval. */
export async function loadDynamicBannedPatterns(force = false): Promise<void> {
  if (!force && Date.now() - lastDynamicReloadAt < DYNAMIC_RELOAD_INTERVAL_MS && lastDynamicReloadAt > 0) {
    return;
  }
  await reloadDynamicBannedPatterns();
}

/** Start a periodic reload. The eval-mining path also calls
 *  reloadDynamicBannedPatterns directly after each run for liveness; the
 *  interval is the safety net for processes that didn't run mining
 *  themselves. */
let dynamicReloadTimer: NodeJS.Timeout | null = null;
export function startDynamicBannedPatternsReload(intervalMs = DYNAMIC_RELOAD_INTERVAL_MS): void {
  if (dynamicReloadTimer) return;
  // Fire once immediately so first compose after boot has a non-empty
  // dynamic cache when proposals exist.
  void reloadDynamicBannedPatterns();
  dynamicReloadTimer = setInterval(() => {
    void reloadDynamicBannedPatterns();
  }, intervalMs);
}

export function stopDynamicBannedPatternsReload(): void {
  if (dynamicReloadTimer) {
    clearInterval(dynamicReloadTimer);
    dynamicReloadTimer = null;
  }
}

/**
 * Find the first severity="violation" pattern matching `text`. Returns the
 * matched pattern + the regex match (so callers can extract the offending
 * sentence). Returns null when clean. Reads from the merged static +
 * dynamic catalogue so auto-mined violations gate the writer/commentator
 * the same way hand-coded ones do.
 */
export function findFirstViolation(text: string): { pattern: Pattern; match: RegExpExecArray } | null {
  for (const pat of getAllBannedPatterns()) {
    if (pat.severity !== "violation") continue;
    const re = new RegExp(pat.re.source, pat.re.flags.replace("g", ""));
    const m = re.exec(text);
    if (m) return { pattern: pat, match: m };
  }
  return null;
}

/**
 * Drop sentences containing any severity="violation" banned phrase
 * (static or dynamically mined). Used to sanitize input commentary
 * before it's pasted back into an LLM polish prompt — without this, the
 * model sycophantically mirrors the banned phrasing from previous-pass
 * commentary into the supposedly-cleaned output. Sentence-level
 * granularity preserves usable context while removing the offending
 * clause. Returns empty string if every sentence violates.
 */
export function stripViolationSentences(text: string): string {
  if (!text) return text;
  // Split on sentence-terminator + whitespace boundary. The lookahead admits
  // the common openers we've seen lead a new sentence after a banned one:
  // capital letters, opening parens, ASCII/typographic quotes, currency
  // symbols, digits, and em/en dashes. Without this, a banned sentence
  // followed by `"It's a milestone," said the CEO.` or `$3.5B in revenue`
  // wouldn't split — the join would either over-strip both or smuggle the
  // violation through depending on which side findFirstViolation matches.
  const parts = text.split(/(?<=[.!?])\s+(?=["'“‘$(\d—–]|[A-Z])/);
  const kept: string[] = [];
  for (const raw of parts) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (findFirstViolation(trimmed)) continue;
    kept.push(trimmed);
  }
  return kept.join(" ").trim();
}
