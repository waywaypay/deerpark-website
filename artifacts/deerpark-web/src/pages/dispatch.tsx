import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ExternalLink, Rss } from "lucide-react";
import { FadeIn, Footer, Navbar, AssessmentFAB } from "@/components/site-layout";

type CoveredBy = {
  postId: number;
  postTitle: string;
  publishedAt: string;
};

type Headline = {
  source: string;
  category: string;
  title: string;
  publishedAt: string;
  url?: string;
  coveredBy?: CoveredBy | null;
};

const HEADLINE_FALLBACK: Headline[] = [
  { source: "Anthropic", category: "Lab", title: "Updated Claude Code usage guidance for regulated industries", publishedAt: "2026-04-24T13:15:00-04:00" },
  { source: "Hacker News", category: "Community", title: "Show HN: Evaluating long-context retrieval across 1M tokens", publishedAt: "2026-04-24T12:10:00-04:00" },
  { source: "Hugging Face", category: "Models", title: "New leaderboard: function-calling accuracy under latency constraints", publishedAt: "2026-04-24T11:05:00-04:00" },
  { source: "OpenAI", category: "Lab", title: "Platform pricing update and new evals endpoint", publishedAt: "2026-04-24T10:40:00-04:00" },
  { source: "Amazon", category: "Cloud", title: "Bedrock adds two new model providers and a cost explorer", publishedAt: "2026-04-24T09:25:00-04:00" },
  { source: "Hacker News", category: "Community", title: "The state of small open-weight models in April", publishedAt: "2026-04-24T09:10:00-04:00" },
  { source: "Hugging Face", category: "Models", title: "Dataset release: 40k annotated enterprise workflow traces", publishedAt: "2026-04-24T08:12:00-04:00" },
  { source: "Google", category: "Lab", title: "Gemini long-context benchmarks revisited", publishedAt: "2026-04-24T07:30:00-04:00" },
  { source: "NVIDIA", category: "Infra", title: "New inference reference architecture for mid-market deployments", publishedAt: "2026-04-24T06:45:00-04:00" },
  { source: "Hacker News", category: "Community", title: "Ask HN: What did your team stop doing after shipping an AI agent?", publishedAt: "2026-04-24T05:20:00-04:00" },
  { source: "Anthropic", category: "Lab", title: "Responsible scaling policy revisions — April edition", publishedAt: "2026-04-23T14:05:00-04:00" },
  { source: "OpenAI", category: "Lab", title: "Enterprise data retention controls expanded", publishedAt: "2026-04-23T11:40:00-04:00" },
  { source: "Google", category: "Lab", title: "Vertex AI agent builder goes GA in three new regions", publishedAt: "2026-04-23T09:15:00-04:00" },
  { source: "NVIDIA", category: "Infra", title: "NIM microservices update — what changed for on-prem", publishedAt: "2026-04-22T16:30:00-04:00" },
  { source: "Amazon", category: "Cloud", title: "AWS Strands: agent framework moves toward 1.0", publishedAt: "2026-04-22T10:20:00-04:00" },
].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

const HEADLINE_DATE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const HEADLINE_TIME_FMT = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });

