export type SourceKind =
  | "rss"
  | "hn"
  | "hf-papers"
  | "anthropic-news"
  | "mistral-news"
  | "epoch-blog"
  | "deepseek-news"
  | "kimi-blog"
  | "earnings-transcripts";

// 1 = top tier (frontier labs, foundational evals — original-source releases
// readers shouldn't miss), 4 = bottom tier (volume press + community).
// Used to weight the homepage "top" view; latest view ignores tier.
export type SourceTier = 1 | 2 | 3 | 4;

export type SourceConfig = {
  id: string;
  displayName: string;
  category: string;
  kind: SourceKind;
  url: string;
  enabled: boolean;
  tier: SourceTier;
};

// URLs can be overridden via env vars. Anthropic and Mistral don't publish
// stable RSS, so they use custom scrapers (Anthropic = HTML listing, Mistral
// = sitemap + per-article SSR titles). Meta AI and xAI are intentionally
// omitted: ai.meta.com returns 400 and x.ai returns 403 even with a real
// browser UA — they actively block server-to-server scrapers and would
// silently return zero items.
//
// `earnings-transcripts` pulls a broad equities RSS (default Seeking Alpha)
// then keeps transcript-style headlines that mention mega-cap tech / AI
// themes so the feed stays on-topic vs the full index.
export const SOURCES: SourceConfig[] = [
  {
    id: "hacker-news",
    displayName: "Hacker News",
    category: "Community",
    kind: "hn",
    url:
      process.env["HN_QUERY_URL"] ??
      "https://hn.algolia.com/api/v1/search_by_date?tags=story&query=AI&hitsPerPage=30",
    enabled: true,
    tier: 4,
  },
  {
    id: "huggingface",
    displayName: "Hugging Face",
    category: "Models",
    kind: "hf-papers",
    url: process.env["HF_PAPERS_URL"] ?? "https://huggingface.co/api/daily_papers",
    enabled: true,
    tier: 2,
  },
  {
    id: "arxiv",
    displayName: "arXiv cs.AI",
    category: "Research",
    kind: "rss",
    url: process.env["ARXIV_FEED_URL"] ?? "https://rss.arxiv.org/rss/cs.AI",
    enabled: true,
    tier: 2,
  },
  {
    id: "anthropic",
    displayName: "Anthropic",
    category: "Lab",
    kind: "anthropic-news",
    url: process.env["ANTHROPIC_FEED_URL"] ?? "https://www.anthropic.com/news",
    enabled: true,
    tier: 1,
  },
  {
    id: "openai",
    displayName: "OpenAI",
    category: "Lab",
    kind: "rss",
    url: process.env["OPENAI_FEED_URL"] ?? "https://openai.com/news/rss.xml",
    enabled: true,
    tier: 1,
  },
  {
    id: "google",
    displayName: "Google",
    category: "Lab",
    kind: "rss",
    url: process.env["GOOGLE_AI_FEED_URL"] ?? "https://blog.google/technology/ai/rss/",
    enabled: true,
    tier: 2,
  },
  {
    id: "deepmind",
    displayName: "Google DeepMind",
    category: "Lab",
    kind: "rss",
    url: process.env["DEEPMIND_FEED_URL"] ?? "https://deepmind.google/blog/rss.xml",
    enabled: true,
    tier: 1,
  },
  {
    id: "microsoft",
    displayName: "Microsoft AI",
    category: "Lab",
    kind: "rss",
    url:
      process.env["MICROSOFT_AI_FEED_URL"] ??
      "https://news.microsoft.com/source/topics/ai/feed/",
    enabled: true,
    tier: 2,
  },
  {
    id: "mistral",
    displayName: "Mistral",
    category: "Lab",
    kind: "mistral-news",
    url: process.env["MISTRAL_FEED_URL"] ?? "https://mistral.ai/sitemap.xml",
    enabled: true,
    tier: 2,
  },
  {
    id: "deepseek",
    displayName: "DeepSeek",
    category: "Lab",
    kind: "deepseek-news",
    url: process.env["DEEPSEEK_FEED_URL"] ?? "https://api-docs.deepseek.com/sitemap.xml",
    enabled: true,
    tier: 1,
  },
  {
    id: "moonshot",
    displayName: "Moonshot (Kimi)",
    category: "Lab",
    kind: "kimi-blog",
    url: process.env["MOONSHOT_FEED_URL"] ?? "https://www.kimi.com/blog/",
    enabled: true,
    tier: 2,
  },
  {
    id: "nvidia",
    displayName: "NVIDIA",
    category: "Infra",
    kind: "rss",
    url: process.env["NVIDIA_FEED_URL"] ?? "https://blogs.nvidia.com/feed/",
    enabled: true,
    tier: 3,
  },
  {
    id: "amazon",
    displayName: "Amazon",
    category: "Cloud",
    kind: "rss",
    url:
      process.env["AWS_ML_FEED_URL"] ??
      "https://aws.amazon.com/blogs/machine-learning/feed/",
    enabled: true,
    tier: 3,
  },
  {
    id: "techcrunch-ai",
    displayName: "TechCrunch AI",
    category: "Press",
    kind: "rss",
    url:
      process.env["TECHCRUNCH_AI_FEED_URL"] ??
      "https://techcrunch.com/category/artificial-intelligence/feed/",
    enabled: true,
    tier: 4,
  },
  {
    id: "verge-ai",
    displayName: "The Verge AI",
    category: "Press",
    kind: "rss",
    url:
      process.env["VERGE_AI_FEED_URL"] ??
      "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    enabled: true,
    tier: 4,
  },
  {
    id: "import-ai",
    displayName: "Import AI",
    category: "Newsletter",
    kind: "rss",
    url: process.env["IMPORT_AI_FEED_URL"] ?? "https://importai.substack.com/feed",
    enabled: true,
    tier: 3,
  },
  {
    id: "latent-space",
    displayName: "Latent Space",
    category: "Newsletter",
    kind: "rss",
    url: process.env["LATENT_SPACE_FEED_URL"] ?? "https://www.latent.space/feed",
    enabled: true,
    tier: 3,
  },
  {
    id: "metr",
    displayName: "METR",
    category: "Evals",
    kind: "rss",
    url: process.env["METR_FEED_URL"] ?? "https://metr.org/feed.xml",
    enabled: true,
    tier: 1,
  },
  {
    id: "lmarena",
    displayName: "LMArena",
    category: "Evals",
    kind: "rss",
    url: process.env["LMARENA_FEED_URL"] ?? "https://blog.lmarena.ai/feed",
    enabled: true,
    tier: 2,
  },
  {
    id: "epoch",
    displayName: "Epoch AI",
    category: "Evals",
    kind: "epoch-blog",
    url: process.env["EPOCH_FEED_URL"] ?? "https://epoch.ai/blog",
    enabled: true,
    tier: 2,
  },
  {
    id: "earnings-transcripts",
    displayName: "Earnings transcripts",
    category: "Markets",
    kind: "earnings-transcripts",
    url:
      process.env["EARNINGS_TRANSCRIPTS_RSS_URL"] ??
      "https://seekingalpha.com/feed.xml",
    enabled: true,
    tier: 4,
  },
  // First-party hardware + product news (chips, Mac/iPhone pricing, retail
  // moves) the AI-only feeds miss. Atom feed; rss-parser handles it.
  {
    id: "apple-newsroom",
    displayName: "Apple Newsroom",
    category: "Hardware",
    kind: "rss",
    url:
      process.env["APPLE_NEWSROOM_FEED_URL"] ??
      "https://www.apple.com/newsroom/rss-feed.rss",
    enabled: true,
    tier: 3,
  },
];

