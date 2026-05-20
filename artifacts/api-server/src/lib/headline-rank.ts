// Shared ranking helpers for the "top" headline view and the writer agent's
// corpus. Two problems they both face:
//   1) Cross-source duplication — Anthropic releases X, then Bloomberg covers
//      the same release. Per-source caps don't catch this; we need title-token
//      similarity across the candidate pool.
//   2) Academic papers (HF Papers) get crowded out by the tier-1 labs when
//      the labs publish frequently — a top-10 with zero research items isn't
//      representative of the AI week. We reserve a minimum slot count and
//      swap in the top-scored papers if natural ranking doesn't include them.

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

// Entity → org map used by the co-mention fallback. Title-token Jaccard
// underfits cross-source coverage where the press outlet uses different
// framing words than the original announcement — e.g. Anthropic's "Higher
// usage limits for Claude and a compute deal with SpaceX" vs Latent Space's
// "Anthropic-SpaceXai's 300MW/$5B/yr deal for Colossus I" share almost no
// title tokens but are obviously the same news. The fallback flags items
// that mention 2+ proper-noun-ish brand tokens spanning DIFFERENT orgs.
//
// Two same-org tokens (e.g. openai + chatgpt + gpt) appear across too many
// distinct stories to discriminate, so we group tokens by org and dedupe by
// distinct-org count. Two cross-org tokens (anthropic + spacex, openai +
// musk, deepmind + nvidia, etc.) are very rarely incidental in a headline.
//
// Searches title + URL + source. URL inclusion catches cases like Axios's
// "How Elon grew to love Anthropic" where the slug
// (musk-anthropic-compute-spacex-ai) is more entity-rich than the title.
const ENTITY_TO_ORG: ReadonlyArray<{ regex: RegExp; org: string }> = [
  { regex: /\banthropic\b/i, org: "anthropic" },
  { regex: /\bclaude\b/i, org: "anthropic" },
  { regex: /\bamodei\b/i, org: "anthropic" },
  { regex: /\bopenai\b/i, org: "openai" },
  { regex: /\bchatgpt\b/i, org: "openai" },
  { regex: /\bgpt\b/i, org: "openai" },
  { regex: /\bcodex\b/i, org: "openai" },
  { regex: /\baltman\b/i, org: "openai" },
  { regex: /\bgoogle\b/i, org: "google" },
  { regex: /\bdeepmind\b/i, org: "google" },
  { regex: /\bgemini\b/i, org: "google" },
  { regex: /\bpichai\b/i, org: "google" },
  { regex: /\bdeepseek\b/i, org: "deepseek" },
  { regex: /\bmistral\b/i, org: "mistral" },
  { regex: /\bmoonshot\b/i, org: "moonshot" },
  { regex: /\bkimi\b/i, org: "moonshot" },
  { regex: /\bxai\b/i, org: "xai" },
  { regex: /\bgrok\b/i, org: "xai" },
  { regex: /\bllama\b/i, org: "meta" },
  { regex: /\bmicrosoft\b/i, org: "microsoft" },
  { regex: /\bcopilot\b/i, org: "microsoft" },
  { regex: /\bnadella\b/i, org: "microsoft" },
  { regex: /\bamazon\b/i, org: "amazon" },
  { regex: /\baws\b/i, org: "amazon" },
  { regex: /\bbedrock\b/i, org: "amazon" },
  { regex: /\bapple\b/i, org: "apple" },
  { regex: /\bnvidia\b/i, org: "nvidia" },
  { regex: /\bblackwell\b/i, org: "nvidia" },
  { regex: /\bhuang\b/i, org: "nvidia" },
  { regex: /\btesla\b/i, org: "tesla" },
  { regex: /\bspacex(?:ai)?\b/i, org: "spacex" },
  { regex: /\bmusk\b/i, org: "musk" },
  // Chip / hardware peers that frequently lead AI earnings + supply-chain
  // coverage. Not tied to ENTITY_TO_ORG's "tier-1 lab" semantics elsewhere,
  // but useful as anchors for the broad-press structural filter so e.g.
  // Bloomberg's "AMD Rallies After AI Demand Fuels Blockbuster Forecast"
  // qualifies as a real story while "AI Boom Drives Earnings Growth"
  // (zero entities) does not.
  { regex: /\bamd\b/i, org: "amd" },
  { regex: /\bintel\b/i, org: "intel" },
  { regex: /\btsmc\b/i, org: "tsmc" },
  { regex: /\barm\b/i, org: "arm" },
  { regex: /\bsamsung\b/i, org: "samsung" },
  { regex: /\bbroadcom\b/i, org: "broadcom" },
  { regex: /\boracle\b/i, org: "oracle" },
  { regex: /\bsalesforce\b/i, org: "salesforce" },
  { regex: /\bservicenow\b/i, org: "servicenow" },
  { regex: /\bsap\b/i, org: "sap" },
  { regex: /\bibm\b/i, org: "ibm" },
  { regex: /\bsnowflake\b/i, org: "snowflake" },
  { regex: /\bpalantir\b/i, org: "palantir" },
  { regex: /\bdatabricks\b/i, org: "databricks" },
  { regex: /\bperplexity\b/i, org: "perplexity" },
  { regex: /\bcohere\b/i, org: "cohere" },
  { regex: /\bcerebras\b/i, org: "cerebras" },
  { regex: /\bgroq\b/i, org: "groq" },
  { regex: /\bhugging\s*face\b/i, org: "huggingface" },
  { regex: /\buber\b/i, org: "uber" },
];

