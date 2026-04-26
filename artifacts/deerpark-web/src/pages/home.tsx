import React, { FormEvent, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, ScanSearch, Layers, GraduationCap, Rocket, Check, Menu, X, Plus, Minus, Calendar, Rss, ExternalLink, ChevronDown } from "lucide-react";
import logo from "../assets/logo-icon.png";

const FadeIn = ({ children, delay = 0, className = "" }: { children: React.ReactNode, delay?: number, className?: string }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-100px" }}
    transition={{ duration: 0.7, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
    className={className}
  >
    {children}
  </motion.div>
);

const NAV_LINKS = [
  { href: "#services", label: "Services" },
  { href: "#case-study", label: "Case Study" },
  { href: "#dispatch", label: "Dispatch" },
  { href: "#faq", label: "FAQ" },
];

const Navbar = () => {
  const [open, setOpen] = useState(false);
  return (
    <header className="fixed top-0 w-full z-50 border-b border-foreground/10 bg-background/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 h-20 md:h-24 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 font-wordmark text-[1.25rem] md:text-[1.5rem] font-medium tracking-[0.06em] text-foreground">
          <img src={logo} alt="DeerPark icon" className="h-10 md:h-12 w-auto" />
          <span>{"DeerPark"}<span className="text-foreground/50 font-light">.io</span></span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="hover:text-foreground transition-colors">{l.label}</a>
          ))}
          <a href="#assessment">
            <Button className="font-sans text-xs uppercase tracking-widest rounded-none bg-foreground text-background hover:bg-foreground/90">
              Free Scorecard
            </Button>
          </a>
        </nav>
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="md:hidden p-2 -mr-2 text-foreground"
        >
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>
      {open && (
        <div className="md:hidden border-t border-foreground/10 bg-background">
          <nav className="max-w-7xl mx-auto px-6 py-6 flex flex-col gap-5 text-sm font-medium text-muted-foreground">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="hover:text-foreground transition-colors">
                {l.label}
              </a>
            ))}
            <a href="#assessment" onClick={() => setOpen(false)}>
              <Button className="w-full font-sans text-xs uppercase tracking-widest rounded-none bg-foreground text-background hover:bg-foreground/90">
                Free Scorecard
              </Button>
            </a>
          </nav>
        </div>
      )}
    </header>
  );
};

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

          <FadeIn delay={0.3} className="flex flex-col sm:flex-row gap-4 mb-14">
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

const Services = () => (
  <section id="services" className="py-32 border-t border-foreground/10">
    <div className="max-w-7xl mx-auto px-6">
      <FadeIn>
        <div className="flex items-center gap-3 mb-16">
          <div className="h-[1px] w-12 bg-primary"></div>
          <span className="section-label">Practice Areas</span>
        </div>
        <h2 className="text-4xl md:text-6xl font-serif mb-6 max-w-3xl">Four pillars. One continuous engagement.</h2>
        <p className="text-lg text-muted-foreground font-light max-w-2xl mb-20">
          Every engagement moves through assessment, build, deployment, and training — each pillar rolls up specific practice areas your organization will see on the plan.
        </p>
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
          <dl className="grid grid-cols-2 gap-4 mt-10 border-t border-background/20 pt-8">
            <div>
              <dt className="text-xs uppercase tracking-[0.15em] text-background/40">Kickoff to prod</dt>
              <dd className="text-2xl font-serif mt-2">6-8 wks</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.15em] text-background/40">Handoff</dt>
              <dd className="text-2xl font-serif mt-2">100%</dd>
            </div>
          </dl>
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

