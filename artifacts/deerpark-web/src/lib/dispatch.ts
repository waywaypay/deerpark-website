import { useQuery } from "@tanstack/react-query";

export type PostApiItem = {
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

export type DispatchEntry = {
  id?: number;
  date: string;
  dateLong: string;
  title: string;
  dek: string;
  tag: string;
};

export type DispatchWeek = {
  id: string;
  label: string;
  sublabel: string;
  entries: DispatchEntry[];
};

export const SUBSTACK_URL = "https://deerpark.substack.com";

export const DISPATCH_WEEKS: DispatchWeek[] = [
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

export function usePosts() {
  return useQuery<PostApiItem[]>({
    queryKey: ["posts"],
    queryFn: async () => {
      const res = await fetch("/api/posts?limit=50");
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

export const groupPostsToWeeks = (posts: PostApiItem[]): DispatchWeek[] => {
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
          id: p.id,
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
