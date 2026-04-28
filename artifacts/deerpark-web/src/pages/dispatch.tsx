import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ArrowRight, Calendar, Rss, ExternalLink, ChevronDown } from "lucide-react";
import { FadeIn, Navbar, Footer, ScorecardFAB } from "@/components/site-layout";

type DispatchEntry = {
  date: string;
  dateLong: string;
  title: string;
  dek: string;
  tag: string;
};

type DispatchWeek = {
  id: string;
  label: string;
  sublabel: string;
  entries: DispatchEntry[];
};

const DISPATCH_WEEKS: DispatchWeek[] = [
  {
    id: "2026-w17",
    label: "Apr 20 – Apr 24",
    sublabel: "This week",
    entries: [
      { date: "Mon", dateLong: "Apr 20", title: "Agentic coding benchmarks shift again: what matters for enterprise buyers.", dek: "A week after the new SWE-bench Verified numbers landed, procurement teams are asking the wrong questions. Here are the three we recommend instead.", tag: "Analysis" },
      { date: "Tue", dateLong: "Apr 21", title: "Open-weight vs frontier: reading the April release cadence.", dek: "Anthropic, OpenAI, and Google each shipped this week. We map the deltas that actually affect production deployments.", tag: "Market" },
      { date: "Wed", dateLong: "Apr 22", title: "Why your first AI application should be boring.", dek: "The pattern we see across forty rollouts: the teams that ship scheduled, structured, workflow-bounded tools outrun the ones chasing chat-first mandates.", tag: "Practice" },
      { date: "Thu", dateLong: "Apr 23", title: "NVIDIA earnings read-through for services firms.", dek: "Capex signal for the back half of 2026 — and what it implies for the inference economics you should be modeling right now.", tag: "Signals" },
      { date: "Fri", dateLong: "Apr 24", title: "Field notes: the three training formats that actually stick.", dek: "From the last six DeerPark engagements — what drives day-one adoption, and what quietly kills it two weeks in.", tag: "Field Notes" },
    ],
  },
  {
    id: "2026-w16",
    label: "Apr 13 – Apr 17",
    sublabel: "Last week",
    entries: [
      { date: "Mon", dateLong: "Apr 13", title: "Procurement is the bottleneck, not the model.", dek: "We walked through six stalled pilots. Five died in legal review, not engineering. Here's the template that unblocked them.", tag: "Analysis" },
      { date: "Tue", dateLong: "Apr 14", title: "The quiet consolidation in agent frameworks.", dek: "Three projects merged, two went dormant, one picked up steam. A snapshot of where the ecosystem actually is in April 2026.", tag: "Market" },
      { date: "Wed", dateLong: "Apr 15", title: "Eval-driven development: our operating manual.", dek: "Every DeerPark build ships with an eval suite before it ships with a UI. Here's how we structure the first two weeks of any engagement.", tag: "Practice" },
      { date: "Thu", dateLong: "Apr 16", title: "What the Google Cloud Next keynotes actually said.", dek: "Past the product names: the three architectural bets Google is forcing enterprise buyers to make this year.", tag: "Signals" },
      { date: "Fri", dateLong: "Apr 17", title: "Training the non-technical operator.", dek: "Why we run our workshops in role-based cohorts of seven, and the three exercises that move the adoption needle fastest.", tag: "Field Notes" },
    ],
  },
  {
    id: "2026-w15",
    label: "Apr 6 – Apr 10",
    sublabel: "2 weeks ago",
    entries: [
      { date: "Mon", dateLong: "Apr 6", title: "Inference cost curves: the real Q1 numbers.", dek: "Pricing compressed 38% on frontier tiers. What that does to your rollout math if you priced your pilot in December.", tag: "Analysis" },
      { date: "Tue", dateLong: "Apr 7", title: "When to pick open-weight: three concrete tests.", dek: "A decision framework we run with every client who asks — cost, control, and capability, in that order.", tag: "Practice" },
      { date: "Wed", dateLong: "Apr 8", title: "Hugging Face's enterprise push, read between the lines.", dek: "The platform moves this quarter tell you more about where the market is going than any single model release.", tag: "Market" },
      { date: "Thu", dateLong: "Apr 9", title: "Structured outputs are underrated.", dek: "The boring feature that ate half of our custom agent glue code. Why we default to it now, and when it backfires.", tag: "Practice" },
      { date: "Fri", dateLong: "Apr 10", title: "Observability for agent systems: a minimum viable stack.", dek: "Traces, evals, and cost telemetry — the three things we deploy in week one of every engagement.", tag: "Field Notes" },
    ],
  },
  {
    id: "2026-w14",
    label: "Mar 30 – Apr 3",
    sublabel: "3 weeks ago",
    entries: [
      { date: "Mon", dateLong: "Mar 30", title: "Q1 2026 in review: what actually shipped to production.", dek: "Ninety days, fourteen enterprise deployments we tracked closely. The patterns that separated the wins from the stalls.", tag: "Analysis" },
      { date: "Tue", dateLong: "Mar 31", title: "The agent memory problem, one year later.", dek: "A look at the three approaches teams are actually using in production — and which one your stack probably needs.", tag: "Practice" },
      { date: "Wed", dateLong: "Apr 1", title: "Reading AWS re:Invent's spring preview.", dek: "Bedrock, Strands, and the Amazon Q roadmap. What moved, what stalled, and what it means for your 2026 plan.", tag: "Signals" },
      { date: "Thu", dateLong: "Apr 2", title: "Why tool-use reliability is the new eval.", dek: "Accuracy is table stakes. The gap between pilot and production now sits almost entirely in function-calling reliability.", tag: "Analysis" },
      { date: "Fri", dateLong: "Apr 3", title: "Change management for AI rollouts.", dek: "Field-tested tactics for the week after launch, when usage numbers dip and sponsors start asking questions.", tag: "Field Notes" },
    ],
  },
  {
    id: "2026-w13",
    label: "Mar 23 – Mar 27",
    sublabel: "4 weeks ago",
    entries: [
      { date: "Mon", dateLong: "Mar 23", title: "Anthropic's March model release, in context.", dek: "Past the benchmarks: what the new pricing and context windows change about enterprise deployment math.", tag: "Market" },
      { date: "Tue", dateLong: "Mar 24", title: "Retrieval is not a solved problem.", dek: "Four retrieval failure modes we saw in production this quarter, and the mitigations that actually worked.", tag: "Practice" },
      { date: "Wed", dateLong: "Mar 25", title: "The middle-market AI buying cycle.", dek: "Notes from forty sales cycles: how mid-market decision-making differs from enterprise, and what that means for vendors.", tag: "Analysis" },
      { date: "Thu", dateLong: "Mar 26", title: "NVIDIA GTC debrief for operators.", dek: "Past the announcements, the three deployment architectures GTC validated and the two it quietly retired.", tag: "Signals" },
      { date: "Fri", dateLong: "Mar 27", title: "Onboarding the first agent user on a team.", dek: "The playbook we run for employee #1 on a new agent system. It is never the person you would guess.", tag: "Field Notes" },
    ],
  },
];

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

