// Shared ranking helpers for the "top" headline view and the writer agent's
// corpus. Two problems they both face:
//   1) Cross-source duplication — Anthropic releases X, then Bloomberg covers
//      the same release. Per-source caps don't catch this; we need title-token
//      similarity across the candidate pool.
//   2) Academic papers (arXiv, HF Papers) get crowded out by the tier-1 labs
//      when the labs publish frequently — a top-10 with zero research items
//      isn't representative of the AI week. We reserve a minimum slot count
//      and swap in the top-scored papers if natural ranking doesn't include
//      them.

// Common English filler + AI-domain noise that shouldn't drive Jaccard.
// Keep this conservative — too aggressive and "Claude" / "GPT" stop carrying
// signal; we want to match topic words, not strip them.
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "in", "on", "at", "to", "for",
  "with", "by", "from", "as", "into", "onto", "off", "over", "under", "via",
  "is", "are", "was", "were", "be", "been", "being", "has", "have", "had", "do",
  "does", "did", "will", "would", "can", "could", "may", "might", "should",
  "this", "that", "these", "those", "it", "its", "their", "them", "they",
  "we", "us", "our", "you", "your", "he", "she", "his", "her",
  "new", "now", "via", "per", "amid", "after", "before", "while",
]);

export function tokenizeTitle(title: string): Set<string> {
  const tokens = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  return new Set(tokens);
}

export function titleJaccard(a: string, b: string): number {
  const sa = tokenizeTitle(a);
  const sb = tokenizeTitle(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Default similarity threshold. Calibrated against the canonical case
// "Anthropic announces Claude Code 2.0" / "Bloomberg: Anthropic launches
// Claude Code 2.0" → Jaccard ≈ 0.5; threshold 0.45 catches it without
// false-positiving on weakly related titles that happen to share 1–2 entity
// names. Tune via the `threshold` arg if a feed surfaces a counter-example.
export const DEFAULT_DEDUP_THRESHOLD = 0.45;

/**
 * Walks the candidates in input order (caller passes them already sorted by
 * score, descending), keeping the first item from each near-duplicate
 * cluster. Items whose title Jaccard against any already-kept item exceeds
 * `threshold` are dropped.
 *
 * Returns a new array; does not mutate the input.
 */
export function dedupeNearDuplicates<T extends { title: string }>(
  items: T[],
  threshold: number = DEFAULT_DEDUP_THRESHOLD,
): T[] {
  const kept: T[] = [];
  const keptTokens: Set<string>[] = [];
  for (const item of items) {
    const tokens = tokenizeTitle(item.title);
    let dup = false;
    if (tokens.size > 0) {
      for (const prev of keptTokens) {
        if (prev.size === 0) continue;
        let inter = 0;
        for (const t of tokens) if (prev.has(t)) inter++;
        const union = tokens.size + prev.size - inter;
        const j = union === 0 ? 0 : inter / union;
        if (j >= threshold) {
          dup = true;
          break;
        }
      }
    }
    if (!dup) {
      kept.push(item);
      keptTokens.push(tokens);
    }
  }
  return kept;
}

// Sources that publish academic-style research output. The "top" view keeps
// at least N of these in the leading slot count so the feed stays
// representative of the AI week as a whole, not just frontier-lab marketing.
export const PAPER_SOURCES: ReadonlySet<string> = new Set([
  "arXiv cs.AI",
  "Hugging Face",
]);

export function isPaperSource(source: string): boolean {
  return PAPER_SOURCES.has(source);
}

/**
 * Ensures `selected` contains at least `minPapers` items whose source is in
 * PAPER_SOURCES. If it doesn't, pulls the next-best papers from `pool`
 * (already-scored, descending) and swaps them in for the lowest-scored
 * non-paper items already in `selected`.
 *
 * Both `selected` and `pool` should be sorted by score descending. The
 * returned array is NOT re-sorted by score — the caller should re-sort if
 * they need score order in the response.
 */
export function ensurePapersInSelection<T extends { source: string }>(
  selected: T[],
  pool: T[],
  minPapers: number,
): T[] {
  if (minPapers <= 0) return selected.slice();
  const haveCount = selected.filter((r) => isPaperSource(r.source)).length;
  if (haveCount >= minPapers) return selected.slice();

  const selectedSet = new Set(selected);
  const need = minPapers - haveCount;
  const extraPapers: T[] = [];
  for (const candidate of pool) {
    if (extraPapers.length >= need) break;
    if (selectedSet.has(candidate)) continue;
    if (!isPaperSource(candidate.source)) continue;
    extraPapers.push(candidate);
  }
  if (extraPapers.length === 0) return selected.slice();

  // Drop the lowest-scored non-paper items (selected is score-desc, so
  // the trailing non-papers are the lowest). Don't drop more items than
  // we have papers to insert.
  const nonPapers = selected.filter((r) => !isPaperSource(r.source));
  const dropCount = Math.min(extraPapers.length, nonPapers.length);
  const toDrop = new Set(nonPapers.slice(-dropCount));
  const kept = selected.filter((r) => !toDrop.has(r));
  return [...kept, ...extraPapers];
}
