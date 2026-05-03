import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ArrowRight, ExternalLink, Rss } from "lucide-react";
import { FadeIn, Footer, Navbar, AssessmentFAB } from "@/components/site-layout";
import { DispatchList } from "@/components/dispatch-list";
import {
  DISPATCH_WEEKS,
  SUBSTACK_URL,
  groupPostsToWeeks,
  usePosts,
} from "@/lib/dispatch";

type Headline = {
  source: string;
  category: string;
  title: string;
  publishedAt: string;
  url?: string;
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
      }));
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
  });
}

const DispatchSubscribe = () => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading">("idle");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");

    fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, source: "dispatch" }),
      keepalive: true,
    }).catch(() => {});

    const url = new URL("/subscribe", SUBSTACK_URL);
    url.searchParams.set("email", email);
    url.searchParams.set("utm_source", "deerpark-website");
    window.location.href = url.toString();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        aria-label="Email address"
        className="flex-1 h-12 px-4 bg-background border border-foreground/20 text-sm font-sans text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground/60 transition-colors"
      />
      <Button
        type="submit"
        disabled={status === "loading"}
        className="rounded-none h-12 px-6 text-xs uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90 disabled:opacity-60"
      >
        {status === "loading" ? "Redirecting…" : <>Subscribe <ArrowRight className="ml-2 w-4 h-4" /></>}
      </Button>
    </form>
  );
};

const DispatchSection = () => {
  const postsQuery = usePosts();
  const latestWeek = useMemo(() => {
    if (postsQuery.data && postsQuery.data.length > 0) {
      return groupPostsToWeeks(postsQuery.data)[0];
    }
    return DISPATCH_WEEKS[0];
  }, [postsQuery.data]);

  return (
    <section id="dispatch" className="pt-32 md:pt-40 pb-24 bg-background">
      <div className="max-w-5xl mx-auto px-6">
        <FadeIn>
          <div className="flex items-center gap-3 mb-8">
            <div className="h-[1px] w-12 bg-primary"></div>
            <span className="section-label">Dispatch</span>
          </div>
          <div className="grid lg:grid-cols-12 gap-10 items-end mb-16">
            <div className="lg:col-span-7">
              <h2 className="text-4xl md:text-6xl font-serif leading-[1.05] pb-1">
                The Daily Writing
              </h2>
            </div>
            <div className="lg:col-span-5">
              <p className="text-muted-foreground font-light leading-relaxed mb-6">
                A short analytical note every business day from our in-house agent — on what's actually shipping in AI and what it means for operators.
              </p>
              <DispatchSubscribe />
              <div className="mt-4 text-xs font-sans text-muted-foreground">
                Delivered via Substack &bull;{" "}
                <a
                  href={SUBSTACK_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 hover:text-foreground transition-colors"
                >
                  Read on Substack
                </a>
              </div>
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={0.05}>
          <div className="flex items-baseline justify-between mb-2">
            <span className="section-label">Week of {latestWeek.label}</span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-sans">
              {latestWeek.sublabel}
            </span>
          </div>
        </FadeIn>

        <FadeIn delay={0.1}>
          <DispatchList entries={latestWeek.entries} />
        </FadeIn>

        <FadeIn delay={0.15}>
          <div className="mt-10 flex justify-end">
            <Link
              href="/dispatch/archive"
              className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors"
            >
              Browse archive
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </FadeIn>
      </div>
    </section>
  );
};

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
    <section className="py-24 border-t border-foreground/15 bg-background">
      <div className="max-w-7xl mx-auto px-6">
        <FadeIn>
          <div className="flex items-end justify-between mb-8 border-b border-foreground/15 pb-6 gap-6">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <Rss className="w-4 h-4 text-foreground/70" />
                <span className="section-label">Headline Feed</span>
              </div>
              <h3 className="text-2xl md:text-3xl font-serif leading-snug">
                {headlineMode === "top"
                  ? "The 10 stories worth your attention this week."
                  : "Latest, straight from the labs and the boards."}
              </h3>
            </div>
            <div className="flex flex-col items-end gap-3 shrink-0">
              <div className="inline-flex border border-foreground/20" role="tablist" aria-label="Headline view">
                {(["top", "latest"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={headlineMode === m}
                    onClick={() => setHeadlineMode(m)}
                    className={`px-4 py-2 text-[10px] uppercase tracking-[0.2em] font-sans transition-colors ${
                      headlineMode === m
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m === "top" ? "This week" : "Latest"}
                  </button>
                ))}
              </div>
              <div className="hidden md:block text-xs uppercase tracking-[0.18em] text-muted-foreground font-sans">
                {headlinesQuery.isLoading
                  ? "Syncing…"
                  : headlinesQuery.isError
                    ? "Sync unavailable"
                    : `Last sync • ${lastSync ? formatRelative(lastSync) : "just now"}`}
              </div>
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="border border-foreground/15">
            <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 border-b border-foreground/15 bg-foreground/[0.02]">
              <div className="col-span-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-sans">When</div>
              <div className="col-span-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-sans">Source</div>
              <div className="col-span-7 text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-sans">Headline</div>
            </div>
            <div className="divide-y divide-foreground/10">
              {headlines.map((item) => {
                const d = new Date(item.publishedAt);
                const row = (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 px-6 py-4 items-baseline hover:bg-foreground/[0.02] transition-colors">
                    <div className="md:col-span-2 flex items-baseline gap-2 text-xs uppercase tracking-[0.15em] text-muted-foreground">
                      <span className="font-serif normal-case tracking-normal text-foreground text-sm">{HEADLINE_DATE_FMT.format(d)}</span>
                      <span>{HEADLINE_TIME_FMT.format(d)}</span>
                    </div>
                    <div className="md:col-span-3 flex items-baseline gap-3">
                      <span className="text-sm font-serif text-foreground">{item.source}</span>
                      <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{item.category}</span>
                    </div>
                    <div className="md:col-span-7 text-base font-light text-foreground leading-snug flex items-start gap-2">
                      <span>{item.title}</span>
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1" />
                    </div>
                  </div>
                );
                const key = `${item.source}-${item.publishedAt}-${item.title}`;
                return item.url ? (
                  <a key={key} href={item.url} target="_blank" rel="noopener noreferrer" className="block">
                    {row}
                  </a>
                ) : (
                  <div key={key}>{row}</div>
                );
              })}
            </div>
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
        <DispatchSection />
        <HeadlineFeed />
      </main>
      <AssessmentFAB />
      <Footer />
    </div>
  );
}