function formatRelative(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const mins = Math.max(1, Math.round(diffMs / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

type HeadlineApiItem = {
  id: number;
  source: string;
  category: string;
  title: string;
  url: string;
  publishedAt: string;
  coveredBy?: CoveredBy | null;
};

type HeadlineMode = "top" | "latest";

function useHeadlines(mode: HeadlineMode) {
  return useQuery<Headline[]>({
    queryKey: ["headlines", mode],
    queryFn: async () => {
      const res = await fetch(`/api/headlines?mode=${mode}`);
      if (!res.ok) throw new Error(`Headlines request failed: ${res.status}`);
      const data = (await res.json()) as { items: HeadlineApiItem[] };
      return data.items.map((h) => ({
        source: h.source,
        category: h.category,
        title: h.title,
        publishedAt: h.publishedAt,
        url: h.url,
        coveredBy: h.coveredBy ?? null,
      }));
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
  });
}

const HeadlineFeed = () => {
  const [headlineMode, setHeadlineMode] = useState<HeadlineMode>("top");
  const headlinesQuery = useHeadlines(headlineMode);
  const headlines: Headline[] = headlinesQuery.data && headlinesQuery.data.length > 0
    ? headlinesQuery.data
    : HEADLINE_FALLBACK;
  const lastSync = headlinesQuery.dataUpdatedAt
    ? new Date(headlinesQuery.dataUpdatedAt)
    : null;

  return (
    <section id="headline-feed" className="pt-32 md:pt-40 pb-24 bg-background">
      <div className="max-w-7xl mx-auto px-6">
        <FadeIn>
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <Rss className="w-3.5 h-3.5 text-foreground/60" />
              <span className="section-label">Full feed</span>
            </div>
            <h3 className="text-xl md:text-2xl font-serif leading-snug text-foreground/90">
              {headlineMode === "top"
                ? "Everything we're tracking today."
                : "Latest, straight from the labs and the boards."}
            </h3>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-foreground/15 pb-3">
            <div className="inline-flex border border-foreground/25" role="tablist" aria-label="Headline view">
              {(["top", "latest"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={headlineMode === m}
                  onClick={() => setHeadlineMode(m)}
                  className={`px-5 py-2.5 text-[11px] uppercase tracking-[0.2em] font-sans font-medium transition-colors ${
                    headlineMode === m
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.03]"
                  }`}
                >
                  {m === "top" ? "Top 10" : "Latest"}
                </button>
              ))}
            </div>
            <div className="text-[10px] md:text-xs uppercase tracking-[0.18em] text-muted-foreground font-sans">
              {headlinesQuery.isLoading
                ? "Syncing…"
                : headlinesQuery.isError
                  ? "Sync unavailable"
                  : `Last sync • ${lastSync ? formatRelative(lastSync) : "just now"}`}
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="divide-y divide-foreground/10 border-b border-foreground/15">
            {headlines.map((item) => {
              const d = new Date(item.publishedAt);
              const key = `${item.source}-${item.publishedAt}-${item.title}`;
              return (
                <article
                  key={key}
                  className="group px-1 md:px-3 py-6 hover:bg-foreground/[0.02] transition-colors"
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
                    <span className="text-sm font-serif text-foreground">{item.source}</span>
                    <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-sans border border-foreground/15 px-1.5 py-0.5">
                      {item.category}
                    </span>
                    <span className="ml-auto text-[10px] md:text-[11px] uppercase tracking-[0.15em] text-muted-foreground font-sans">
                      {HEADLINE_DATE_FMT.format(d)} <span className="opacity-60">·</span> {HEADLINE_TIME_FMT.format(d)}
                    </span>
                  </div>
                  {item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-start gap-2 text-base md:text-lg font-serif leading-snug text-foreground hover:text-foreground/75 transition-colors"
                    >
                      <span>{item.title}</span>
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1.5 group-hover:text-foreground transition-colors" />
                    </a>
                  ) : (
                    <span className="text-base md:text-lg font-serif leading-snug text-foreground">
                      {item.title}
                    </span>
                  )}
                  {item.coveredBy && (
                    <Link
                      href={`/dispatch/${item.coveredBy.postId}`}
                      className="mt-3 flex items-baseline gap-2 border-l-2 border-foreground/30 pl-3 text-xs text-foreground/70 hover:text-foreground hover:border-foreground/70 transition-colors overflow-hidden"
                    >
                      <span className="text-[10px] uppercase tracking-[0.18em] font-sans font-medium shrink-0">
                        Covered in Dispatch
                      </span>
                      <span className="font-serif italic truncate min-w-0 flex-1">
                        "{item.coveredBy.postTitle}"
                      </span>
                      <ArrowRight className="w-3 h-3 shrink-0" />
                    </Link>
                  )}
                </article>
              );
            })}
          </div>
        </FadeIn>

        <FadeIn delay={0.15}>
          <p className="text-xs text-muted-foreground font-light mt-6">
            Feed aggregated from public sources. Inclusion is not endorsement. Our agent filters for enterprise-relevant releases, research, and commentary.
          </p>
        </FadeIn>
      </div>
    </section>
  );
};

export default function Dispatch() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-foreground selection:text-background">
      <Navbar />
      <main>
        <HeadlineFeed />
      </main>
      <AssessmentFAB />
      <Footer />
    </div>
  );
}