const ORG_COMENTION_MIN = 2;

/**
 * Extract the set of named-entity "orgs" present in an item's title + URL
 * + source. Exported because the broad-press structural filter in the
 * headlines route reuses the same vocabulary that backs the dedupe co-
 * mention rule — keeping them in sync prevents drift between "what counts
 * as a story anchor" and "what merges as a near-duplicate cluster."
 */
export function extractOrgs(item: {
  title: string;
  url?: string;
  source?: string;
}): Set<string> {
  const haystack = [item.title, item.url ?? "", item.source ?? ""].join(" ");
  const orgs = new Set<string>();
  for (const { regex, org } of ENTITY_TO_ORG) {
    if (regex.test(haystack)) orgs.add(org);
  }
  return orgs;
}

// Sources whose announcements are the canonical/originating record for AI
// news. When a near-duplicate cluster spans a tier-1 lab and lower-tier
// press coverage, the lab's own post wins cluster representation — even if
// the press item scored higher on recency. Mirrors the tier=1 entries in
// headline-sources.ts; kept hard-coded here so the dedupe lib doesn't take
// a runtime dep on the full SOURCES table.
const TIER1_LAB_SOURCES: ReadonlySet<string> = new Set([
  "Anthropic",
  "OpenAI",
  "Google DeepMind",
  "DeepSeek",
  "METR",
]);

/**
 * Walks the candidates in input order (caller passes them already sorted by
 * score, descending), keeping one representative per near-duplicate cluster.
 *
 * Cluster membership: title-token Jaccard ≥ `threshold` (primary), OR ≥ 2
 * shared distinct-org entity tokens (fallback for cross-source coverage
 * with low title overlap — see ENTITY_TO_ORG).
 *
 * Cluster representative: first item kept by default (highest-scored due to
 * caller's sort), but a tier-1 lab item that joins the cluster afterward
 * swaps in as representative — so e.g. Anthropic's own announcement wins
 * over Bloomberg's coverage of it even when Bloomberg posted later and
 * scored higher on recency.
 *
 * Returns a new array; does not mutate the input.
 */
export function dedupeNearDuplicates<
  T extends { title: string; url?: string; source?: string },
>(items: T[], threshold: number = DEFAULT_DEDUP_THRESHOLD): T[] {
  const kept: T[] = [];
  const keptTokens: Set<string>[] = [];
  const keptOrgs: Set<string>[] = [];

  for (const item of items) {
    const tokens = tokenizeTitle(item.title);
    const orgs = extractOrgs(item);

    let dupIdx = -1;
    for (let i = 0; i < kept.length; i++) {
      const prevTokens = keptTokens[i]!;
      const prevOrgs = keptOrgs[i]!;

      if (tokens.size > 0 && prevTokens.size > 0) {
        let inter = 0;
        for (const t of tokens) if (prevTokens.has(t)) inter++;
        const union = tokens.size + prevTokens.size - inter;
        const j = union === 0 ? 0 : inter / union;
        if (j >= threshold) {
          dupIdx = i;
          break;
        }
      }

      if (orgs.size >= ORG_COMENTION_MIN && prevOrgs.size >= ORG_COMENTION_MIN) {
        let inter = 0;
        for (const o of orgs) if (prevOrgs.has(o)) inter++;
        if (inter >= ORG_COMENTION_MIN) {
          dupIdx = i;
          break;
        }
      }
    }

    if (dupIdx === -1) {
      kept.push(item);
      keptTokens.push(tokens);
      keptOrgs.push(orgs);
      continue;
    }

    const isTier1 = item.source !== undefined && TIER1_LAB_SOURCES.has(item.source);
    const prevIsTier1 =
      kept[dupIdx]!.source !== undefined &&
      TIER1_LAB_SOURCES.has(kept[dupIdx]!.source!);
    if (isTier1 && !prevIsTier1) {
      kept[dupIdx] = item;
      keptTokens[dupIdx] = tokens;
      keptOrgs[dupIdx] = orgs;
    }
  }

  return kept;
}

// Sources that publish academic-style research output. The "top" view keeps
// at least N of these in the leading slot count so the feed stays
// representative of the AI week as a whole, not just frontier-lab marketing.
export const PAPER_SOURCES: ReadonlySet<string> = new Set([
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
