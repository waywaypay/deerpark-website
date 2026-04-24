export type SourceKind = "rss" | "hn" | "hf-papers";

export type SourceConfig = {
  id: string;
  displayName: string;
  category: string;
  kind: SourceKind;
  url: string;
  enabled: boolean;
};

// URLs can be overridden via env vars. Defaults point at publicly known feeds;
// Anthropic / OpenAI are disabled by default because they do not publish a
// stable public RSS feed at time of writing — enable once you've wired a
// scraper or an alternative source (e.g. a mirror).
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
    id: "anthropic",
    displayName: "Anthropic",
    category: "Lab",
    kind: "rss",
    url: process.env["ANTHROPIC_FEED_URL"] ?? "",
    enabled: Boolean(process.env["ANTHROPIC_FEED_URL"]),
  },
  {
    id: "openai",
    displayName: "OpenAI",
    category: "Lab",
    kind: "rss",
    url: process.env["OPENAI_FEED_URL"] ?? "",
    enabled: Boolean(process.env["OPENAI_FEED_URL"]),
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
];
