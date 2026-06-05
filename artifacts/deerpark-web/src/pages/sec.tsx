import { ArrowRight, Check, Database, FileText, Gauge, Terminal, Zap } from "lucide-react";
import { FadeIn, SiteHeader, SiteFooter } from "@/components/site-layout";

type Tool = {
  name: string;
  description: string;
};

const TOOLS: Tool[] = [
  { name: "get-sec-filings", description: "Recent filings (10-K, 10-Q, 8-K, …) for a company" },
  { name: "get-income-statement", description: "Structured income-statement time series" },
  { name: "get-balance-sheet", description: "Structured balance-sheet time series" },
  { name: "get-cash-flow-statement", description: "Structured cash-flow time series" },
  { name: "get-formatted-income-statement", description: "Income-statement table verbatim from the filing" },
  { name: "get-formatted-balance-sheet", description: "Balance-sheet table verbatim from the filing" },
  { name: "get-formatted-cash-flow", description: "Cash-flow table verbatim from the filing" },
  { name: "get-13f-holdings", description: "13F institutional holdings with optional multi-quarter history" },
  { name: "get-8k-press-releases", description: "8-K press releases including Exhibit 99.1 text" },
  { name: "get-filing-text", description: "Full text of any filing with section extraction + keyword grep" },
  { name: "get-insider-transactions", description: "Form 4 insider transactions" },
  { name: "get-ownership-disclosures", description: "SC 13D / 13G large-shareholder disclosures" },
  { name: "get-form144-notifications", description: "Form 144 proposed-sale notifications" },
  { name: "search-company", description: "Look up a company / fund / filer by name → CIK" },
  { name: "get-analyst-estimates", description: "Analyst consensus + price targets (yfinance)" },
  { name: "diff-filings", description: "Diff a section across two filings (year-over-year deltas)" },
  { name: "search-kpi-history", description: "KPI keyword history across N years of filings with provenance" },
  { name: "get-segment-revenue", description: "Disaggregated / segment revenue table" },
  { name: "get-xbrl-kpis", description: "Issuer-tagged XBRL KPIs (custom company tags)" },
];

const CAPABILITIES = [
  {
    icon: Terminal,
    title: "CLI built for pipelines",
    detail: "--json for jq-friendly output, -o/--output to spill large filings to disk, stderr-isolated logs so stdout stays parseable.",
  },
  {
    icon: Zap,
    title: "MCP server, two transports",
    detail: "stdio for Claude Desktop and other local clients; StreamableHTTP for the Vercel-hosted endpoint.",
  },
  {
    icon: Gauge,
    title: "EDGAR-safe by default",
    detail: "Rate limiting stays within SEC EDGAR's 10 req/s ceiling. CIK + submissions caches have configurable TTL.",
  },
  {
    icon: Database,
    title: "Async + singleflight",
    detail: "Concurrent tool calls coalesce instead of duplicating EDGAR fetches. Pure-dataclass return types keep JSON output structured and grep-able.",
  },
] as const;

const Header = () => (
  <section className="pt-16 md:pt-24 pb-16 bg-background border-b border-foreground/10">
    <div className="max-w-7xl mx-auto px-6">
      <FadeIn>
        <div className="flex items-center gap-3 mb-8">
          <div className="h-[1px] w-12 bg-primary" />
          <span className="section-label">Product · SEC MCP</span>
        </div>
        <div className="lg:grid lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-8 min-w-0">
            <h1 className="text-4xl md:text-6xl font-serif leading-[1.05] mb-6 pb-1">
              <em className="not-italic font-light">SEC filings, structured for agents.</em>
            </h1>
            <p className="text-lg text-muted-foreground font-light leading-relaxed mb-6 max-w-2xl">
              An MCP server and command-line client that pull SEC EDGAR data accurately — filings, structured and
              verbatim financials, insider activity, ownership, segment revenue, issuer-tagged XBRL KPIs,
              full-text section extraction, cross-year diffs, KPI history, and analyst estimates.
            </p>
            <p className="text-base text-muted-foreground font-light leading-relaxed max-w-2xl">
              Drops into Claude Desktop over stdio, runs hosted over StreamableHTTP, and pipes cleanly into shell
              tools with <code className="font-mono text-xs bg-foreground/[0.06] border border-foreground/10 px-1.5 py-0.5">--json</code>.
              Rate-limited inside EDGAR's ceiling, cached, and built so concurrent agent calls coalesce.
            </p>
          </div>
          <div className="lg:col-span-4 mt-10 lg:mt-0">
            <div className="border border-foreground/15 bg-foreground/[0.03] p-6">
              <div className="section-label mb-3">At a glance</div>
              <dl className="space-y-4">
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-sans">Tools</dt>
                  <dd className="text-2xl font-serif mt-1">19</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-sans">Transports</dt>
                  <dd className="text-base font-serif mt-1">stdio · StreamableHTTP</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-sans">Rate ceiling</dt>
                  <dd className="text-base font-serif mt-1">10 req/s (EDGAR)</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-sans">Returns</dt>
                  <dd className="text-base font-serif mt-1">Pure dataclasses</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </FadeIn>
    </div>
  </section>
);

