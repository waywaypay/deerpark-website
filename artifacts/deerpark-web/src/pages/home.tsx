import React, { FormEvent, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, ScanSearch, Layers, GraduationCap, Rocket, Check, Plus, Minus, Calendar } from "lucide-react";
import { FadeIn, Navbar, Footer, ScorecardFAB } from "@/components/site-layout";
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
              We help organizations get ready for AI, build the applications their teams need, and train their people to run them. From exploring AI to operating it in six to eight weeks.
            </p>
          </FadeIn>

          <FadeIn delay={0.3} className="mb-14">
            <div className="flex flex-col sm:flex-row gap-4">
              <a href="#assessment">
                <Button size="lg" className="rounded-none h-14 px-8 text-sm uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90">
                  Get Free Scorecard <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </a>
              <a href="#case-study">
                <Button variant="outline" size="lg" className="rounded-none h-14 px-8 text-sm uppercase tracking-widest border-foreground/25 hover:bg-foreground/5">
                  See Case Study
                </Button>
              </a>
            </div>
            {SMS_ENABLED && SMS_NUMBER_E164 && (
              <p className="mt-5 text-sm text-muted-foreground font-light">
                Or text our concierge:{" "}
                <a
                  href={smsHref(SMS_NUMBER_E164)}
                  className="text-foreground underline underline-offset-4 hover:text-foreground/70"
                >
                  {formatSmsNumber(SMS_NUMBER_E164)}
                </a>
                <span className="text-muted-foreground/70"> — 60-second scorecard, no form.</span>
              </p>
            )}
          </FadeIn>

          <FadeIn delay={0.4}>
            <div className="flex gap-10 border-t border-foreground/15 pt-8">
                {[
                { stat: "90%", label: "manual effort removed from everyday tasks" },
                { stat: "6-8 wks", label: "from readiness review to live rollout" },
                { stat: "100%", label: "code, prompts, and data stay in your accounts" },
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
            <span className="text-xs uppercase tracking-[0.15em] text-muted-foreground font-sans">6–8 weeks · kickoff to handoff</span>
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

const CASE_STACK = [
  { label: "Product", detail: "One web app for high-volume management scheduling — replacing spreadsheets and group chats with a single clean view of who's doing what, and when, across every site." },
  { label: "Experience", detail: "Simple UI anyone can use, single sign-on, white-label theming for every client deployment." },
  { label: "AI & Automation", detail: "Smart shift suggestions, conflict detection, time-off handling, and natural-language edits — all behind plain-language controls." },
  { label: "Deployment", detail: "Shipped to the firm's own cloud with secure access, logging, and cost telemetry." },
  { label: "Training", detail: "Executive briefing, role-based workshops, and runbooks so every manager was live on day one." },
];

const CaseStudy = () => (
  <section id="case-study" className="py-32 border-t border-foreground/15 bg-foreground text-background">
    <div className="max-w-7xl mx-auto px-6">
      <div className="grid lg:grid-cols-12 gap-12">
        <FadeIn className="lg:col-span-4">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-[1px] w-12 bg-background/40"></div>
            <span className="section-label !text-background/60">Case Study</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-serif leading-[1.05] mb-8 pb-1">
            One web app to manage high-volume management schedules.
          </h2>
          <p className="text-background/70 font-light leading-relaxed mb-6">
            A services operator needed a single AI-powered web app to run high-volume management schedules across dozens of client sites — shifts, availability, coverage, and time-off — without the spreadsheet chaos and group-chat back-and-forth that every manager was losing hours to each week.
          </p>
          <p className="text-background/70 font-light leading-relaxed">
            We took it from the first Figma frame to production in six to eight weeks: product design, full stack, AI layer, training, and handoff. After the internal demo landed, the operator rolled the same app across their active client base.
          </p>
          <div className="mt-10 border-t border-background/20 pt-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-background/15 border border-background/15 mb-6">
              <div className="bg-foreground p-5">
                <div className="text-[10px] uppercase tracking-[0.18em] text-background/40 mb-3 font-sans">Before</div>
                <div className="text-base font-serif text-background/55 leading-snug">
                  Spreadsheets and group chats. Every manager losing hours each week to coverage edits and time-off back-and-forth.
                </div>
              </div>
              <div className="bg-foreground p-5">
                <div className="text-[10px] uppercase tracking-[0.18em] text-primary mb-3 font-sans">After</div>
                <div className="text-base font-serif text-background leading-snug">
                  One web app. A single source of truth across every site, with AI handling the routine edits and conflict checks.
                </div>
              </div>
            </div>
            <dl className="grid grid-cols-3 gap-4">
              <div>
                <dt className="text-[10px] uppercase tracking-[0.15em] text-background/40 font-sans">Kickoff to prod</dt>
                <dd className="text-xl md:text-2xl font-serif mt-2">6–8 wks</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.15em] text-background/40 font-sans">Handoff</dt>
                <dd className="text-xl md:text-2xl font-serif mt-2">100%</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.15em] text-background/40 font-sans">Rolled out</dt>
                <dd className="text-xl md:text-2xl font-serif mt-2">40+ clients</dd>
              </div>
            </dl>
          </div>
        </FadeIn>

        <FadeIn delay={0.15} className="lg:col-span-8">
          <div className="border border-background/20 p-8 lg:p-10">
            <div className="section-label !text-background/60 mb-6">What we delivered</div>
            <div className="divide-y divide-background/15">
              {CASE_STACK.map((s) => (
                <div key={s.label} className="grid grid-cols-12 gap-4 py-5 items-baseline">
                  <div className="col-span-12 md:col-span-3 text-sm text-background/70 font-light uppercase tracking-[0.12em]">{s.label}</div>
                  <div className="col-span-12 md:col-span-9 text-base md:text-lg font-serif text-background leading-snug">{s.detail}</div>
                </div>
              ))}
            </div>
            <div className="mt-8 pt-8 border-t border-background/15 grid md:grid-cols-[auto_1fr] gap-x-8 gap-y-2 items-baseline">
              <div className="section-label !text-background/60">Outcome</div>
              <div className="text-lg md:text-xl font-serif text-background leading-snug">
                Shipped across <span className="text-background font-medium">40+ clients</span> after a successful demo.
              </div>
            </div>
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
    a: "We deploy inside your VPC or cloud tenant, use your existing IAM, and route through vetted model providers. We have worked with HIPAA, SOC 2, and FINRA-adjacent environments.",
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

const LeadCapture = () => {
  const [status, setStatus] = useState<FormStatus>({ state: "idle" });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      name: String(formData.get("name") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      company: String(formData.get("company") || "").trim(),
      challenge: String(formData.get("challenge") || "").trim(),
    };

    setStatus({ state: "submitting" });

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        const message =
          response.status === 400
            ? "Please check your entries and try again."
            : body?.error ?? "Something went wrong. Please try again shortly.";
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

  return (
    <section id="assessment" className="py-32 border-t border-foreground/15 bg-card">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-12 items-start">
          <FadeIn className="min-w-0">
            <div className="flex items-center gap-3 mb-8">
              <div className="h-[1px] w-12 bg-primary"></div>
              <span className="section-label">Lead Capture</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-serif mb-6">
              Get a free AI Workflow Scorecard.
            </h2>
            <p className="text-lg text-muted-foreground font-light leading-relaxed mb-6 max-w-xl">
              Share your workflow constraints and we will send a scorecard with estimated savings, rollout risk, and a recommended first deployment sequence.
            </p>
            <div className="space-y-3 text-sm text-muted-foreground font-light">
              <p>&bull; Delivery target: 2 business days.</p>
              <p>&bull; Includes effort estimate and priority ranking.</p>
              <p>&bull; No software purchase required.</p>
            </div>
            <div className="mt-10 pt-8 border-t border-foreground/15">
              <div className="section-label mb-3">Prefer to skip the form?</div>
              <a
                href="https://cal.com/deerpark/intro"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-3 text-sm text-foreground hover:text-foreground/70 transition-colors"
              >
                <Calendar className="w-4 h-4" />
                <span className="underline underline-offset-4">Book a 20-min intro call</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
              {SMS_ENABLED && SMS_NUMBER_E164 && (
                <p className="text-sm text-muted-foreground font-light mt-3">
                  Or text our concierge bot at{" "}
                  <a
                    href={smsHref(SMS_NUMBER_E164)}
                    className="text-foreground underline underline-offset-4 hover:text-foreground/70"
                  >
                    {formatSmsNumber(SMS_NUMBER_E164)}
                  </a>
                  {" — "}quick back-and-forth, scorecard in two messages.
                </p>
              )}
              <p className="text-xs text-muted-foreground font-light mt-3">
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
                <h3 className="text-2xl font-serif mb-4">Request received.</h3>
                <p className="text-muted-foreground font-light leading-relaxed max-w-sm mx-auto">
                  A DeerPark strategist will be in touch within two business days with your scorecard. Check your inbox — including spam — for a confirmation.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="border border-foreground/15 bg-background p-6 md:p-8 space-y-5">
                <div>
                  <label htmlFor="name" className="section-label block mb-2">Name</label>
                  <input id="name" name="name" required disabled={submitting} className="w-full h-12 bg-card border border-foreground/15 px-4 text-sm outline-none focus:border-primary/80 disabled:opacity-50" />
                </div>
                <div>
                  <label htmlFor="email" className="section-label block mb-2">Work Email</label>
                  <input id="email" name="email" type="email" required disabled={submitting} className="w-full h-12 bg-card border border-foreground/15 px-4 text-sm outline-none focus:border-primary/80 disabled:opacity-50" />
                </div>
                <div>
                  <label htmlFor="company" className="section-label block mb-2">Company</label>
                  <input id="company" name="company" required disabled={submitting} className="w-full h-12 bg-card border border-foreground/15 px-4 text-sm outline-none focus:border-primary/80 disabled:opacity-50" />
                </div>
                <div>
                  <label htmlFor="challenge" className="section-label block mb-2">Biggest Workflow Challenge</label>
                  <textarea id="challenge" name="challenge" rows={4} required disabled={submitting} className="w-full bg-card border border-foreground/15 px-4 py-3 text-sm outline-none focus:border-primary/80 disabled:opacity-50" />
                </div>
                <Button type="submit" size="lg" disabled={submitting} className="w-full rounded-none h-14 px-3 md:px-8 text-xs md:text-sm uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90 disabled:opacity-60">
                  {submitting ? "Submitting…" : (
                    <>
                      Send My Scorecard Request <ArrowRight className="ml-2 w-4 h-4" />
                    </>
                  )}
                </Button>
                {status.state === "error" && (
                  <p role="alert" className="text-xs text-red-400">
                    {status.message}
                  </p>
                )}
              </form>
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
      <ScorecardFAB />
      <Footer />
    </div>
  );
}
