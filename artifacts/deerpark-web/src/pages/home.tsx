import { Link } from "wouter";
import {
  ArrowRight,
  ArrowUpRight,
  ScanSearch,
  Users,
  Layers,
  Check,
  Terminal,
} from "lucide-react";
import { FadeIn, SiteHeader, SiteFooter, CONTACT_EMAIL } from "@/components/site-layout";

const PRODUCTIVITY_STUDY_URL =
  "https://www.anthropic.com/research/estimating-productivity-gains";

const mailto = (subject: string) =>
  `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;

/* ---------------------------------------------------------------- Hero --- */

const HERO_STATS = [
  { value: "−80%", label: "manual effort, shipped workflows" },
  { value: "+25%", label: "quality vs. off-the-shelf" },
  { value: "8 wks", label: "kickoff to production" },
] as const;

/** Compact before/after bar used in the featured-outcome panel. */
const OutcomeBar = ({
  label,
  value,
  widthPct,
  accent = false,
}: {
  label: string;
  value: string;
  widthPct: number;
  accent?: boolean;
}) => (
  <div>
    <div className="flex items-baseline justify-between mb-2">
      <span className="text-[10px] uppercase tracking-[0.18em] text-background/50 font-sans">
        {label}
      </span>
      <span className="font-serif text-background/90">{value}</span>
    </div>
    <div className="h-2 bg-background/10">
      <div
        className={`h-full ${accent ? "bg-background" : "bg-background/30"}`}
        style={{ width: `${widthPct}%` }}
      />
    </div>
  </div>
);

/** Dark "proof" card that anchors the right half of the hero. */
const FeaturedOutcome = () => (
  <div className="bg-foreground text-background p-8 md:p-10">
    <div className="flex items-center gap-3 mb-8">
      <div className="h-[1px] w-10 bg-background/40" />
      <span className="section-label !text-background/80">Featured outcome</span>
    </div>

    <h3 className="text-2xl md:text-3xl font-serif leading-tight mb-2">
      Four hours of analyst work, down to fifteen minutes.
    </h3>
    <p className="text-sm text-background/60 font-light leading-relaxed mb-8">
      We rebuilt a services provider's high-volume scheduling workflow end-to-end —
      product design, data architecture, and an AI enrichment layer.
    </p>

    <div className="space-y-5 mb-8">
      <OutcomeBar label="Before" value="~4 hrs / schedule" widthPct={100} />
      <OutcomeBar label="After" value="~15 min / schedule" widthPct={6} accent />
    </div>

    <dl className="grid grid-cols-2 gap-6 pt-8 border-t border-background/15">
      <div>
        <dt className="text-[10px] uppercase tracking-[0.15em] text-background/45 font-sans">
          Reporting time
        </dt>
        <dd className="text-2xl md:text-3xl font-serif mt-1.5">−94%</dd>
      </div>
      <div>
        <dt className="text-[10px] uppercase tracking-[0.15em] text-background/45 font-sans">
          Rolled out to
        </dt>
        <dd className="text-2xl md:text-3xl font-serif mt-1.5">40+ clients</dd>
      </div>
    </dl>

    <Link
      href="/case-studies"
      className="group mt-8 inline-flex items-center gap-2 text-sm text-background/80 hover:text-background transition-colors"
    >
      Read the case studies
      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
    </Link>
  </div>
);

const Hero = () => (
  <section className="relative overflow-hidden border-b border-foreground/10">
    {/* Soft radial warmth so the right half reads as composed, not empty. */}
    <div
      className="absolute inset-0 z-0 pointer-events-none"
      style={{
        background:
          "radial-gradient(ellipse 60% 70% at 85% 35%, rgba(20,83,45,0.05) 0%, transparent 60%)",
      }}
    />
    <div className="relative z-10 max-w-7xl mx-auto px-6 py-16 md:py-24 lg:py-28">
      <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-stretch">
        <div className="lg:col-span-7 min-w-0 flex flex-col">
          <FadeIn>
            <div className="flex items-center gap-3 mb-8">
              <div className="h-[1px] w-12 bg-primary" />
              <span className="section-label">Applied AI for Organizations</span>
            </div>
          </FadeIn>

          <FadeIn delay={0.05}>
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-serif leading-[1.05] mb-7 pb-1">
              <em className="not-italic font-light">From AI-curious to AI-capable.</em>
            </h1>
          </FadeIn>

          <FadeIn delay={0.1}>
            <p className="text-lg md:text-xl text-muted-foreground font-light leading-relaxed max-w-xl mb-9">
              We map where AI pays back fastest, build the software your team needs, and
              train your people to run it — in your stack, on your data.
            </p>
          </FadeIn>

          <FadeIn delay={0.15}>
            <div className="flex flex-col sm:flex-row gap-4">
              <a
                href={mailto("Intro call — DeerPark")}
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-foreground text-background px-7 py-3.5 text-base font-medium tracking-wide hover:bg-foreground/85 transition-colors"
              >
                Schedule a call
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </a>
              <a
                href="#work"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-foreground/40 bg-foreground/[0.04] px-7 py-3.5 text-base font-medium tracking-wide text-foreground hover:bg-foreground/[0.08] hover:border-foreground/60 transition-colors"
              >
                See our work
              </a>
            </div>
          </FadeIn>

          <FadeIn delay={0.2} className="mt-auto">
            <dl className="mt-0 grid grid-cols-3 gap-6 border-t border-foreground/10 pt-8 max-w-lg">
              {HERO_STATS.map((s) => (
                <div key={s.value}>
                  <dt className="text-2xl md:text-3xl font-serif text-foreground">{s.value}</dt>
                  <dd className="mt-1 text-xs text-muted-foreground font-light leading-snug">
                    {s.label}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 text-xs text-muted-foreground font-light max-w-lg">
              On shipped workflows, in line with{" "}
              <a
                href={PRODUCTIVITY_STUDY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-foreground/80 underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground hover:text-foreground transition-colors"
              >
                research on 80% AI productivity gains
                <ArrowUpRight className="w-3 h-3" />
              </a>
              .
            </p>
          </FadeIn>
        </div>

        <FadeIn delay={0.15} className="lg:col-span-5 min-w-0">
          <FeaturedOutcome />
        </FadeIn>
      </div>
    </div>
  </section>
);

/* ------------------------------------------------------------ Approach --- */

const PILLARS = [
  {
    phase: "01",
    title: "Map",
    icon: ScanSearch,
    summary:
      "We map your organization against where AI pays back fastest — a ranked shortlist of use cases by impact and effort, so you know exactly what to do first.",
    points: ["AI readiness assessment", "Workflow diagnostic", "Tool & vendor evaluation"],
  },
  {
    phase: "02",
    title: "Embed",
    icon: Users,
    summary:
      "We work alongside your team — integrating AI into daily processes, tailoring it to how the work actually runs, and training your people on the job.",
    points: ["Embedded AI operator", "Process automation", "Role-based workshops"],
  },
  {
    phase: "03",
    title: "Build",
    icon: Layers,
    summary:
      "We design and ship the custom software your team needs — on your stack, in your cloud, with the runbooks and training to run it after handoff.",
    points: ["Custom applications", "AI agents & automations", "Runbooks & enablement"],
  },
] as const;

const Approach = () => (
  <section id="approach" className="scroll-mt-24 py-24 md:py-28 border-b border-foreground/10">
    <div className="max-w-7xl mx-auto px-6">
      <FadeIn>
        <div className="flex items-center gap-3 mb-8">
          <div className="h-[1px] w-12 bg-primary" />
          <span className="section-label">How we work</span>
        </div>
        <h2 className="text-3xl md:text-5xl font-serif leading-[1.08] mb-5 max-w-2xl">
          Three ways to work with us.
        </h2>
        <p className="text-base md:text-lg text-muted-foreground font-light leading-relaxed max-w-2xl mb-14">
          Engage at the tier that matches your commitment.
        </p>
      </FadeIn>

      <div className="grid md:grid-cols-3 gap-6">
        {PILLARS.map((p, i) => (
          <FadeIn key={p.phase} delay={i * 0.08}>
            <div className="group h-full border border-foreground/15 bg-foreground/[0.03] p-8 flex flex-col">
              <div className="flex items-center justify-between mb-8">
                <span className="font-sans text-xs font-medium tracking-[0.18em] text-muted-foreground">
                  {p.phase}
                </span>
                <div className="p-2.5 border border-foreground/15 bg-foreground/5 group-hover:bg-foreground/10 transition-colors">
                  <p.icon className="w-5 h-5 text-primary" />
                </div>
              </div>
              <h3 className="text-2xl md:text-3xl font-serif font-medium mb-4">{p.title}</h3>
              <p className="text-sm text-muted-foreground font-light leading-relaxed mb-8">
                {p.summary}
              </p>
              <ul className="mt-auto pt-6 border-t border-foreground/10 space-y-3">
                {p.points.map((pt) => (
                  <li
                    key={pt}
                    className="flex items-start gap-3 text-sm font-light text-foreground/80"
                  >
                    <Check className="w-3.5 h-3.5 mt-1 text-primary shrink-0" />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>
          </FadeIn>
        ))}
      </div>
    </div>
  </section>
);

/* --------------------------------------------------------- Case studies --- */

const CASE_PREVIEWS = [
  {
    eyebrow: "Custom Application",
    headline: "High-volume scheduling, rebuilt as one web app.",
    blurb:
      "Product design, data architecture, an AI enrichment layer, and training — shipped and rolled out across a client base.",
    metrics: [
      { label: "Kickoff to prod", value: "8 wks" },
      { label: "Reporting time", value: "−94%" },
      { label: "Rolled out", value: "40+" },
    ],
  },
  {
    eyebrow: "Workflow Automation",
    headline: "Earnings-call scripts, from 3 hours to 20 minutes.",
    blurb:
      "An automated pipeline that reads the same sources the team did, applies the house style, and drafts in management's voice — numbers right by construction.",
    metrics: [
      { label: "Cycle time", value: "3h → 20m" },
      { label: "Manual effort", value: "−90%" },
      { label: "Quality bar", value: "+25%" },
    ],
  },
] as const;

const CaseStudies = () => (
  <section
    id="work"
    className="scroll-mt-24 py-24 md:py-32 bg-foreground text-background overflow-hidden"
  >
    <div className="max-w-7xl mx-auto px-6">
      <FadeIn>
        <div className="flex items-center gap-3 mb-6">
          <div className="h-[1px] w-12 bg-background/40" />
          <span className="section-label !text-background/85">Case Studies</span>
        </div>
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between mb-14">
          <h2 className="text-3xl md:text-5xl font-serif leading-[1.06] max-w-2xl">
            Outcomes we've delivered.
          </h2>
          <Link
            href="/case-studies"
            className="group inline-flex items-center gap-2 text-sm text-background/70 hover:text-background transition-colors shrink-0"
          >
            All case studies
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </FadeIn>

      <div className="grid md:grid-cols-2 gap-6">
        {CASE_PREVIEWS.map((c, i) => (
          <FadeIn key={c.headline} delay={i * 0.08}>
            <Link
              href="/case-studies"
              className="group flex h-full flex-col border border-background/20 p-8 md:p-10 hover:bg-background/[0.04] transition-colors"
            >
              <div className="flex items-center justify-between mb-6">
                <span className="text-[10px] uppercase tracking-[0.18em] text-background/55 font-sans">
                  {c.eyebrow}
                </span>
                <ArrowUpRight className="w-5 h-5 text-background/40 transition-all group-hover:text-background group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
              <h3 className="text-2xl md:text-3xl font-serif leading-tight mb-4">{c.headline}</h3>
              <p className="text-sm text-background/65 font-light leading-relaxed mb-8">
                {c.blurb}
              </p>
              <dl className="mt-auto grid grid-cols-3 gap-4 pt-8 border-t border-background/15">
                {c.metrics.map((m) => (
                  <div key={m.label}>
                    <dt className="text-[10px] uppercase tracking-[0.13em] text-background/45 font-sans">
                      {m.label}
                    </dt>
                    <dd className="text-xl md:text-2xl font-serif mt-1.5">{m.value}</dd>
                  </div>
                ))}
              </dl>
            </Link>
          </FadeIn>
        ))}
      </div>
    </div>
  </section>
);

/* ------------------------------------------------------------- Products --- */

const Products = () => (
  <section id="products" className="scroll-mt-24 py-24 md:py-28 border-b border-foreground/10">
    <div className="max-w-7xl mx-auto px-6">
      <FadeIn>
        <div className="flex items-center gap-3 mb-8">
          <div className="h-[1px] w-12 bg-primary" />
          <span className="section-label">Products</span>
        </div>
        <h2 className="text-3xl md:text-5xl font-serif leading-[1.08] mb-5 max-w-2xl">
          Tools we ship and run.
        </h2>
        <p className="text-base md:text-lg text-muted-foreground font-light leading-relaxed max-w-2xl mb-14">
          Where a repeatable problem deserves a repeatable tool, we build and host it — and
          deploy it into your tenant.
        </p>
      </FadeIn>

      <div className="grid md:grid-cols-3 gap-6">
        <FadeIn className="md:col-span-2">
          <Link
            href="/sec"
            className="group flex h-full flex-col border border-foreground/15 bg-foreground/[0.03] p-8 md:p-10 hover:bg-foreground/[0.05] transition-colors"
          >
            <div className="flex items-start justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 border border-foreground/15 bg-foreground/5">
                  <Terminal className="w-5 h-5 text-primary" />
                </div>
                <span className="section-label">SEC MCP</span>
              </div>
              <ArrowUpRight className="w-5 h-5 text-foreground/30 transition-all group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
            <h3 className="text-2xl md:text-3xl font-serif mb-4">
              SEC filings, structured for agents.
            </h3>
            <p className="text-sm md:text-base text-muted-foreground font-light leading-relaxed max-w-xl">
              An MCP server and CLI that pull SEC EDGAR data accurately — filings, structured
              and verbatim financials, insider activity, ownership, segment revenue, and
              issuer-tagged XBRL KPIs. Drops into Claude Desktop, runs hosted, and pipes
              cleanly into shell tools.
            </p>
            <dl className="mt-8 pt-8 border-t border-foreground/10 grid grid-cols-3 gap-4">
              <div>
                <dt className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-sans">
                  Tools
                </dt>
                <dd className="text-xl md:text-2xl font-serif mt-1.5">19</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-sans">
                  Transports
                </dt>
                <dd className="text-base font-serif mt-1.5">stdio · HTTP</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-sans">
                  Returns
                </dt>
                <dd className="text-base font-serif mt-1.5">Structured</dd>
              </div>
            </dl>
          </Link>
        </FadeIn>

        <FadeIn delay={0.08}>
          <div className="flex h-full flex-col border border-dashed border-foreground/20 p-8 md:p-10">
            <div>
              <span className="section-label">In the works</span>
              <h3 className="text-2xl md:text-3xl font-serif mt-4 mb-4">More on the way.</h3>
              <p className="text-sm text-muted-foreground font-light leading-relaxed">
                We're benchmarking models on real workloads and packaging the tooling our
                deployments rely on. Have a problem worth a product?
              </p>
            </div>
            <div className="flex-1 my-6" aria-hidden="true">
              <svg viewBox="0 0 160 80" className="w-full opacity-[0.12]" fill="currentColor">
                {[0, 1, 2, 3, 4, 5, 6, 7].flatMap((col) =>
                  [0, 1, 2, 3].map((row) => (
                    <circle key={`${col}-${row}`} cx={10 + col * 20} cy={10 + row * 20} r={2.5} />
                  ))
                )}
              </svg>
            </div>
            <a
              href={mailto("Product idea — DeerPark")}
              className="group inline-flex items-center gap-2 text-sm text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground transition-colors"
            >
              Tell us about it
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>
        </FadeIn>
      </div>
    </div>
  </section>
);

/* ------------------------------------------------------------------ CTA --- */

const CallToAction = () => (
  <section className="py-24 md:py-32 bg-card">
    <div className="max-w-3xl mx-auto px-6 text-center">
      <FadeIn>
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="h-[1px] w-12 bg-primary" />
          <span className="section-label">Get started</span>
          <div className="h-[1px] w-12 bg-primary" />
        </div>
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-serif leading-[1.05] mb-6 pb-1">
          Let's find where AI pays back fastest.
        </h2>
        <p className="text-base md:text-lg text-muted-foreground font-light leading-relaxed mb-10 max-w-xl mx-auto">
          Tell us about your workflows. We'll map the highest-leverage opportunities and show
          you what a first deployment looks like — concrete scope, timeline, and expected
          return. No obligation.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <a
            href={mailto("Intro call — DeerPark")}
            className="group inline-flex items-center justify-center gap-2 rounded-full bg-foreground text-background px-8 py-4 text-base font-medium tracking-wide hover:bg-foreground/85 transition-colors"
          >
            Schedule a call
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </a>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-sm text-muted-foreground font-light hover:text-foreground transition-colors"
          >
            or email {CONTACT_EMAIL}
          </a>
        </div>
      </FadeIn>
    </div>
  </section>
);

/* ----------------------------------------------------------------- Page --- */

export default function Home() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground selection:bg-foreground selection:text-background">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Approach />
        <CaseStudies />
        <Products />
        <CallToAction />
      </main>
      <SiteFooter />
    </div>
  );
}
