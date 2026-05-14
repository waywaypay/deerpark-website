import React, { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, ChevronLeft, ChevronRight, ScanSearch, Layers, GraduationCap, Rocket, Check, Plus, Minus, MapPin, Mic, FolderInput, Sparkles, Files } from "lucide-react";
import { ConsultCTA, FadeIn, Navbar, Footer, ConsultationFAB } from "@/components/site-layout";

const TICKER_ITEMS = [
  "AI Readiness Assessment",
  "Workflow Diagnostic & Mapping",
  "Custom AI Application Development",
  "Executive AI Briefings",
  "Team Training & Workshops",
  "Process Automation",
  "Change Management",
  "Tool & Vendor Evaluation",
  "Hands-On Enablement",
];

const Hero = () => {
  return (
    <section className="relative min-h-[100dvh] flex flex-col justify-between pt-24 overflow-hidden">
      <div className="absolute inset-0 z-0" style={{
        background: "radial-gradient(ellipse 70% 80% at 80% 50%, rgba(255,255,255,0.06) 0%, transparent 65%)"
      }} />
      <div className="absolute inset-0 z-0 opacity-[0.06]" style={{
        backgroundImage: "repeating-linear-gradient(120deg, rgba(255,255,255,0.8) 0px, rgba(255,255,255,0.8) 1px, transparent 1px, transparent 60px)"
      }} />

      <div className="max-w-7xl relative z-10 mx-auto px-6 flex-1 flex items-center">
        <div className="w-full max-w-3xl pt-16 pb-12">
          <FadeIn>
            <div className="flex items-center gap-3 mb-12">
              <div className="h-[1px] w-10 bg-foreground/30" />
              <span className="section-label">AI Enablement for Organizations</span>
            </div>
          </FadeIn>

          <FadeIn delay={0.1}>
            <h1 className="text-5xl md:text-[4.75rem] font-serif leading-[1.1] mb-8 pb-1">
              <em className="not-italic font-light">From AI curious to AI capable.</em>
            </h1>
          </FadeIn>

          <FadeIn delay={0.2}>
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-md mb-10 font-sans font-light">
              We help organizations get ready for AI, build the applications their teams need, and train their people to run them.
            </p>
          </FadeIn>

          <FadeIn delay={0.3} className="mb-14">
            <div className="flex flex-col sm:flex-row gap-4">
              <ConsultCTA
                source="hero"
                className="inline-flex items-center justify-center gap-2 rounded-none h-14 px-8 text-sm font-medium uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90 transition-colors"
              >
                Free Consult <ArrowRight className="ml-2 w-4 h-4" />
              </ConsultCTA>
              <a href="#engagements">
                <Button variant="outline" size="lg" className="rounded-none h-14 px-8 text-sm uppercase tracking-widest border-foreground/25 hover:bg-foreground/5">
                  See Our Work
                </Button>
              </a>
            </div>
            <p className="mt-5 text-sm text-muted-foreground font-light hidden md:block">
              Or email us:{" "}
              <a
                href="mailto:contact@deerpark.io"
                className="text-foreground underline underline-offset-4 hover:text-foreground/70"
              >
                contact@deerpark.io
              </a>
            </p>
          </FadeIn>

          <FadeIn delay={0.4}>
            <div className="flex gap-8 border-t border-foreground/15 pt-8">
                {[
                { stat: "90 days", label: "from readiness review to live rollout" },
                { stat: "−90%", label: "manual effort on shipped workflows" },
                { stat: "+25%", label: "lift in output quality vs baseline LLM workflows" },
              ].map(({ stat, label }) => (
                <div key={stat}>
                  <div className="text-2xl font-serif text-foreground mb-1">{stat}</div>
                  <div className="text-xs text-muted-foreground font-sans leading-snug max-w-[100px]">{label}</div>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </div>

      <div className="relative z-10 border-t border-foreground/15 py-4 overflow-hidden bg-background/60 backdrop-blur-sm">
        <div className="flex animate-marquee">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i} className="section-label flex items-center gap-3 shrink-0 px-8">
              <span className="w-1.5 h-1.5 rounded-full bg-foreground/30 inline-block" />
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};

const Problem = () => (
  <section className="py-32 bg-card relative">
    <div className="max-w-7xl mx-auto px-6">
      <div className="grid md:grid-cols-2 gap-16 items-center">
        <div>
          <FadeIn>
            <h2 className="text-5xl md:text-[4.75rem] font-serif leading-[1.1] mb-8 pb-1">
              <em className="not-italic font-light">AI rollouts often stall</em>
            </h2>
            <p className="text-lg text-muted-foreground mb-6 font-light leading-relaxed">
              because models like those offered by ChatGPT and Claude are too general and need to be customized. Small teams lack the time or expertise to integrate them into daily work.
            </p>
            <p className="text-lg text-muted-foreground font-light leading-relaxed">
              Deer Park provides the hands-on partnership. We run the work end-to-end: we <span className="text-foreground">assess</span> where AI can drive the biggest gains, <span className="text-foreground">build</span> custom applications and integrations, <span className="text-foreground">deploy</span> with your team, and provide <span className="text-foreground">training</span> until the new, efficient way is your standard.
            </p>
          </FadeIn>
        </div>
        <FadeIn delay={0.15}>
          <div className="border border-foreground/15 bg-background p-10 lg:p-12">
            <div className="section-label mb-4">Client Benchmark</div>
            <div className="text-6xl md:text-7xl font-serif leading-none mb-4">90%</div>
            <p className="text-base text-muted-foreground font-light leading-relaxed mb-10 max-w-sm">
              reduction in manual effort on a recurring quarterly workflow after the first deployment.
            </p>
            <dl className="pt-8 border-t border-foreground/15">
              <div>
                <dt className="text-xs uppercase tracking-[0.15em] text-muted-foreground mb-2">Cycle time</dt>
                <dd className="text-2xl md:text-3xl font-serif">3 hours &rarr; 20 minutes</dd>
              </div>
            </dl>
          </div>
        </FadeIn>
      </div>
    </div>
  </section>
);

const SERVICE_PILLARS = [
  {
    phase: "01",
    title: "Assess",
    icon: ScanSearch,
    summary: "We review your organization's AI readiness and surface the workflows where AI pays back fastest.",
    services: [
      "AI Readiness Assessment",
      "Workflow Diagnostic & Mapping",
      "Tool & Vendor Evaluation",
    ],
  },
  {
    phase: "02",
    title: "Build",
    icon: Layers,
    summary: "We design and ship the applications, automations, and integrations your team needs to get the work done.",
    services: [
      "Custom AI Application Development",
      "Process Automation",
      "System Integration",
    ],
  },
  {
    phase: "03",
    title: "Deploy",
    icon: Rocket,
    summary: "We run the rollout with your team, support change management, and hand over a system your people own.",
    services: [
      "Rollout & Change Management",
      "Runbooks & Governance",
      "30-Day On-Call Support",
    ],
  },
  {
    phase: "04",
    title: "Train",
    icon: GraduationCap,
    summary: "We train your organization end-to-end — from executive briefings to hands-on workshops so every role knows how to use what we build.",
    services: [
      "Executive AI Briefings",
      "Role-Based Workshops",
      "Hands-On Team Enablement",
    ],
  },
];

const TIMELINE_PHASES: { phase: string; title: string; icon: typeof ScanSearch; start: number; span: number }[] = [
  { phase: "01", title: "Assess", icon: ScanSearch, start: 1, span: 2 },
  { phase: "02", title: "Build", icon: Layers, start: 3, span: 6 },
  { phase: "03", title: "Deploy", icon: Rocket, start: 9, span: 5 },
  { phase: "04", title: "Train", icon: GraduationCap, start: 1, span: 13 },
];

const Services = () => (
  <section id="approach" className="py-32 border-t border-foreground/10">
    <div className="max-w-7xl mx-auto px-6">
      <FadeIn>
        <div className="flex items-center gap-3 mb-16">
          <div className="h-[1px] w-12 bg-primary"></div>
          <span className="section-label">Services · Our Approach</span>
        </div>
        <h2 className="text-4xl md:text-6xl font-serif mb-6 max-w-3xl">Four pillars. One continuous engagement.</h2>
        <p className="text-lg text-muted-foreground font-light max-w-2xl mb-4">
          Every engagement moves through assessment, build, deployment, and training — each pillar rolls up specific practice areas your organization will see on the plan.
        </p>
        <p className="text-sm text-muted-foreground/80 font-light max-w-2xl mb-12 italic">
          <span className="text-foreground/80 not-italic font-medium">Services</span> are how we work with your team end-to-end. <span className="text-foreground/80 not-italic font-medium">Products</span> (below) are AI agents you can subscribe to or buy outright.
        </p>
      </FadeIn>

      <FadeIn delay={0.1}>
        <div className="hidden md:block mb-20 border border-foreground/15 bg-foreground/[0.02] p-8">
          <div className="flex items-baseline justify-between mb-6">
            <span className="section-label">Engagement timeline</span>
            <span className="text-xs uppercase tracking-[0.15em] text-muted-foreground font-sans">90 days · kickoff to handoff</span>
          </div>
          <div className="grid grid-cols-[repeat(13,minmax(0,1fr))] gap-px mb-3 border-b border-foreground/10 pb-3">
            {Array.from({ length: 13 }, (_, i) => (
              <div key={i} className="text-center">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-sans">Wk</div>
                <div className="text-sm font-serif text-foreground">{i + 1}</div>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {TIMELINE_PHASES.map((p) => (
              <div key={p.phase} className="grid grid-cols-[repeat(13,minmax(0,1fr))] gap-px">
                <div
                  className="h-10 bg-foreground/[0.06] border border-foreground/10 flex items-center gap-3 px-4 hover:bg-foreground/[0.1] transition-colors"
                  style={{ gridColumnStart: p.start, gridColumnEnd: p.start + p.span }}
                >
                  <p.icon className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground font-sans">{p.phase}</span>
                  <span className="text-sm font-serif text-foreground">{p.title}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </FadeIn>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
        {SERVICE_PILLARS.map((pillar, i) => (
          <FadeIn key={pillar.phase} delay={i * 0.1}>
            <div className="group h-full border border-foreground/15 bg-foreground/[0.03] p-8 hover:bg-white/[0.04] transition-colors flex flex-col">
              <div className="flex items-center justify-between mb-8">
                <span className="font-sans text-xs font-medium tracking-[0.15em] text-muted-foreground uppercase">{pillar.phase}</span>
                <div className="p-3 border border-foreground/15 bg-foreground/5 group-hover:bg-foreground/15 transition-colors">
                  <pillar.icon className="w-5 h-5 text-primary" />
                </div>
              </div>
              <h3 className="text-3xl md:text-4xl font-serif mb-4">{pillar.title}</h3>
              <p className="text-muted-foreground font-light leading-relaxed text-sm mb-8">
                {pillar.summary}
              </p>
              <div className="mt-auto pt-6 border-t border-foreground/10">
                <p className="section-label mb-4">Practice areas</p>
                <ul className="space-y-3">
                  {pillar.services.map((service) => (
                    <li key={service} className="flex items-start gap-3 text-sm font-light text-foreground/80">
                      <Check className="w-3.5 h-3.5 mt-1 text-primary shrink-0" />
                      <span>{service}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </FadeIn>
        ))}
      </div>
    </div>
  </section>
);

type CaseStudyData = {
  id: string;
  eyebrow: string;
  headline: string;
  intro: string[];
  before: string;
  after: string;
  metrics: { label: string; value: string }[];
  delivered: { label: string; detail: string }[];
  outcome: React.ReactNode;
  mockup?: React.ReactNode;
  narrativeOnly?: boolean;
  diagram?: React.ReactNode;
};

const SCHEDULE_MEETINGS = [
  {
    time: "9:30 AM",
    title: "Q1 Review",
    location: "The Carlyle · Penthouse",
    attendees: 3,
    accent: false,
  },
  {
    time: "11:00 AM",
    title: "Strategy Brief",
    location: "Aman, Library Room",
    attendees: 4,
    accent: false,
  },
  {
    time: "2:00 PM",
    title: "Investor Update",
    location: "500 5th Ave · Floor 42",
    attendees: 2,
    accent: true,
  },
  {
    time: "4:30 PM",
    title: "Portfolio Sync",
    location: "The Lambs Club",
    attendees: 6,
    accent: false,
  },
] as const;

const SchedulingPhoneMockup = () => (
  <div className="relative w-full">
    <div className="relative aspect-[9/19.5] rounded-[2.75rem] bg-neutral-900 p-[10px] shadow-[0_25px_60px_-10px_rgba(0,0,0,0.55)] ring-1 ring-background/10">
      <div className="relative h-full w-full rounded-[2.1rem] overflow-hidden bg-background text-foreground">
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-[5.25rem] h-6 bg-neutral-900 rounded-full z-20" />
        <div className="flex items-center justify-between px-6 pt-3.5 pb-2.5 text-[10px] font-sans font-medium">
          <span>9:41</span>
          <span className="opacity-40">•••</span>
        </div>
        <div className="px-5 pt-2 pb-3 border-b border-foreground/10 flex items-end justify-between gap-2">
          <div>
            <div className="text-[8px] uppercase tracking-[0.2em] text-foreground/50 font-sans">Tuesday</div>
            <div className="text-[15px] font-serif mt-0.5 leading-tight">Mar 12, 2026</div>
          </div>
          <div className="text-[8px] uppercase tracking-[0.15em] text-foreground/45 font-sans pb-0.5">4 mtgs</div>
        </div>
        <div className="p-2.5 space-y-2">
          {SCHEDULE_MEETINGS.map((m) => (
            <div
              key={m.time}
              className={`border rounded-md p-2.5 ${
                m.accent ? "border-primary/40 bg-primary/5" : "border-foreground/10 bg-foreground/[0.02]"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-[10px] font-serif font-medium leading-tight truncate">{m.title}</div>
                <div className="text-[8px] font-sans tabular-nums text-foreground/55 shrink-0">{m.time}</div>
              </div>
              <div className="mt-1.5 flex items-center gap-1 text-[8px] text-foreground/55 font-sans">
                <MapPin className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate">{m.location}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <div className="flex -space-x-1">
                  {Array.from({ length: Math.min(m.attendees, 3) }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-3.5 h-3.5 rounded-full border border-background ${
                        m.accent ? "bg-primary/30" : "bg-foreground/15"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-[8px] text-foreground/45 font-sans">{m.attendees} attendees</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const INVESTOR_HOLDINGS = [
  { q: "Q1 '24", v: 1.2 },
  { q: "Q2 '24", v: 1.4 },
  { q: "Q3 '24", v: 1.6 },
  { q: "Q4 '24", v: 2.1 },
  { q: "Q1 '25", v: 2.4 },
  { q: "Q2 '25", v: 2.8 },
] as const;

const INVESTOR_ACTIVITY = [
  { label: "Added 400K shares", when: "Jun" },
  { label: "Joined Q1 earnings call", when: "May" },
  { label: "Published sector note", when: "Apr" },
] as const;

const InvestorPhoneMockup = () => {
  const values = INVESTOR_HOLDINGS.map((h) => h.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = INVESTOR_HOLDINGS.map((h, i) => {
    const x = (i / (INVESTOR_HOLDINGS.length - 1)) * 100;
    const y = 100 - ((h.v - min) / range) * 100;
    return [x, y] as const;
  });
  const polyline = points.map((p) => `${p[0]},${p[1]}`).join(" ");
  const area = `M 0,100 L ${polyline.replace(/ /g, " L ")} L 100,100 Z`;
  const last = points[points.length - 1];

  return (
    <div className="relative w-full">
      <div className="relative aspect-[9/19.5] rounded-[2.75rem] bg-neutral-900 p-[10px] shadow-[0_25px_60px_-10px_rgba(0,0,0,0.55)] ring-1 ring-background/10">
        <div className="relative h-full w-full rounded-[2.1rem] overflow-hidden bg-background text-foreground">
          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-[5.25rem] h-6 bg-neutral-900 rounded-full z-20" />
          <div className="flex items-center justify-between px-6 pt-3.5 pb-2.5 text-[10px] font-sans font-medium">
            <span>9:41</span>
            <span className="opacity-40">•••</span>
          </div>
          <div className="px-5 pt-2 pb-3 border-b border-foreground/10">
            <div className="flex items-baseline justify-between">
              <div className="text-[8px] uppercase tracking-[0.2em] text-foreground/50 font-sans">2:00 PM Brief</div>
              <div className="text-[8px] uppercase tracking-[0.18em] text-primary font-sans">Live</div>
            </div>
            <div className="flex items-center gap-2.5 mt-2">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/40 to-foreground/15 flex items-center justify-center text-[10px] font-serif text-foreground/85 shrink-0">
                HV
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-serif leading-tight truncate">Helena Vance</div>
                <div className="text-[8px] text-foreground/55 font-sans truncate">Aurelian Capital · PM</div>
              </div>
            </div>
            <div className="mt-2 inline-flex items-center gap-1 text-[8px] font-sans text-primary bg-primary/10 border border-primary/25 px-1.5 py-0.5 rounded-sm">
              <span className="w-1 h-1 rounded-full bg-primary" />
              w/ CEO + CFO
            </div>
          </div>
          <div className="p-2.5 space-y-2">
            <div className="border border-foreground/10 rounded-md p-2.5 bg-foreground/[0.02]">
              <div className="flex items-baseline justify-between">
                <div className="text-[8px] uppercase tracking-[0.15em] text-foreground/45 font-sans">Position</div>
                <div className="text-[8px] font-sans tabular-nums text-primary">+133% YoY</div>
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <div className="text-[14px] font-serif tabular-nums leading-none">2.8M</div>
                <div className="text-[8px] text-foreground/50 font-sans">shares · 1.4% float</div>
              </div>
              <div className="mt-2 relative h-9 text-primary">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
                  <path d={area} fill="currentColor" opacity={0.12} />
                  <polyline
                    points={polyline}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle cx={last[0]} cy={last[1]} r={2.5} fill="currentColor" />
                </svg>
              </div>
              <div className="flex justify-between text-[7px] font-sans text-foreground/40 tabular-nums mt-1">
                <span>{INVESTOR_HOLDINGS[0].q}</span>
                <span>{INVESTOR_HOLDINGS[INVESTOR_HOLDINGS.length - 1].q}</span>
              </div>
            </div>
            <div className="border border-foreground/10 rounded-md p-2.5">
              <div className="text-[8px] uppercase tracking-[0.15em] text-foreground/45 font-sans">Recent Activity</div>
              <div className="mt-1.5 space-y-1">
                {INVESTOR_ACTIVITY.map((a) => (
                  <div key={a.label} className="flex items-baseline justify-between gap-2 text-[9px] font-sans">
                    <span className="text-foreground/75 truncate">{a.label}</span>
                    <span className="text-foreground/40 tabular-nums shrink-0">{a.when}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="border border-primary/30 bg-primary/5 rounded-md p-2.5">
              <div className="text-[8px] uppercase tracking-[0.15em] text-primary/80 font-sans">Talking Point</div>
              <div className="mt-1 text-[9.5px] font-serif leading-snug text-foreground/85">
                Concerned about EU margin compression. Likely to push on FX hedge strategy.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const SchedulingMockups = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const total = 2;

  return (
    <div>
      <div className="flex flex-col items-center">
        <div className={`w-full max-w-[260px] ${activeIndex === 0 ? "" : "hidden"}`}>
          <SchedulingPhoneMockup />
        </div>
        <div className={`w-full max-w-[260px] ${activeIndex === 1 ? "" : "hidden"}`}>
          <InvestorPhoneMockup />
        </div>
      </div>
      <div className="flex items-center justify-center gap-3 mt-6">
        <button
          type="button"
          onClick={() => setActiveIndex((i) => (i - 1 + total) % total)}
          aria-label="Previous mockup"
          className="w-9 h-9 border border-background/25 text-background/70 hover:border-background/70 hover:text-background hover:bg-background/5 flex items-center justify-center transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveIndex(i)}
              aria-label={`Show mockup ${i + 1}`}
              aria-pressed={i === activeIndex}
              className={`h-1.5 rounded-full transition-all ${
                i === activeIndex ? "w-6 bg-background" : "w-1.5 bg-background/30"
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setActiveIndex((i) => (i + 1) % total)}
          aria-label="Next mockup"
          className="w-9 h-9 border border-background/25 text-background/70 hover:border-background/70 hover:text-background hover:bg-background/5 flex items-center justify-center transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

const PR_WORKFLOW_STEPS = [
  {
    icon: Mic,
    label: "Kick-off",
    detail: "The quarterly client call is captured — transcript and notes ready for the workflow.",
  },
  {
    icon: FolderInput,
    label: "Ingest",
    detail: "Files auto-route into the project folder. No manual handoff.",
  },
  {
    icon: Sparkles,
    label: "Skill",
    detail: "A custom Claude Skill triggers, running ingestion through draft assembly end-to-end.",
  },
  {
    icon: Files,
    label: "Publish",
    detail: "A formatted doc and presentation are produced, ready for review.",
  },
] as const;

const PRWorkflowDiagram = () => (
  <div className="border border-background/20 p-6 md:p-10">
    <div className="flex items-baseline justify-between gap-4 mb-8">
      <div className="section-label !text-background/60">How it runs</div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-background/40 font-sans">
        Quarterly · automated
      </div>
    </div>
    <ol className="relative">
      {PR_WORKFLOW_STEPS.map((step, i) => {
        const Icon = step.icon;
        const last = i === PR_WORKFLOW_STEPS.length - 1;
        return (
          <li
            key={step.label}
            className="relative grid grid-cols-[auto_1fr] gap-5 md:gap-7 pb-9 last:pb-0"
          >
            {!last && (
              <div className="absolute left-[1.125rem] md:left-[1.375rem] top-10 md:top-12 bottom-1 w-px bg-background/15" />
            )}
            <div className="relative w-9 h-9 md:w-11 md:h-11 rounded-full border border-background/30 bg-foreground flex items-center justify-center text-primary shrink-0">
              <Icon className="w-4 h-4 md:w-5 md:h-5" aria-hidden />
            </div>
            <div className="min-w-0 pt-1.5 md:pt-2">
              <div className="flex items-baseline gap-3 mb-1.5">
                <span className="font-sans text-[11px] tabular-nums text-background/40">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-background/55 font-sans">
                  {step.label}
                </span>
              </div>
              <div className="text-base md:text-lg font-serif text-background/90 leading-snug">
                {step.detail}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  </div>
);

const CASE_STUDIES: CaseStudyData[] = [
  {
    id: "scheduling-app",
    eyebrow: "Custom Application",
    headline: "One web app to manage high-volume management schedules.",
    mockup: <SchedulingMockups />,
    intro: [
      "A services operator was producing high-volume management schedules using Excel, manual research, and PDF delivery. Each schedule required ~4 hours of analyst time to compile attendee profiles from fragmented sources.",
      "We rebuilt the workflow as a structured system rather than a document process.",
      "The core shift was treating each attendee as a persistent data object — continuously enriched via automated ingestion (web sources, internal data) and summarized into standardized profiles. Scheduling logic and profile generation were integrated into a single web interface, with outputs rendered in a mobile-first format instead of static PDFs.",
      "We led the full build: product design, data architecture, AI enrichment layer, and internal training.",
      "Across production usage, time per schedule dropped from ~4 hours to ~15 minutes (~93% reduction), while increasing profile completeness and consistency. Following an internal demo, the operator deployed the system across a client base of 40+ accounts.",
    ],
    before:
      "Spreadsheets and group chats. Every manager losing hours each week to coverage edits and time-off back-and-forth.",
    after:
      "One web app. A single source of truth across every site, with AI handling the routine edits and conflict checks.",
    metrics: [
      { label: "Kickoff to prod", value: "8 wks" },
      { label: "Reporting time", value: "−94%" },
      { label: "Rolled out", value: "40+ clients" },
    ],
    delivered: [
      { label: "Product", detail: "One web app for high-volume management scheduling — replacing spreadsheets and group chats with a single clean view of who's doing what, and when, across every site." },
      { label: "Experience", detail: "Simple UI anyone can use, single sign-on, white-label theming for every client deployment." },
      { label: "AI & Automation", detail: "Smart shift suggestions, conflict detection, time-off handling, and natural-language edits — all behind plain-language controls." },
      { label: "Deployment", detail: "Shipped to the firm's own cloud with secure access, logging, and cost telemetry." },
      { label: "Training", detail: "Executive briefing, role-based workshops, and runbooks so every manager was live on day one." },
    ],
    outcome: (
      <>
        Shipped across <span className="text-background font-medium">40+ clients</span> after a successful demo. Time savings landed alongside higher output quality and measurably stronger client satisfaction.
      </>
    ),
  },
  {
    id: "workflow-automation",
    eyebrow: "Workflow Automation",
    headline: "Quarterly reporting, from 3 hours to 20 minutes.",
    narrativeOnly: true,
    diagram: <PRWorkflowDiagram />,
    intro: [
      "A team was producing recurring quarterly reports for clients — pulling from kick-off call notes, internal data, and prior-cycle context, then iterating through multiple review rounds. Each cycle consumed roughly 3 hours of senior time before the report went out the door.",
      "We rebuilt the reporting pipeline as an AI workflow with Skills integrated end-to-end across source ingestion, structured analysis, and draft assembly. Output quality measured 25% higher than the same workflow running on a baseline frontier model, and manual effort dropped by ~90% — 3 hours of hands-on work became 20 minutes of review. The team moved from drafting to reviewing — voice and judgment stayed human; the typing left.",
    ],
    before:
      "Hours per cycle of source review, structured note-taking, and drafting from scratch. Same shape every time — no leverage.",
    after:
      "Minutes per cycle of review on a polished, structured draft. Same quality bar, dramatically less time.",
    metrics: [
      { label: "Cycle time", value: "3h → 20min" },
      { label: "Manual effort", value: "−90%" },
      { label: "Quality bar", value: "held" },
    ],
    delivered: [
      { label: "Pipeline", detail: "Source ingestion, structured analysis, and draft assembly — running on the cadence the team sets, with full audit trail on every output." },
      { label: "Quality", detail: "Same review bar at the end. The pipeline drafts; the team owns the publish decision and tunes the prompts when standards shift." },
      { label: "AI & Automation", detail: "Schedule-driven runs, model-agnostic, with cost and latency telemetry on every cycle so the team can swap models without us." },
      { label: "Deployment", detail: "Runs in the team's own cloud and on the team's own data. Logs, evals, and cost dashboards visible from day one." },
      { label: "Training", detail: "Walk-throughs and runbooks so the team can add new sources, adjust prompts, and rerun historical cycles without engineering support." },
    ],
    outcome: (
      <>
        What used to take <span className="text-background font-medium">3 hours of hands-on work is now 20 minutes of review</span>. The team kept full editorial control; the freed time went into deeper analysis and faster client turnaround.
      </>
    ),
  },
];

const CaseStudyBlock = ({ data }: { data: CaseStudyData }) => {
  const hasMockup = Boolean(data.mockup);
  const narrativeOnly = Boolean(data.narrativeOnly);

  if (narrativeOnly) {
    return (
      <div>
        <div className="grid lg:grid-cols-12 gap-12">
          <div className="min-w-0 lg:col-span-6">
            <div className="flex items-center gap-3 mb-8">
              <div className="h-[1px] w-12 bg-background/40"></div>
              <span className="section-label !text-background/85">Sample Engagement · {data.eyebrow}</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-serif leading-[1.05] mb-8 pb-1">
              {data.headline}
            </h2>
            <div className="space-y-5">
              {data.intro.map((para, i) => (
                <p key={i} className="text-background/70 font-light leading-relaxed">
                  {para}
                </p>
              ))}
            </div>
          </div>
          {data.diagram && (
            <div className="lg:col-span-6 min-w-0 flex items-start lg:pt-4">
              <div className="lg:sticky lg:top-32 w-full">{data.diagram}</div>
            </div>
          )}
        </div>
        <div className="mt-10 pt-8 border-t border-background/20 grid md:grid-cols-[auto_1fr] gap-x-8 gap-y-2 items-baseline">
          <div className="section-label !text-background/60">Outcome</div>
          <div className="text-lg md:text-xl font-serif text-background leading-snug">
            {data.outcome}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-12 gap-12">
      <div className={`min-w-0 ${hasMockup ? "lg:col-span-7" : "lg:col-span-4"}`}>
        <div className="flex items-center gap-3 mb-8">
          <div className="h-[1px] w-12 bg-background/40"></div>
          <span className="section-label !text-background/85">Sample Engagement · {data.eyebrow}</span>
        </div>
        <h2 className="text-4xl md:text-5xl font-serif leading-[1.05] mb-8 pb-1">
          {data.headline}
        </h2>
        <div className="space-y-5">
          {data.intro.map((para, i) => (
            <p key={i} className="text-background/70 font-light leading-relaxed">
              {para}
            </p>
          ))}
        </div>
        <div className="mt-10 border-t border-background/20 pt-8">
          {!hasMockup && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-background/15 border border-background/15 mb-6">
              <div className="bg-foreground p-5">
                <div className="text-[10px] uppercase tracking-[0.18em] text-background/40 mb-3 font-sans">Before</div>
                <div className="text-base font-serif text-background/55 leading-snug">{data.before}</div>
              </div>
              <div className="bg-foreground p-5">
                <div className="text-[10px] uppercase tracking-[0.18em] text-primary mb-3 font-sans">After</div>
                <div className="text-base font-serif text-background leading-snug">{data.after}</div>
              </div>
            </div>
          )}
          <dl className="grid grid-cols-3 gap-4">
            {data.metrics.map((m) => (
              <div key={m.label}>
                <dt className="text-[10px] uppercase tracking-[0.15em] text-background/40 font-sans">{m.label}</dt>
                <dd className="text-xl md:text-2xl font-serif mt-2">{m.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {hasMockup ? (
        <div className="lg:col-span-5 min-w-0 flex items-start justify-center lg:pt-4">
          <div className="lg:sticky lg:top-32 w-full max-w-[300px]">{data.mockup}</div>
        </div>
      ) : (
        <div className="lg:col-span-8 min-w-0">
          <div className="border border-background/20 p-8 lg:p-10">
            <div className="section-label !text-background/60 mb-6">What we delivered</div>
            <div className="divide-y divide-background/15">
              {data.delivered.map((s) => (
                <div key={s.label} className="grid grid-cols-12 gap-4 py-5 items-baseline">
                  <div className="col-span-12 md:col-span-3 text-sm text-background/70 font-light uppercase tracking-[0.12em]">{s.label}</div>
                  <div className="col-span-12 md:col-span-9 text-base md:text-lg font-serif text-background leading-snug">{s.detail}</div>
                </div>
              ))}
            </div>
            <div className="mt-8 pt-8 border-t border-background/15 grid md:grid-cols-[auto_1fr] gap-x-8 gap-y-2 items-baseline">
              <div className="section-label !text-background/60">Outcome</div>
              <div className="text-lg md:text-xl font-serif text-background leading-snug">
                {data.outcome}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const CaseStudy = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const total = CASE_STUDIES.length;
  const active = CASE_STUDIES[activeIndex];

  const goTo = (next: number) => {
    setDirection(next > activeIndex ? 1 : -1);
    setActiveIndex((next + total) % total);
  };
  const prev = () => goTo(activeIndex - 1);
  const next = () => goTo(activeIndex + 1);

  return (
    <section id="engagements" className="py-32 border-t border-foreground/15 bg-foreground text-background overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <div className="mb-12 pb-10 border-b border-background/15">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-[1px] w-12 bg-background/40" />
            <span className="section-label !text-background/85">Sample Engagements</span>
          </div>
          <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-4xl md:text-5xl font-serif leading-[1.05] mb-4">
                What an engagement can look like.
              </h2>
              <p className="text-background/65 font-light leading-relaxed">
                Representative builds — not fixed templates. Your scope, stack, and timeline will vary; we use these as blueprints for the kind of outcome you can expect.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
            {CASE_STUDIES.map((cs, i) => (
              <button
                key={cs.id}
                type="button"
                onClick={() => goTo(i)}
                aria-pressed={i === activeIndex}
                className={`px-4 py-2 text-[10px] uppercase tracking-[0.18em] font-sans border transition-colors ${
                  i === activeIndex
                    ? "border-background bg-background text-foreground"
                    : "border-background/25 text-background/60 hover:text-background hover:border-background/60"
                }`}
              >
                {cs.eyebrow}
              </button>
            ))}
            <div className="ml-2 flex items-center gap-1">
              <button
                type="button"
                onClick={prev}
                aria-label="Previous case study"
                className="w-10 h-10 border border-background/25 hover:border-background/70 hover:bg-background/5 flex items-center justify-center transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 text-xs font-light tabular-nums text-background/60">
                {activeIndex + 1} / {total}
              </span>
              <button
                type="button"
                onClick={next}
                aria-label="Next case study"
                className="w-10 h-10 border border-background/25 hover:border-background/70 hover:bg-background/5 flex items-center justify-center transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          </div>
        </div>

        <motion.div
          key={active.id}
          initial={{ opacity: 0, x: 24 * direction }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <CaseStudyBlock data={active} />
        </motion.div>
      </div>
    </section>
  );
};


type ProductCard = {
  href: string;
  name: string;
  status: "Live" | "In development";
  tagline: string;
  description: string;
  bullets: string[];
};

const PRODUCTS: ProductCard[] = [
  {
    href: "/dispatch",
    name: "Dispatch",
    status: "Live",
    tagline: "Daily AI brief for operators.",
    description:
      "An always-on agent that reads the public AI landscape — labs, clouds, model releases, community signal — and ships a single curated brief every weekday at 3:30 PM PT. The same agent can be tuned to any vertical your team needs to track.",
    bullets: [
      "Filters for enterprise-relevant releases and research",
      "Cites every claim — no hallucinated coverage",
      "Email + on-site archive",
      "Configurable for any industry — finance, biotech, logistics, defense",
    ],
  },
];

const Products = () => (
  <section id="products" className="py-32 border-t border-foreground/10 bg-card">
    <div className="max-w-7xl mx-auto px-6">
      <FadeIn>
        <div className="flex items-center gap-3 mb-8">
          <div className="h-[1px] w-12 bg-primary" />
          <span className="section-label">Products</span>
        </div>
        <h2 className="text-4xl md:text-6xl font-serif mb-6 max-w-3xl">
          Agents we build, host, and keep running.
        </h2>
        <p className="text-lg text-muted-foreground font-light max-w-2xl mb-4">
          Production AI agents from our practice — each solves a specific operator workflow,
          runs on our infrastructure, and improves as we tune it.
        </p>
        <p className="text-sm text-muted-foreground/80 font-light max-w-2xl mb-12 italic">
          Subscribe to one that's live, or have us build the one your team actually needs as part of an engagement.
        </p>
      </FadeIn>

      <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto md:max-w-none md:mx-0">
        {PRODUCTS.map((product, i) => (
          <FadeIn key={product.href} delay={i * 0.1}>
            <Link
              href={product.href}
              className="group block h-full border border-foreground/15 bg-background p-8 hover:bg-foreground/[0.03] transition-colors"
            >
              <div className="flex items-center justify-between mb-8">
                <span className="section-label">{product.status}</span>
                <div className="p-3 border border-foreground/15 bg-foreground/5 group-hover:bg-foreground/15 transition-colors">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
              </div>
              <h3 className="text-3xl md:text-4xl font-serif mb-3">{product.name}</h3>
              <p className="text-base text-foreground/80 font-light mb-4">{product.tagline}</p>
              <p className="text-sm text-muted-foreground font-light leading-relaxed mb-8">
                {product.description}
              </p>
              <ul className="space-y-3 mb-8">
                {product.bullets.map((b) => (
                  <li
                    key={b}
                    className="flex items-start gap-3 text-sm font-light text-foreground/80"
                  >
                    <ArrowRight className="w-3.5 h-3.5 mt-1 text-primary shrink-0" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <span className="inline-flex items-center text-xs uppercase tracking-widest text-foreground/80 group-hover:text-foreground">
                Open {product.name} <ArrowRight className="ml-2 w-3.5 h-3.5" />
              </span>
            </Link>
          </FadeIn>
        ))}
      </div>
    </div>
  </section>
);

const ABOUT_BELIEFS: { title: string; body: string }[] = [
  {
    title: "Operators, not vendors",
    body: "Every engagement is led by people who have shipped AI in production environments — not consultants flipping decks. We sit in your repo and your standup until the system runs.",
  },
  {
    title: "You own everything",
    body: "Code, prompts, evals, and data live in your accounts. We don't lock you into a runtime, a license, or a per-seat tax. The day we leave, your team is the system's owner.",
  },
  {
    title: "Outcomes, not output",
    body: "We measure ourselves on the metric that matters to you — cycle time, throughput, quality, cost — and tune the build until it moves. Activity is not the goal.",
  },
];

const About = () => (
  <section id="about" className="py-32 border-t border-foreground/10">
    <div className="max-w-7xl mx-auto px-6">
      <div className="grid lg:grid-cols-12 gap-12">
        <FadeIn className="lg:col-span-5">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-[1px] w-12 bg-primary" />
            <span className="section-label">About DeerPark</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-serif leading-[1.05] mb-6">
            We were the AI team inside operating companies before we were a firm.
          </h2>
          <p className="text-lg text-muted-foreground font-light leading-relaxed mb-6">
            DeerPark builds AI inside organizations the way an internal team would — close to the workflow, accountable to the metric, transparent on cost. We started this firm to do that work end-to-end for teams who don't have a frontier-AI bench in-house.
          </p>
          <p className="text-base text-muted-foreground font-light leading-relaxed mb-8">
            <span className="text-foreground/80 italic">[Founders / team bio paragraph — TBD]</span>
          </p>
          <a
            href="mailto:contact@deerpark.io"
            className="inline-flex items-center gap-2 text-sm text-foreground hover:text-foreground/70 transition-colors"
          >
            <span className="underline underline-offset-4">Get in touch</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </FadeIn>

        <FadeIn delay={0.1} className="lg:col-span-7">
          <div className="border border-foreground/15 bg-card divide-y divide-foreground/10">
            {ABOUT_BELIEFS.map((b, i) => (
              <div key={b.title} className="p-8 md:p-10 grid grid-cols-[auto_1fr] gap-6">
                <span className="font-sans text-xs font-semibold tabular-nums text-muted-foreground tracking-[0.18em] pt-2">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="text-xl md:text-2xl font-serif mb-3">{b.title}</h3>
                  <p className="text-muted-foreground font-light leading-relaxed">
                    {b.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </FadeIn>
      </div>
    </div>
  </section>
);

const FAQ_ITEMS = [
  {
    q: "Do you train our team, or just build the tool?",
    a: "Both, and the training is not an afterthought. Every engagement includes executive briefings, role-based workshops, and hands-on training on the application we ship — scoped in week one and running alongside the build so your team is live the day we hand over.",
  },
  {
    q: "Our team isn't technical. Is this for us?",
    a: "Yes. We work with organizations at every level of AI maturity. Our engagements are designed for operations, ops leadership, and domain teams — we handle the technical build, then train your people in plain language on the workflows they actually run.",
  },
  {
    q: "Who owns the code and prompts?",
    a: "You do. We deliver everything in your repositories, on your cloud accounts, under your licenses. No per-seat AI tax and no DeerPark runtime dependency.",
  },
  {
    q: "What about data security and compliance?",
    a: "We deploy inside your VPC or cloud tenant, use your existing IAM, and route through vetted model providers. We have worked in FINRA-adjacent environments and on systems with healthcare and enterprise compliance requirements.",
  },
  {
    q: "Which models do you use?",
    a: "Model-agnostic. We benchmark the top-tier frontier models plus one or two open-weight options against your actual evals and pick based on cost, latency, and accuracy — not brand.",
  },
  {
    q: "What happens after the engagement ends?",
    a: "Your team owns the system. We provide runbooks, eval suites, and a 30-day on-call window. Optional quarterly reviews are available but never required.",
  },
  {
    q: "Do you replace my existing vendors?",
    a: "Only if they are underperforming. Most engagements augment your current stack — we build the agents and glue, and keep you on the SaaS tools your team already trusts.",
  },
];

const FAQ = () => {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="py-32 border-t border-foreground/10 bg-background">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-12 gap-12">
          <FadeIn className="lg:col-span-4">
            <div className="flex items-center gap-3 mb-8">
              <div className="h-[1px] w-12 bg-primary"></div>
              <span className="section-label">FAQ</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-serif leading-[1.05] mb-6">
              Questions we field on every first call.
            </h2>
            <p className="text-muted-foreground font-light leading-relaxed">
              Not seeing yours? <a href="mailto:contact@deerpark.io" className="text-foreground underline underline-offset-4 hover:text-foreground/70">Email us directly</a> — we reply within one business day.
            </p>
          </FadeIn>
          <FadeIn delay={0.1} className="lg:col-span-8">
            <div className="border-t border-foreground/15">
              {FAQ_ITEMS.map((item, i) => {
                const isOpen = open === i;
                return (
                  <div key={item.q} className="border-b border-foreground/15">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpen(isOpen ? null : i)}
                      className="w-full flex items-center justify-between gap-6 py-6 text-left group"
                    >
                      <span className="text-lg md:text-xl font-serif text-foreground group-hover:text-foreground/80 transition-colors">
                        {item.q}
                      </span>
                      <span className="shrink-0 p-2 border border-foreground/15 group-hover:border-foreground/40 transition-colors">
                        {isOpen ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="pb-6 pr-12 text-muted-foreground font-light leading-relaxed">
                        {item.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
};


export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-foreground selection:text-background">
      <Navbar />
      <main>
        <Hero />
        <Problem />
        <Services />
        <Products />
        <CaseStudy />
        <About />
        <FAQ />
      </main>
      <ConsultationFAB />
      <Footer />
    </div>
  );
}
