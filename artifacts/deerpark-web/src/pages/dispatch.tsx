import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { ArrowRight, Check, ExternalLink, Rss } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeIn, Footer, Navbar, ConsultationFAB } from "@/components/site-layout";

type Headline = {
  source: string;
  category: string;
  title: string;
  publishedAt: string;
  url?: string;
  commentary?: string | null;
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
  commentary?: string | null;
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
        commentary: h.commentary ?? null,
      }));
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
  });
}

type SubscribeStatus =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "success" }
  | { state: "error"; message: string };

const DispatchSubscribe = () => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SubscribeStatus>({ state: "idle" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ state: "loading" });

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email,
          source: "dispatch",
        }),
      });

      if (res.ok) {
        setStatus({ state: "success" });
        setFirstName("");
        setLastName("");
        setEmail("");
        return;
      }

      const message =
        res.status === 400
          ? "Please enter your first name, last name, and a valid email address."
          : "Couldn't reach our subscribe service. Try again in a moment, or email contact@deerpark.io.";
      setStatus({ state: "error", message });
    } catch {
      setStatus({
        state: "error",
        message: "Network error on our end. Try again in a moment, or email contact@deerpark.io.",
      });
    }
  };

  if (status.state === "success") {
    return (
      <div className="flex items-start gap-3 border border-primary/40 bg-primary/[0.06] px-4 py-3 text-sm font-sans">
        <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <span className="text-foreground/90 leading-snug">
          You're subscribed. The next Dispatch will hit your inbox at 3:30 PM PT.
        </span>
      </div>
    );
  }

  const submitting = status.state === "loading";
  const inputClass =
    "flex-1 h-12 px-4 bg-foreground/[0.04] border border-foreground/30 text-sm font-sans text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground focus:bg-background transition-colors disabled:opacity-60";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          required
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="First name"
          aria-label="First name"
          autoComplete="given-name"
          disabled={submitting}
          className={inputClass}
        />
        <input
          type="text"
          required
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Last name"
          aria-label="Last name"
          autoComplete="family-name"
          disabled={submitting}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          aria-label="Email address"
          autoComplete="email"
          disabled={submitting}
          className={inputClass}
        />
        <Button
          type="submit"
          disabled={submitting}
          className="rounded-none h-12 px-6 text-xs uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90 disabled:opacity-60"
        >
          {submitting ? "Subscribing…" : <>Subscribe <ArrowRight className="ml-2 w-4 h-4" /></>}
        </Button>
      </div>
      {status.state === "error" && (
        <p role="alert" className="text-xs text-red-400 font-sans">
          {status.message}
        </p>
      )}
    </form>
  );
};

const SubscribeHero = () => (
  <section id="dispatch-subscribe" className="pt-32 md:pt-40 pb-12 bg-background">
    <div className="max-w-7xl mx-auto px-6">
      <FadeIn>
        <div className="flex items-center gap-3 mb-8">
          <div className="h-[1px] w-12 bg-primary"></div>
          <span className="section-label">Dispatch</span>
        </div>
        <div className="lg:grid lg:grid-cols-12">
          <div className="lg:col-span-6 min-w-0">
            <p className="text-muted-foreground font-light leading-relaxed mb-6">
              Daily relevant AI news in your inbox at 3:30 PM PT — the day's top 10, with 2–4 sentences of context on each. The same top 10 lives below; email is just the convenience.
            </p>
            <DispatchSubscribe />
          </div>
        </div>
      </FadeIn>
    </div>
  </section>
);

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
    <section id="headline-feed" className="pt-12 md:pt-16 pb-24 bg-background">
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
                  {item.commentary && (
                    <div className="mt-3 text-sm md:text-[15px] leading-relaxed text-foreground/80 font-light max-w-3xl [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-medium [&_strong]:text-foreground">
                      <ReactMarkdown>{item.commentary}</ReactMarkdown>
                    </div>
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
        <SubscribeHero />
        <HeadlineFeed />
      </main>
      <ConsultationFAB />
      <Footer />
    </div>
  );
}
