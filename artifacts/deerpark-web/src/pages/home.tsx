import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, ChevronLeft, ChevronRight, ScanSearch, Layers, GraduationCap, Rocket, Check, Plus, Minus, Calendar, MapPin, Mic, FolderInput, Sparkles, Files, RotateCcw } from "lucide-react";
import { FadeIn, Navbar, Footer, AssessmentFAB } from "@/components/site-layout";
import { SMS_ENABLED, SMS_NUMBER_E164, formatSmsNumber, smsHref } from "@/lib/sms";

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
  const { scrollYProgress } = useScroll();
  const panelY = useTransform(scrollYProgress, [0, 1], [0, 40]);

  return (
    <section className="relative min-h-[100dvh] flex flex-col justify-between pt-24 overflow-hidden">
      <div className="absolute inset-0 z-0" style={{
        background: "radial-gradient(ellipse 70% 80% at 80% 50%, rgba(255,255,255,0.06) 0%, transparent 65%)"
      }} />
      <div className="absolute inset-0 z-0 opacity-[0.06]" style={{
        backgroundImage: "repeating-linear-gradient(120deg, rgba(255,255,255,0.8) 0px, rgba(255,255,255,0.8) 1px, transparent 1px, transparent 60px)"
      }} />

      <div className="max-w-7xl relative z-10 mx-auto px-6 flex-1 flex items-center">
        <div className="grid lg:grid-cols-2 gap-12 items-center w-full pt-16 pb-12">
          <div>
          <FadeIn>
            <div className="flex items-center gap-3 mb-12">
              <div className="h-[1px] w-10 bg-foreground/30" />
              <span className="section-label">AI Enablement for Organizations</span>
            </div>
          </FadeIn>

          <FadeIn delay={0.1}>
            <h1 className="text-5xl md:text-[4.75rem] font-serif leading-[1.1] mb-8 text-gradient pb-1">
              <em className="not-italic font-light">From AI curious to AI capable.</em>
            </h1>
          </FadeIn>

          <FadeIn delay={0.2}>
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-md mb-10 font-sans font-light">
              We help organizations get ready for AI, build the applications their teams need, and train their people to run them. From exploring AI to operating it in eight weeks.
            </p>
          </FadeIn>

          <FadeIn delay={0.3} className="mb-14">
            <div className="flex flex-col sm:flex-row gap-4">
              <a href="#assessment">
                <Button size="lg" className="rounded-none h-14 px-8 text-sm uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90">
                  Get Free Assessment <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </a>
              <a href="#case-study">
                <Button variant="outline" size="lg" className="rounded-none h-14 px-8 text-sm uppercase tracking-widest border-foreground/25 hover:bg-foreground/5">
                  See Case Studies
                </Button>
              </a>
            </div>
            {SMS_ENABLED && SMS_NUMBER_E164 && (
              <p className="mt-5 text-sm text-muted-foreground font-light md:hidden">
                Or text our concierge:{" "}
                <a
                  href={smsHref(SMS_NUMBER_E164)}
                  className="text-foreground underline underline-offset-4 hover:text-foreground/70"
                >
                  {formatSmsNumber(SMS_NUMBER_E164)}
                </a>
              </p>
            )}
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
                { stat: "8 wks", label: "from readiness review to live rollout" },
                { stat: "100%", label: "code, prompts, and data stay in your accounts" },
                { stat: "up to 90%", label: "reduction in manual effort on shipped workflows" },
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

          <FadeIn delay={0.25}>
            <motion.div style={{ y: panelY }} className="border border-foreground/20 bg-background/60 backdrop-blur p-8 lg:p-10">
              <div className="section-label mb-4">Engagement Scope</div>
              <h2 className="text-3xl md:text-4xl font-serif mb-6">From readiness review to a team that runs it.</h2>
              <div className="space-y-4 text-sm font-light text-muted-foreground">
                {[
                  "Week 1: AI readiness review and priority workflows.",
                  "Week 2-5: the custom application, integrations, and automations.",
                  "Week 6-8: live rollout with hands-on training for your team.",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <Check className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <a href="#services" className="inline-flex items-center mt-8 text-xs uppercase tracking-widest text-foreground/80 hover:text-foreground">
                View detailed scope <ArrowRight className="ml-2 w-3.5 h-3.5" />
              </a>
            </motion.div>
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
            <h2 className="text-4xl md:text-5xl font-serif mb-8">Most organizations buy AI seats but keep the same manual work.</h2>
            <p className="text-lg text-muted-foreground mb-6 font-light leading-relaxed">
              Teams copy data between systems, managers approve routine tasks, and reporting depends on one person stitching documents every Friday. Meanwhile, staff are unsure what the tools can actually do for their role.
            </p>
            <p className="text-lg text-muted-foreground font-light leading-relaxed">
              We map where AI fits, ship the applications your team needs, and train the people who use them every day — so the tools get adopted instead of shelved.
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
  { phase: "02", title: "Build", icon: Layers, start: 2, span: 4 },
  { phase: "03", title: "Deploy", icon: Rocket, start: 6, span: 2 },
  { phase: "04", title: "Train", icon: GraduationCap, start: 1, span: 8 },
];

const Services = () => (
  <section id="services" className="py-32 border-t border-foreground/10">
    <div className="max-w-7xl mx-auto px-6">
      <FadeIn>
        <div className="flex items-center gap-3 mb-16">
          <div className="h-[1px] w-12 bg-primary"></div>
          <span className="section-label">Practice Areas</span>
        </div>
        <h2 className="text-4xl md:text-6xl font-serif mb-6 max-w-3xl">Four pillars. One continuous engagement.</h2>
        <p className="text-lg text-muted-foreground font-light max-w-2xl mb-12">
          Every engagement moves through assessment, build, deployment, and training — each pillar rolls up specific practice areas your organization will see on the plan.
        </p>
      </FadeIn>

      <FadeIn delay={0.1}>
        <div className="hidden md:block mb-20 border border-foreground/15 bg-foreground/[0.02] p-8">
          <div className="flex items-baseline justify-between mb-6">
            <span className="section-label">Engagement timeline</span>
            <span className="text-xs uppercase tracking-[0.15em] text-muted-foreground font-sans">8 weeks · kickoff to handoff</span>
          </div>
          <div className="grid grid-cols-8 gap-px mb-3 border-b border-foreground/10 pb-3">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="text-center">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-sans">Wk</div>
                <div className="text-sm font-serif text-foreground">{i + 1}</div>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {TIMELINE_PHASES.map((p) => (
              <div key={p.phase} className="grid grid-cols-8 gap-px">
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
              <h3 className="text-3xl font-serif mb-4">{pillar.title}</h3>
              <p className="text-muted-foreground font-light leading-relaxed text-sm mb-8">
                {pillar.summary}
              </p>
              <div className="mt-auto pt-6 border-t border-foreground/10">
                <p className="section-label mb-4 text-muted-foreground/60">Includes</p>
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
    headline: "Quarterly reporting, from a full day to under an hour.",
    narrativeOnly: true,
    diagram: <PRWorkflowDiagram />,
    intro: [
      "A team was producing recurring quarterly reports for clients — pulling from kick-off call notes, internal data, and prior-cycle context, then iterating through multiple review rounds. Each cycle consumed a full day of senior time before the report went out the door.",
      "We rebuilt the reporting pipeline as an AI workflow with Skills integrated end-to-end across source ingestion, structured analysis, and draft assembly. Output quality measured 25% higher than the same workflow running on a baseline frontier model, and time-to-completion dropped by over 90% — a full day became under an hour. The team moved from drafting to reviewing — voice and judgment stayed human; the typing left.",
    ],
    before:
      "Hours per cycle of source review, structured note-taking, and drafting from scratch. Same shape every time — no leverage.",
    after:
      "Minutes per cycle of review on a polished, structured draft. Same quality bar, dramatically less time.",
    metrics: [
      { label: "Cycle time", value: "hrs → mins" },
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
        What used to be a full day of reporting work is now <span className="text-background font-medium">under an hour, end to end</span>. The team kept full editorial control; the freed time went into deeper analysis and faster client turnaround.
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
              <span className="section-label !text-background/60">Case Studies · {data.eyebrow}</span>
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
          <span className="section-label !text-background/60">Case Studies · {data.eyebrow}</span>
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
    <section id="case-study" className="py-32 border-t border-foreground/15 bg-foreground text-background overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between mb-12 pb-6 border-b border-background/15">
          <div className="flex items-center gap-3">
            <div className="h-[1px] w-12 bg-background/40" />
            <span className="section-label !text-background/60">Case Studies</span>
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

type FormStatus =
  | { state: "idle" }
  | { state: "submitting" }
  | { state: "success" }
  | { state: "error"; message: string };

// Match Tailwind's `md` breakpoint so the FAB swap (md:hidden) and the form
// input swap stay in lockstep. Defaults to false on first paint to avoid
// flashing the phone field on a desktop reload.
const MOBILE_QUERY = "(max-width: 767.98px)";
const useIsMobile = (): boolean => {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const sync = () => setIsMobile(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);
  return isMobile;
};

// Best-effort US phone normalizer. Returns E.164 (+15551234567) or null when
// the input can't be coerced. Server re-validates against E.164 regardless.
const normalizePhone = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    const e164 = `+${digits}`;
    return /^\+[1-9]\d{6,14}$/.test(e164) ? e164 : null;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
};

type ModelKey = "claude" | "gpt" | "gemini" | "openSource";

const MODELS: Record<ModelKey, { name: string; vendor: string; oneLiner: string; rationale: string }> = {
  claude: {
    name: "Claude",
    vendor: "Anthropic",
    oneLiner: "Best fit for nuanced writing, careful reasoning, and long, sensitive documents.",
    rationale:
      "Your answers point to work where tone, judgment, and depth matter — drafting client-grade material, reasoning over long context, and handling sensitive data with care.",
  },
  gpt: {
    name: "ChatGPT",
    vendor: "OpenAI",
    oneLiner: "Best fit for a daily-driver assistant with the broadest tool and integration ecosystem.",
    rationale:
      "Your team wants one assistant connected to many systems — a deep ecosystem of plugins, image generation, and tight Microsoft 365 / Copilot integration is the shortest path.",
  },
  gemini: {
    name: "Gemini",
    vendor: "Google",
    oneLiner: "Best fit for Google Workspace teams that need fresh information and multimodal input.",
    rationale:
      "You live inside Google's stack, want grounded answers from current web data, and routinely work across mixed media — docs, sheets, audio, and video.",
  },
  openSource: {
    name: "Open-source",
    vendor: "Self-hosted (Llama, Mistral, or similar)",
    oneLiner: "Best fit for regulated workloads and data that cannot leave your network.",
    rationale:
      "Your data sensitivity and infrastructure posture make a self-hosted, fine-tunable model the safest match — full control over routing, training data, and audit trails.",
  },
};

type Choice = { label: string; weights: Partial<Record<ModelKey, number>> };
type Question = { id: string; prompt: string; choices: Choice[] };

const QUESTIONS: Question[] = [
  {
    id: "primary-use",
    prompt: "Which best describes the work you'd want AI to take on first?",
    choices: [
      { label: "Drafting client-grade writing — proposals, reports, briefs", weights: { claude: 3, gpt: 1 } },
      { label: "Building internal tools and automations faster", weights: { claude: 2, gpt: 2 } },
      { label: "Pulling insight out of long documents and transcripts", weights: { claude: 3, gemini: 1 } },
      { label: "Producing creative assets — images, marketing, social", weights: { gpt: 3, gemini: 1 } },
      { label: "Surfacing real-time information from the open web", weights: { gemini: 3, gpt: 1 } },
    ],
  },
  {
    id: "stack",
    prompt: "Where does your team already do most of its work?",
    choices: [
      { label: "Microsoft 365 — Outlook, Teams, Word, Excel, SharePoint", weights: { gpt: 3 } },
      { label: "Google Workspace — Gmail, Drive, Docs, Sheets, Meet", weights: { gemini: 3 } },
      { label: "Slack and a mix of best-of-breed SaaS tools", weights: { claude: 2, gpt: 2 } },
      { label: "Mostly inside our own apps and infrastructure", weights: { openSource: 3, claude: 1 } },
      { label: "Honestly, it's still pretty fragmented", weights: { gpt: 2, claude: 1 } },
    ],
  },
  {
    id: "concern",
    prompt: "When AI gets something wrong, what bothers you most?",
    choices: [
      { label: "It sounds confident, but the facts or judgment are off", weights: { claude: 3 } },
      { label: "It hedges or refuses when I just need an answer", weights: { gpt: 3 } },
      { label: "It's working from stale information", weights: { gemini: 3 } },
      { label: "I have no idea where my data went to produce that answer", weights: { openSource: 3, claude: 1 } },
    ],
  },
  {
    id: "data",
    prompt: "What kind of data will the AI typically see?",
    choices: [
      { label: "Public-ish business content — emails, marketing, meeting notes", weights: { gpt: 2, gemini: 1 } },
      { label: "Sensitive client work — contracts, financials, PII or PHI", weights: { claude: 3, openSource: 1 } },
      { label: "Massive archives — codebases, full meeting libraries, video", weights: { claude: 2, gemini: 2 } },
      { label: "Regulated data that cannot leave our network", weights: { openSource: 4 } },
    ],
  },
  {
    id: "outcome",
    prompt: "Picture the ideal first win in 60 days. It looks like:",
    choices: [
      { label: "A drafting partner that nails our voice and judgment", weights: { claude: 3 } },
      { label: "A power-user assistant inside our existing email and docs", weights: { gpt: 2, gemini: 2 } },
      { label: "A research engine that summarizes hundreds of pages on demand", weights: { claude: 3, gemini: 1 } },
      { label: "A privacy-safe internal copilot trained on our own data", weights: { openSource: 4 } },
      { label: "A creative co-pilot for marketing and content", weights: { gpt: 3 } },
    ],
  },
  {
    id: "build",
    prompt: "How much custom building do you expect in the first year?",
    choices: [
      { label: "Heavy — internal apps, agents, and workflow automation", weights: { claude: 3, gpt: 1 } },
      { label: "Some — light scripting, integrations, and prompt tooling", weights: { claude: 2, gpt: 2 } },
      { label: "Almost none — we just want a great chat assistant", weights: { gpt: 3, gemini: 1 } },
      { label: "We need full control of the model, weights, and pipeline", weights: { openSource: 4 } },
    ],
  },
  {
    id: "governance",
    prompt: "How strict are your data governance and compliance requirements?",
    choices: [
      { label: "Strict — regulated industry, audit trails, data residency rules", weights: { openSource: 3, claude: 2 } },
      { label: "Moderate — vendor DPAs and zero-retention agreements are enough", weights: { claude: 3, gpt: 1 } },
      { label: "Light — standard enterprise terms cover us", weights: { gpt: 2, gemini: 2 } },
      { label: "We haven't really nailed this down yet", weights: { gpt: 2, claude: 1 } },
    ],
  },
  {
    id: "multimodal",
    prompt: "How often will the team work with images, audio, or video?",
    choices: [
      { label: "Constantly — it's core to what we do", weights: { gemini: 3, gpt: 2 } },
      { label: "Often — marketing assets, screenshots, recorded meetings", weights: { gpt: 3, gemini: 1 } },
      { label: "Occasionally — mostly text with the odd image", weights: { claude: 1, gpt: 1, gemini: 1 } },
      { label: "Rarely — we live in documents and prose", weights: { claude: 3 } },
    ],
  },
  {
    id: "answer-style",
    prompt: "What does a great answer look like to you?",
    choices: [
      { label: "Careful, well-reasoned, willing to say 'I'm not sure'", weights: { claude: 3 } },
      { label: "Fast, confident, and happy to take a strong first pass", weights: { gpt: 3 } },
      { label: "Grounded in current sources I can click through and verify", weights: { gemini: 3, claude: 1 } },
      { label: "One I'm certain never left our network", weights: { openSource: 3, claude: 1 } },
    ],
  },
  {
    id: "rollout",
    prompt: "How would you ideally roll this out across the team?",
    choices: [
      { label: "One vendor seat for everyone — simplest possible footprint", weights: { gpt: 3 } },
      { label: "Bake it into the productivity suite we already pay for", weights: { gpt: 1, gemini: 2 } },
      { label: "Mix-and-match — pick the best tool per workflow", weights: { claude: 2, gpt: 1, gemini: 1 } },
      { label: "Self-host it behind our own access controls", weights: { openSource: 4 } },
    ],
  },
];

type Recommendation = { primary: ModelKey; runnerUp: ModelKey; tally: Record<ModelKey, number> };

const scoreAnswers = (answers: Record<string, number>): Recommendation => {
  const tally: Record<ModelKey, number> = { claude: 0, gpt: 0, gemini: 0, openSource: 0 };
  for (const q of QUESTIONS) {
    const idx = answers[q.id];
    if (idx === undefined) continue;
    const weights = q.choices[idx]?.weights ?? {};
    (Object.keys(weights) as ModelKey[]).forEach((k) => {
      tally[k] += weights[k] ?? 0;
    });
  }
  const ranked = (Object.keys(tally) as ModelKey[]).sort((a, b) => tally[b] - tally[a]);
  return { primary: ranked[0], runnerUp: ranked[1], tally };
};

const formatAssessmentForAdmin = (
  answers: Record<string, number>,
  recommendation: Recommendation,
): string => {
  const primary = MODELS[recommendation.primary];
  const runnerUp = MODELS[recommendation.runnerUp];
  const lines: string[] = [
    "AI Model Fit Assessment",
    `Recommended: ${primary.name} (${primary.vendor})`,
    `Runner-up: ${runnerUp.name} (${runnerUp.vendor})`,
    `Scores — Claude: ${recommendation.tally.claude}, ChatGPT: ${recommendation.tally.gpt}, Gemini: ${recommendation.tally.gemini}, Open-source: ${recommendation.tally.openSource}`,
    "",
  ];
  QUESTIONS.forEach((q, i) => {
    const idx = answers[q.id];
    const choice = idx !== undefined ? q.choices[idx]?.label : "(no answer)";
    lines.push(`Q${i + 1}. ${q.prompt}`);
    lines.push(`A: ${choice}`);
    lines.push("");
  });
  return lines.join("\n").trim();
};

const LeadCapture = () => {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<FormStatus>({ state: "idle" });
  const isMobile = useIsMobile();
  const contactType: "sms" | "email" = isMobile ? "sms" : "email";

  const totalQuestions = QUESTIONS.length;
  const onResultStep = step >= totalQuestions;
  const currentQuestion = onResultStep ? null : QUESTIONS[step];
  const currentAnswerIdx = currentQuestion ? answers[currentQuestion.id] : undefined;

  const recommendation = useMemo(() => scoreAnswers(answers), [answers]);
  const recommended = MODELS[recommendation.primary];
  const runnerUp = MODELS[recommendation.runnerUp];

  const advanceTimerRef = useRef<number | null>(null);
  const clearAdvanceTimer = () => {
    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  };
  useEffect(() => clearAdvanceTimer, []);

  const handleSelect = (choiceIdx: number) => {
    if (!currentQuestion) return;
    const qid = currentQuestion.id;
    setAnswers((prev) => ({ ...prev, [qid]: choiceIdx }));
    // Auto-advance feels right for a quiz; tiny delay so the selected state is visible.
    // Cancel any in-flight advance so a fast double-tap can't skip a question.
    clearAdvanceTimer();
    advanceTimerRef.current = window.setTimeout(() => {
      advanceTimerRef.current = null;
      setStep((s) => Math.min(s + 1, totalQuestions));
    }, 180);
  };

  const handleBack = () => {
    clearAdvanceTimer();
    setStep((s) => Math.max(s - 1, 0));
  };

  const handleRetake = () => {
    clearAdvanceTimer();
    setAnswers({});
    setStep(0);
    setStatus({ state: "idle" });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const rawContact = String(formData.get("contact") || "").trim();
    const contact =
      contactType === "sms" ? normalizePhone(rawContact) : rawContact;

    if (contactType === "sms" && !contact) {
      setStatus({
        state: "error",
        message: "Please enter a valid mobile number, e.g. (555) 123-4567.",
      });
      return;
    }

    const payload = {
      name: String(formData.get("name") || "").trim(),
      contact: contact ?? "",
      contactType,
      company: String(formData.get("company") || "").trim(),
      challenge: formatAssessmentForAdmin(answers, recommendation),
    };

    setStatus({ state: "submitting" });

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const message =
          response.status === 400
            ? "Please check your entries and try again."
            : "Something went wrong on our end. Please email contact@deerpark.io or try again in a few minutes.";
        setStatus({ state: "error", message });
        return;
      }

      form.reset();
      setStatus({ state: "success" });
    } catch {
      setStatus({
        state: "error",
        message: "Network error. Please check your connection and retry.",
      });
    }
  };

  const submitting = status.state === "submitting";
  const progress = onResultStep
    ? 100
    : Math.round((step / totalQuestions) * 100);

  return (
    <section id="assessment" className="py-32 border-t border-foreground/15 bg-card">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-12 items-start">
          <FadeIn className="min-w-0">
            <div className="flex items-center gap-3 mb-8">
              <div className="h-[1px] w-12 bg-primary"></div>
              <span className="section-label">Free Model-Fit Assessment</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-serif mb-6">
              Find your AI model fit in 2 minutes.
            </h2>
            <p className="text-lg text-muted-foreground font-light leading-relaxed mb-6 max-w-xl">
              Ten blind questions, no labels on the answers. We score how you actually work and recommend the model that fits — then send a tailored deployment plan within two business days.
            </p>
            <div className="space-y-3 text-sm text-muted-foreground font-light">
              <p>&bull; Ten questions. ~2 minutes.</p>
              <p>&bull; Scored across Claude, ChatGPT, Gemini, and open-source.</p>
              <p>&bull; No software purchase required.</p>
            </div>
            <div className="mt-10 pt-8 border-t border-foreground/15">
              <div className="section-label mb-3">Prefer to skip the quiz?</div>
              <a
                href="https://calendar.app.google/5PAVU7Ron83HShxi9"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-3 text-sm text-foreground hover:text-foreground/70 transition-colors"
              >
                <Calendar className="w-4 h-4" />
                <span className="underline underline-offset-4">Book a 15-min intro call</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
              {SMS_ENABLED && SMS_NUMBER_E164 && (
                <p className="text-sm text-muted-foreground font-light mt-3 md:hidden">
                  Or text our concierge bot at{" "}
                  <a
                    href={smsHref(SMS_NUMBER_E164)}
                    className="text-foreground underline underline-offset-4 hover:text-foreground/70"
                  >
                    {formatSmsNumber(SMS_NUMBER_E164)}
                  </a>
                  {" — "}quick back-and-forth, assessment in two messages.
                </p>
              )}
              <p className="text-xs text-muted-foreground font-light mt-3 hidden md:block">
                Or email <a href="mailto:contact@deerpark.io" className="underline underline-offset-2 hover:text-foreground">contact@deerpark.io</a>.
              </p>
            </div>
          </FadeIn>

          <FadeIn delay={0.1} className="min-w-0">
            {status.state === "success" ? (
              <div className="border border-primary/40 bg-background p-10 text-center">
                <div className="inline-block p-3 border border-primary/40 bg-primary/10 mb-6">
                  <Check className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-2xl font-serif mb-4">Assessment received.</h3>
                <p className="text-muted-foreground font-light leading-relaxed max-w-sm mx-auto mb-2">
                  We logged your model fit as{" "}
                  <span className="text-foreground">{recommended.name}</span>.
                  A DeerPark strategist will follow up within two business days with a tailored deployment plan.
                </p>
                <p className="text-xs text-muted-foreground font-light">
                  Check your inbox — including spam — for a confirmation.
                </p>
              </div>
            ) : currentQuestion ? (
              <div className="border border-foreground/15 bg-background p-6 md:p-8">
                <div className="flex items-center justify-between mb-6">
                  <span className="section-label">
                    Question {step + 1} of {totalQuestions}
                  </span>
                  <span className="text-xs text-muted-foreground font-light tabular-nums">
                    {progress}%
                  </span>
                </div>
                <div className="h-[2px] bg-foreground/10 mb-8">
                  <div
                    className="h-full bg-primary transition-[width] duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <h3 className="text-xl md:text-2xl font-serif leading-snug mb-6">
                  {currentQuestion.prompt}
                </h3>
                <div className="space-y-3">
                  {currentQuestion.choices.map((choice, i) => {
                    const selected = currentAnswerIdx === i;
                    return (
                      <button
                        key={choice.label}
                        type="button"
                        onClick={() => handleSelect(i)}
                        aria-pressed={selected}
                        className={`group w-full text-left border px-4 py-4 transition-colors flex items-start gap-3 ${
                          selected
                            ? "border-primary bg-primary/10"
                            : "border-foreground/15 bg-card hover:border-foreground/40"
                        }`}
                      >
                        <span
                          className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center border ${
                            selected
                              ? "border-primary bg-primary text-background"
                              : "border-foreground/30 bg-transparent"
                          }`}
                        >
                          {selected && <Check className="w-3 h-3" />}
                        </span>
                        <span className="text-sm md:text-base font-light leading-relaxed">
                          {choice.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {step > 0 && (
                  <div className="mt-6 flex items-center justify-between text-xs text-muted-foreground font-light">
                    <button
                      type="button"
                      onClick={handleBack}
                      className="inline-flex items-center gap-2 hover:text-foreground transition-colors"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      Back
                    </button>
                    <span>Pick the closest match — no perfect answer.</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                <div className="border border-primary/40 bg-background p-6 md:p-8">
                  <div className="flex items-center justify-between mb-4">
                    <span className="section-label">Your model fit</span>
                    <button
                      type="button"
                      onClick={handleRetake}
                      className="inline-flex items-center gap-2 text-xs text-muted-foreground font-light hover:text-foreground transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Retake
                    </button>
                  </div>
                  <h3 className="text-3xl md:text-4xl font-serif mb-2">
                    {recommended.name}
                  </h3>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-5">
                    {recommended.vendor}
                  </p>
                  <p className="text-base md:text-lg text-foreground/90 font-light leading-relaxed mb-4">
                    {recommended.oneLiner}
                  </p>
                  <p className="text-sm text-muted-foreground font-light leading-relaxed mb-6">
                    {recommended.rationale}
                  </p>
                  <div className="pt-4 border-t border-foreground/10 text-xs text-muted-foreground font-light">
                    Close runner-up: <span className="text-foreground">{runnerUp.name}</span>{" "}
                    <span className="opacity-70">({runnerUp.vendor})</span>. We benchmark both against your evals before recommending a deployment.
                  </div>
                </div>

                <form
                  onSubmit={handleSubmit}
                  className="border border-foreground/15 bg-background p-6 md:p-8 space-y-5"
                >
                  <div>
                    <h4 className="text-lg font-serif mb-1">Send my deployment plan</h4>
                    <p className="text-xs text-muted-foreground font-light">
                      We'll send a tailored plan based on your answers within two business days.
                    </p>
                  </div>
                  <div>
                    <label htmlFor="name" className="section-label block mb-2">Name</label>
                    <input id="name" name="name" required disabled={submitting} className="w-full h-12 bg-card border border-foreground/15 px-4 text-sm outline-none focus:border-primary/80 disabled:opacity-50" />
                  </div>
                  <div>
                    <label htmlFor="contact" className="section-label block mb-2">
                      {contactType === "sms" ? "Mobile Number" : "Work Email"}
                    </label>
                    {contactType === "sms" ? (
                      <input
                        id="contact"
                        name="contact"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="(555) 123-4567"
                        required
                        disabled={submitting}
                        className="w-full h-12 bg-card border border-foreground/15 px-4 text-sm outline-none focus:border-primary/80 disabled:opacity-50"
                      />
                    ) : (
                      <input
                        id="contact"
                        name="contact"
                        type="email"
                        autoComplete="email"
                        required
                        disabled={submitting}
                        className="w-full h-12 bg-card border border-foreground/15 px-4 text-sm outline-none focus:border-primary/80 disabled:opacity-50"
                      />
                    )}
                  </div>
                  <div>
                    <label htmlFor="company" className="section-label block mb-2">Company</label>
                    <input id="company" name="company" required disabled={submitting} className="w-full h-12 bg-card border border-foreground/15 px-4 text-sm outline-none focus:border-primary/80 disabled:opacity-50" />
                  </div>
                  <Button type="submit" size="lg" disabled={submitting} className="w-full rounded-none h-14 px-3 md:px-8 text-xs md:text-sm uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90 disabled:opacity-60">
                    {submitting ? "Submitting…" : (
                      <>
                        Send My Deployment Plan <ArrowRight className="ml-2 w-4 h-4" />
                      </>
                    )}
                  </Button>
                  {status.state === "error" && (
                    <p role="alert" className="text-xs text-red-400">
                      {status.message}
                    </p>
                  )}
                </form>
              </div>
            )}
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
        <CaseStudy />
        <FAQ />
        <LeadCapture />
      </main>
      <AssessmentFAB />
      <Footer />
    </div>
  );
}
