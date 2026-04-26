export type SourceKind =
  | "rss"
  | "hn"
  | "hf-papers"
  | "anthropic-news"
  | "mistral-news"
  | "epoch-blog";

export type SourceConfig = {
  id: string;
  displayName: string;
  category: string;
  kind: SourceKind;
  url: string;
  enabled: boolean;
};

// URLs can be overridden via env vars. Anthropic and Mistral don't publish
// stable RSS, so they use custom scrapers (Anthropic = HTML listing, Mistral
// = sitemap + per-article SSR titles). Meta AI and xAI are intentionally
// omitted: ai.meta.com returns 400 and x.ai returns 403 even with a real
// browser UA — they actively block server-to-server scrapers and would
// silently return zero items.
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
  },
  {
    id: "huggingface",
    displayName: "Hugging Face",
    category: "Models",
    kind: "hf-papers",
    url: process.env["HF_PAPERS_URL"] ?? "https://huggingface.co/api/daily_papers",
    enabled: true,
  },
  {
    id: "arxiv",
    displayName: "arXiv cs.AI",
    category: "Research",
    kind: "rss",
    url: process.env["ARXIV_FEED_URL"] ?? "https://rss.arxiv.org/rss/cs.AI",
    enabled: true,
  },
  {
    id: "anthropic",
    displayName: "Anthropic",
    category: "Lab",
    kind: "anthropic-news",
    url: process.env["ANTHROPIC_FEED_URL"] ?? "https://www.anthropic.com/news",
    enabled: true,
  },
  {
    id: "openai",
    displayName: "OpenAI",
    category: "Lab",
    kind: "rss",
    url: process.env["OPENAI_FEED_URL"] ?? "https://openai.com/news/rss.xml",
    enabled: true,
  },
  {
    id: "google",
    displayName: "Google",
    category: "Lab",
    kind: "rss",
    url: process.env["GOOGLE_AI_FEED_URL"] ?? "https://blog.google/technology/ai/rss/",
    enabled: true,
  },
  {
    id: "deepmind",
    displayName: "Google DeepMind",
    category: "Lab",
    kind: "rss",
    url: process.env["DEEPMIND_FEED_URL"] ?? "https://deepmind.google/blog/rss.xml",
    enabled: true,
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
  },
  {
    id: "mistral",
    displayName: "Mistral",
    category: "Lab",
    kind: "mistral-news",
    url: process.env["MISTRAL_FEED_URL"] ?? "https://mistral.ai/sitemap.xml",
    enabled: true,
  },
  {
    id: "nvidia",
    displayName: "NVIDIA",
    category: "Infra",
    kind: "rss",
    url: process.env["NVIDIA_FEED_URL"] ?? "https://blogs.nvidia.com/feed/",
    enabled: true,
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
  },
  {
    id: "import-ai",
    displayName: "Import AI",
    category: "Newsletter",
    kind: "rss",
    url: process.env["IMPORT_AI_FEED_URL"] ?? "https://importai.substack.com/feed",
    enabled: true,
  },
  {
    id: "latent-space",
    displayName: "Latent Space",
    category: "Newsletter",
    kind: "rss",
    url: process.env["LATENT_SPACE_FEED_URL"] ?? "https://www.latent.space/feed",
    enabled: true,
  },
  {
    id: "metr",
    displayName: "METR",
    category: "Evals",
    kind: "rss",
    url: process.env["METR_FEED_URL"] ?? "https://metr.org/feed.xml",
    enabled: true,
  },
  {
    id: "lmarena",
    displayName: "LMArena",
    category: "Evals",
    kind: "rss",
    url: process.env["LMARENA_FEED_URL"] ?? "https://blog.lmarena.ai/feed",
    enabled: true,
  },
  {
    id: "epoch",
    displayName: "Epoch AI",
    category: "Evals",
    kind: "epoch-blog",
    url: process.env["EPOCH_FEED_URL"] ?? "https://epoch.ai/blog",
    enabled: true,
  },
];
