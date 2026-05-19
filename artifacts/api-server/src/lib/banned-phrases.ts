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

/**
 * Find the first severity="violation" pattern matching `text`. Returns the
 * matched pattern + the regex match (so callers can extract the offending
 * sentence). Returns null when clean.
 */
export function findFirstViolation(text: string): { pattern: Pattern; match: RegExpExecArray } | null {
  for (const pat of BANNED_PATTERNS) {
    if (pat.severity !== "violation") continue;
    const re = new RegExp(pat.re.source, pat.re.flags.replace("g", ""));
    const m = re.exec(text);
    if (m) return { pattern: pat, match: m };
  }
  return null;
}