const Dispatch = () => {
  const [selectedWeekId, setSelectedWeekId] = useState(DISPATCH_WEEKS[0].id);
  const [weekMenuOpen, setWeekMenuOpen] = useState(false);
  const selectedWeek = DISPATCH_WEEKS.find((w) => w.id === selectedWeekId) ?? DISPATCH_WEEKS[0];
  const [headlineMode, setHeadlineMode] = useState<HeadlineMode>("top");
  const headlinesQuery = useHeadlines(headlineMode);
  const headlines: Headline[] = headlinesQuery.data && headlinesQuery.data.length > 0
    ? headlinesQuery.data
    : HEADLINE_FALLBACK;
  const lastSync = headlinesQuery.dataUpdatedAt
    ? new Date(headlinesQuery.dataUpdatedAt)
    : null;

  return (
  <section id="dispatch" className="py-32 border-t border-foreground/15 bg-background">
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
              Our in-house agent publishes a short analytical note every business day on a rolling weekly cadence, and pulls verified headlines from the labs, hyperscalers, and community boards that actually move the market.
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
                  {DISPATCH_WEEKS.map((week) => {
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
                ? "What moved the market this week, ranked."
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
          <FadeIn>
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
              <p className="text-xs text-muted-foreground font-light mt-3">
                Or email <a href="mailto:contact@deerpark.io" className="underline underline-offset-2 hover:text-foreground">contact@deerpark.io</a>.
              </p>
            </div>
          </FadeIn>

          <FadeIn delay={0.1}>
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
              <form onSubmit={handleSubmit} className="border border-foreground/15 bg-background p-8 space-y-5">
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
                <Button type="submit" size="lg" disabled={submitting} className="w-full rounded-none h-14 px-8 text-sm uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90 disabled:opacity-60">
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

const Footer = () => (
  <footer className="border-t border-foreground/15 bg-background pt-20 pb-10">
    <div className="max-w-7xl mx-auto px-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-20">
        <div className="col-span-1 md:col-span-2">
          <a href="/" className="flex items-center gap-3 font-wordmark text-[1.5rem] font-medium tracking-[0.06em] text-foreground mb-6">
            <img src={logo} alt="DeerPark icon" className="h-12 w-auto" />
            <span>{"DeerPark"}<span className="text-foreground/50 font-light">.io</span></span>
          </a>
          <p className="text-muted-foreground font-light text-sm max-w-sm">
            AI enablement for organizations. We assess, build, train, and deploy — so your team actually uses what we ship.
          </p>
        </div>
        <div>
          <h4 className="font-sans text-xs font-semibold uppercase tracking-[0.15em] mb-6 text-foreground">Practice</h4>
          <ul className="space-y-4 text-sm text-muted-foreground font-light">
            <li><a href="#services" className="hover:text-foreground transition-colors">Assess</a></li>
            <li><a href="#services" className="hover:text-foreground transition-colors">Build</a></li>
            <li><a href="#services" className="hover:text-foreground transition-colors">Deploy</a></li>
            <li><a href="#services" className="hover:text-foreground transition-colors">Train</a></li>
          </ul>
        </div>
        <div>
          <h4 className="font-sans text-xs font-semibold uppercase tracking-[0.15em] mb-6 text-foreground">Company</h4>
          <ul className="space-y-4 text-sm text-muted-foreground font-light">
            <li><a href="#case-study" className="hover:text-foreground transition-colors">Case Study</a></li>
            <li><a href="#dispatch" className="hover:text-foreground transition-colors">Dispatch</a></li>
            <li><a href="#faq" className="hover:text-foreground transition-colors">FAQ</a></li>
            <li><a href="#assessment" className="hover:text-foreground transition-colors">Free Scorecard</a></li>
            <li><a href="mailto:contact@deerpark.io" className="hover:text-foreground transition-colors">Contact</a></li>
          </ul>
        </div>
      </div>
      <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-foreground/10 text-xs text-muted-foreground font-light">
        <div>&copy; {new Date().getFullYear()} DeerPark.io. All rights reserved.</div>
        <div className="flex gap-6 mt-4 md:mt-0">
          <a href="mailto:contact@deerpark.io?subject=Privacy+Inquiry" className="hover:text-foreground transition-colors">Privacy Policy</a>
          <a href="mailto:contact@deerpark.io?subject=Terms+Inquiry" className="hover:text-foreground transition-colors">Terms of Service</a>
        </div>
      </div>
    </div>
  </footer>
);

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-foreground selection:text-background">
      <Navbar />
      <main>
        <Hero />
        <Problem />
        <Services />
        <CaseStudy />
        <Dispatch />
        <FAQ />
        <LeadCapture />
      </main>
      <a
        href="#assessment"
        className="fixed bottom-4 right-4 z-50 md:hidden rounded-none bg-foreground text-background px-5 py-3 text-[11px] font-semibold uppercase tracking-widest shadow-lg"
      >
        Get Free Scorecard
      </a>
      <Footer />
    </div>
  );
}