// Display name for the earnings source, used by the dynamic-tier helper so
// the tier promotion can't drift if SOURCES is re-ordered.
export const EARNINGS_TRANSCRIPTS_DISPLAY_NAME = "Earnings transcripts";

// Earnings transcripts are tier 4 on a normal day (low signal vs press), but
// during the mega-cap reporting cluster (Meta/Alphabet/MSFT/AMZN/AAPL all on
// the same week) they become the most consequential thing in the corpus.
// `isEarningsDay` flips them to tier 2 when 3+ transcripts arrive in the
// last 48h so the writer can lead with the cluster instead of being out-
// weighted by lab announcements.
export const EARNINGS_DAY_WINDOW_MS = 48 * 60 * 60 * 1000;
export const EARNINGS_DAY_MIN_ITEMS = 3;
export const EARNINGS_PROMOTED_TIER: SourceTier = 2;

export function isEarningsDay(
  items: Array<{ source: string; publishedAt: Date }>,
): boolean {
  const since = Date.now() - EARNINGS_DAY_WINDOW_MS;
  let count = 0;
  for (const it of items) {
    if (it.source !== EARNINGS_TRANSCRIPTS_DISPLAY_NAME) continue;
    if (it.publishedAt.getTime() < since) continue;
    count++;
    if (count >= EARNINGS_DAY_MIN_ITEMS) return true;
  }
  return false;
}