type PostApiItem = {
  id: number;
  agentId: string;
  mode: string;
  tag: string;
  title: string;
  dek: string;
  bodyMarkdown: string;
  citations: string[];
  publishedAt: string;
};

function usePosts() {
  return useQuery<PostApiItem[]>({
    queryKey: ["posts"],
    queryFn: async () => {
      const res = await fetch("/api/posts?limit=35");
      if (!res.ok) throw new Error(`Posts request failed: ${res.status}`);
      const data = (await res.json()) as { items: PostApiItem[] };
      return data.items;
    },
    refetchInterval: 30 * 60 * 1000,
    staleTime: 5 * 60 * 1000,
  });
}

const SHORT_DATE_FMT = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const LONG_DATE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

const isoWeekKey = (d: Date): string => {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-w${String(weekNo).padStart(2, "0")}`;
};

const weekRangeLabel = (postsInWeek: PostApiItem[]): string => {
  const dates = postsInWeek
    .map((p) => new Date(p.publishedAt))
    .sort((a, b) => a.getTime() - b.getTime());
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!first || !last) return "";
  return `${LONG_DATE_FMT.format(first)} – ${LONG_DATE_FMT.format(last)}`;
};

const groupPostsToWeeks = (posts: PostApiItem[]): DispatchWeek[] => {
  const buckets = new Map<string, PostApiItem[]>();
  for (const p of posts) {
    const key = isoWeekKey(new Date(p.publishedAt));
    const arr = buckets.get(key);
    if (arr) arr.push(p);
    else buckets.set(key, [p]);
  }
  const weeks: DispatchWeek[] = [];
  const keys = [...buckets.keys()].sort().reverse();
  keys.forEach((key, idx) => {
    const items = buckets.get(key)!.sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );
    const sublabel = idx === 0 ? "This week" : idx === 1 ? "Last week" : `${idx} weeks ago`;
    weeks.push({
      id: key,
      label: weekRangeLabel(items),
      sublabel,
      entries: items.map((p) => {
        const d = new Date(p.publishedAt);
        return {
          date: SHORT_DATE_FMT.format(d),
          dateLong: LONG_DATE_FMT.format(d),
          title: p.title,
          dek: p.dek,
          tag: p.tag,
        };
      }),
    });
  });
  return weeks;
};

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

const SUBSTACK_URL = "https://deerpark.substack.com";

const DispatchSubscribe = () => {
  const [email, setEmail] = useState("");
  const action = `${SUBSTACK_URL}/subscribe`;
  return (
    <form
      action={action}
      method="get"
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col sm:flex-row gap-3"
    >
      <input
        type="email"
        name="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        aria-label="Email address"
        className="flex-1 h-12 px-4 bg-background border border-foreground/20 text-sm font-sans text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground/60 transition-colors"
      />
      <Button
        type="submit"
        className="rounded-none h-12 px-6 text-xs uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90"
      >
        Subscribe <ArrowRight className="ml-2 w-4 h-4" />
      </Button>
    </form>
  );
};

const DispatchSection = () => {
  const postsQuery = usePosts();
  const weeks: DispatchWeek[] = useMemo(() => {
    if (postsQuery.data && postsQuery.data.length > 0) {
      return groupPostsToWeeks(postsQuery.data);
    }
    return DISPATCH_WEEKS;
  }, [postsQuery.data]);
  const [selectedWeekId, setSelectedWeekId] = useState<string>(weeks[0]?.id ?? DISPATCH_WEEKS[0].id);
  useEffect(() => {
    if (weeks.length > 0 && !weeks.some((w) => w.id === selectedWeekId)) {
      setSelectedWeekId(weeks[0].id);
    }
  }, [weeks, selectedWeekId]);
  const [weekMenuOpen, setWeekMenuOpen] = useState(false);
  const selectedWeek = weeks.find((w) => w.id === selectedWeekId) ?? weeks[0] ?? DISPATCH_WEEKS[0];
  const [headlineMode, setHeadlineMode] = useState<HeadlineMode>("top");
  const headlinesQuery = useHeadlines(headlineMode);
  const headlines: Headline[] = headlinesQuery.data && headlinesQuery.data.length > 0
    ? headlinesQuery.data
    : HEADLINE_FALLBACK;
  const lastSync = headlinesQuery.dataUpdatedAt
    ? new Date(headlinesQuery.dataUpdatedAt)
    : null;

  return (
    <section id="dispatch" className="pt-32 md:pt-40 pb-32 bg-background">
      <div className="max-w-7xl mx-auto px-6">
        <FadeIn>
          <div className="flex items-center gap-3 mb-8">
            <div className="h-[1px] w-12 bg-primary"></div>
            <span className="section-label">Dispatch</span>
          </div>
          <div className="grid lg:grid-cols-12 gap-10 items-end mb-16">
            <div className="lg:col-span-7">
              <h2 className="text-4xl md:text-5xl font-serif leading-[1.05] pb-1">
                A daily read on AI, written by an agent — so your team doesn't have to.
              </h2>
            </div>
            <div className="lg:col-span-5">
              <p className="text-muted-foreground font-light leading-relaxed mb-6">
                Our in-house agent publishes a short analytical note every business day on a rolling weekly cadence, and pulls verified headlines from the labs, hyperscalers, and research orgs publishing the work.
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
                  Read the archive
                </a>
              </div>
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="flex items-center justify-between border-t border-b border-foreground/15 py-4 mb-10">
            <div
              className="relative"
              onMouseEnter={() => setWeekMenuOpen(true)}
              onMouseLeave={() => setWeekMenuOpen(false)}
            >
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={weekMenuOpen}
                onClick={() => setWeekMenuOpen((v) => !v)}
                className="flex items-center gap-3 group cursor-pointer"
              >
                <Calendar className="w-4 h-4 text-foreground/70" />
                <span className="section-label group-hover:text-foreground transition-colors">
                  Week of {selectedWeek.label}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-foreground/60 transition-transform ${weekMenuOpen ? "rotate-180" : ""}`}
                />
              </button>
              {weekMenuOpen && (
                <div
                  role="listbox"
                  className="absolute left-0 top-full z-20 mt-2 w-72 border border-foreground/20 bg-background shadow-lg"
                >
                  <div className="px-4 py-3 border-b border-foreground/10 text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-sans">
                    Archive
                  </div>
                  <ul>
                    {weeks.map((week) => {
                      const active = week.id === selectedWeekId;
                      return (
                        <li key={week.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={active}
                            onClick={() => {
                              setSelectedWeekId(week.id);
                              setWeekMenuOpen(false);
                            }}
                            className={`w-full flex items-baseline justify-between gap-4 px-4 py-3 text-left text-sm hover:bg-foreground/[0.04] transition-colors ${active ? "bg-foreground/[0.04]" : ""}`}
                          >
                            <span className="font-serif text-foreground">{week.label}</span>
                            <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                              {week.sublabel}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs font-sans uppercase tracking-[0.15em] text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              Agent-authored &bull; Auto-updated
            </div>
          </div>
        </FadeIn>

        <div className="grid lg:grid-cols-5 gap-6 mb-24">
          {selectedWeek.entries.map((entry, i) => (
            <FadeIn key={`${selectedWeek.id}-${entry.dateLong}`} delay={0.05 * i}>
              <article className="border border-foreground/15 p-6 h-full flex flex-col hover:border-foreground/40 transition-colors group">
                <div className="flex items-baseline justify-between mb-6">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground font-sans">{entry.date}</div>
                    <div className="text-sm font-serif text-foreground mt-1">{entry.dateLong}</div>
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground border border-foreground/20 px-2 py-1">
                    {entry.tag}
                  </span>
                </div>
                <h3 className="text-lg font-serif leading-snug text-foreground mb-4">
                  {entry.title}
                </h3>
                <p className="text-sm text-muted-foreground font-light leading-relaxed flex-1">
                  {entry.dek}
                </p>
                <div className="mt-6 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-foreground/60 group-hover:text-foreground transition-colors">
                  Read <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </article>
            </FadeIn>
          ))}
        </div>

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
      </main>
      <ScorecardFAB />
      <Footer />
    </div>
  );
}