const Capabilities = () => (
  <section className="py-24 border-b border-foreground/10">
    <div className="max-w-7xl mx-auto px-6">
      <FadeIn>
        <div className="flex items-center gap-3 mb-10">
          <div className="h-[1px] w-12 bg-primary" />
          <span className="section-label">How it runs</span>
        </div>
        <h2 className="text-3xl md:text-4xl font-serif mb-12 max-w-2xl">
          Built to behave inside EDGAR's limits, not around them.
        </h2>
      </FadeIn>
      <div className="grid md:grid-cols-2 gap-6">
        {CAPABILITIES.map((c, i) => (
          <FadeIn key={c.title} delay={i * 0.05}>
            <div className="h-full border border-foreground/15 bg-foreground/[0.03] p-8 flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 border border-foreground/15 bg-foreground/5">
                  <c.icon className="w-4 h-4 text-primary" />
                </div>
                <h3 className="text-xl md:text-2xl font-serif">{c.title}</h3>
              </div>
              <p className="text-sm text-muted-foreground font-light leading-relaxed">{c.detail}</p>
            </div>
          </FadeIn>
        ))}
      </div>
    </div>
  </section>
);

const Tools = () => (
  <section className="py-24 bg-card border-b border-foreground/10">
    <div className="max-w-7xl mx-auto px-6">
      <FadeIn>
        <div className="flex items-center gap-3 mb-10">
          <div className="h-[1px] w-12 bg-primary" />
          <span className="section-label">Available tools · 19</span>
        </div>
        <h2 className="text-3xl md:text-4xl font-serif mb-4 max-w-3xl">
          One tool per question. Structured outputs, every call.
        </h2>
        <p className="text-base text-muted-foreground font-light leading-relaxed max-w-2xl mb-12">
          Each tool returns a dataclass — no free-form prose for the model to misread, no HTML for shell scripts
          to scrape. JSON in, JSON out, with provenance attached to filings where it matters.
        </p>
      </FadeIn>

      <FadeIn delay={0.05}>
        <div className="border border-foreground/15 bg-background">
          <div className="grid grid-cols-12 px-6 py-4 border-b border-foreground/15">
            <div className="col-span-12 md:col-span-4 section-label">Tool</div>
            <div className="hidden md:block md:col-span-8 section-label">Description</div>
          </div>
          <div className="divide-y divide-foreground/10">
            {TOOLS.map((t) => (
              <div key={t.name} className="grid grid-cols-12 px-6 py-4 items-baseline">
                <div className="col-span-12 md:col-span-4">
                  <code className="font-mono text-sm text-foreground bg-foreground/[0.05] border border-foreground/10 px-2 py-1">
                    {t.name}
                  </code>
                </div>
                <div className="col-span-12 md:col-span-8 mt-2 md:mt-0 text-sm text-foreground/80 font-light leading-relaxed">
                  {t.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      </FadeIn>
    </div>
  </section>
);

const Usage = () => (
  <section className="py-24 border-b border-foreground/10">
    <div className="max-w-7xl mx-auto px-6">
      <FadeIn>
        <div className="flex items-center gap-3 mb-10">
          <div className="h-[1px] w-12 bg-primary" />
          <span className="section-label">Two ways to run it</span>
        </div>
      </FadeIn>
      <div className="grid md:grid-cols-2 gap-6">
        <FadeIn>
          <div className="h-full border border-foreground/15 bg-foreground/[0.03] p-8 flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 border border-foreground/15 bg-foreground/5">
                <Zap className="w-4 h-4 text-primary" />
              </div>
              <h3 className="text-xl md:text-2xl font-serif">MCP server</h3>
            </div>
            <p className="text-sm text-muted-foreground font-light leading-relaxed mb-6">
              Two transports cover local and hosted use:
            </p>
            <ul className="space-y-3 text-sm font-light text-foreground/85">
              <li className="flex items-start gap-3">
                <Check className="w-3.5 h-3.5 mt-1 text-primary shrink-0" />
                <span>
                  <span className="font-mono text-xs bg-foreground/[0.06] border border-foreground/10 px-1.5 py-0.5">stdio</span> — for Claude Desktop and other local MCP clients.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-3.5 h-3.5 mt-1 text-primary shrink-0" />
                <span>
                  <span className="font-mono text-xs bg-foreground/[0.06] border border-foreground/10 px-1.5 py-0.5">StreamableHTTP</span> — hosted on Vercel for remote clients.
                </span>
              </li>
            </ul>
          </div>
        </FadeIn>

        <FadeIn delay={0.05}>
          <div className="h-full border border-foreground/15 bg-foreground/[0.03] p-8 flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 border border-foreground/15 bg-foreground/5">
                <Terminal className="w-4 h-4 text-primary" />
              </div>
              <h3 className="text-xl md:text-2xl font-serif">CLI</h3>
            </div>
            <p className="text-sm text-muted-foreground font-light leading-relaxed mb-6">
              Designed to behave inside shell pipelines:
            </p>
            <ul className="space-y-3 text-sm font-light text-foreground/85">
              <li className="flex items-start gap-3">
                <Check className="w-3.5 h-3.5 mt-1 text-primary shrink-0" />
                <span>
                  <span className="font-mono text-xs bg-foreground/[0.06] border border-foreground/10 px-1.5 py-0.5">--json</span> — jq-friendly output on stdout.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-3.5 h-3.5 mt-1 text-primary shrink-0" />
                <span>
                  <span className="font-mono text-xs bg-foreground/[0.06] border border-foreground/10 px-1.5 py-0.5">-o / --output</span> — spill large filings to disk.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-3.5 h-3.5 mt-1 text-primary shrink-0" />
                <span>Stderr-isolated logs so stdout stays clean.</span>
              </li>
            </ul>
          </div>
        </FadeIn>
      </div>
    </div>
  </section>
);

const Outro = () => (
  <section className="py-24 bg-card">
    <div className="max-w-3xl mx-auto px-6 text-center">
      <FadeIn>
        <div className="inline-flex p-3 border border-foreground/15 bg-background mb-6">
          <FileText className="w-5 h-5 text-primary" />
        </div>
        <h2 className="text-3xl md:text-4xl font-serif mb-6">
          Want this wired into your team's stack?
        </h2>
        <p className="text-base text-muted-foreground font-light leading-relaxed mb-10">
          We deploy the MCP into your tenant, point it at the EDGAR data your analysts actually use, and train
          your team on the workflows around it.
        </p>
        <a
          href="mailto:contact@deerpark.io"
          className="inline-flex items-center justify-center gap-2 rounded-none h-14 px-8 text-sm font-medium uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90 transition-colors"
        >
          Talk to us <ArrowRight className="ml-2 w-4 h-4" />
        </a>
      </FadeIn>
    </div>
  </section>
);

export default function Sec() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground selection:bg-foreground selection:text-background">
      <SiteHeader />
      <main className="flex-1">
        <Header />
        <Capabilities />
        <Tools />
        <Usage />
        <Outro />
      </main>
      <SiteFooter />
    </div>
  );
}
