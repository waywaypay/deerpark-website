import React, { FormEvent, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, Network, ScanSearch, Layers, Rocket, Check, Quote } from "lucide-react";
import dataVis from "../assets/data-vis.png";
import officeImg from "../assets/office.png";
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

const Navbar = () => (
  <header className="fixed top-0 w-full z-50 border-b border-white/5 bg-background/80 backdrop-blur-md">
    <div className="container mx-auto px-6 h-20 flex items-center justify-between">
      <Link href="/" className="flex items-center gap-3 font-wordmark text-[1.35rem] font-medium tracking-[0.06em] text-foreground">
        <img src={logo} alt="DeerPark icon" className="h-10 w-10 object-contain brightness-150" />
        <span>{"DeerPark"}<span className="text-foreground/50 font-light">.io</span></span>
      </Link>
      <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
        <a href="#services" className="hover:text-foreground transition-colors">Services</a>
        <a href="#methodology" className="hover:text-foreground transition-colors">Methodology</a>
        <a href="#impact" className="hover:text-foreground transition-colors">Impact</a>
        <a href="#assessment">
          <Button className="font-sans text-xs uppercase tracking-widest rounded-none bg-white text-black hover:bg-gray-100">
            Free Scorecard
          </Button>
        </a>
      </nav>
    </div>
  </header>
);

const TICKER_ITEMS = [
  "Workflow Diagnostic & Mapping",
  "Agent Architecture & Design",
  "MCP & Integration Engineering",
  "Prompt Engineering & Governance",
  "Multi-Agent Orchestration",
  "Capability Rollout & Enablement",
  "Tool & Vendor Evaluation",
  "Foundation Model Evaluation",
  "AI Application Assessment",
];

const Hero = () => {
  const { scrollYProgress } = useScroll();
  const panelY = useTransform(scrollYProgress, [0, 1], [0, 40]);

  return (
    <section className="relative min-h-[100dvh] flex flex-col justify-between pt-20 overflow-hidden">
      <div className="absolute inset-0 z-0" style={{
        background: "radial-gradient(ellipse 70% 80% at 80% 50%, rgba(34,90,48,0.45) 0%, transparent 65%)"
      }} />
      <div className="absolute inset-0 z-0 opacity-[0.06]" style={{
        backgroundImage: "repeating-linear-gradient(120deg, rgba(255,255,255,0.8) 0px, rgba(255,255,255,0.8) 1px, transparent 1px, transparent 60px)"
      }} />

      <div className="container relative z-10 mx-auto px-6 flex-1 flex items-center">
        <div className="grid lg:grid-cols-2 gap-12 items-center w-full pt-16 pb-12">
          <div>
          <FadeIn>
            <div className="flex items-center gap-3 mb-12">
              <div className="h-[1px] w-10 bg-foreground/30" />
              <span className="section-label">AI-First Strategic Consulting</span>
            </div>
          </FadeIn>

          <FadeIn delay={0.1}>
            <h1 className="text-5xl md:text-[4.75rem] font-serif leading-[1.02] mb-8 text-gradient">
              Reduce manual workflow load.<br />
              <em className="not-italic font-light">Deploy agents where it pays.</em>
            </h1>
          </FadeIn>

          <FadeIn delay={0.2}>
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-md mb-10 font-sans font-light">
              We map each workflow, estimate automation lift, then ship production agents with guardrails, testing, and owner handoff in six weeks.
            </p>
          </FadeIn>

          <FadeIn delay={0.3} className="flex flex-col sm:flex-row gap-4 mb-14">
            <a href="#assessment">
              <Button size="lg" className="rounded-none h-14 px-8 text-sm uppercase tracking-widest bg-white text-black hover:bg-gray-100">
                Get Free Scorecard <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </a>
            <a href="#methodology">
              <Button variant="outline" size="lg" className="rounded-none h-14 px-8 text-sm uppercase tracking-widest border-white/20 hover:bg-white/5">
                Our Methodology
              </Button>
            </a>
          </FadeIn>

          <FadeIn delay={0.4}>
            <div className="flex gap-10 border-t border-white/10 pt-8">
                {[
                { stat: "90%", label: "manual effort removed from repetitive steps" },
                { stat: "6 wks", label: "audit to first production workflow" },
                { stat: "3", label: "required controls: evals, logging, approval" },
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
            <motion.div style={{ y: panelY }} className="border border-white/15 bg-black/40 backdrop-blur p-8 lg:p-10">
              <div className="section-label mb-4">Practice Scope</div>
              <h2 className="text-3xl md:text-4xl font-serif mb-6">From first audit to full agentic deployment.</h2>
              <div className="space-y-4 text-sm font-light text-muted-foreground">
                {[
                  "Week 1: workflow map, failure points, and priority queue.",
                  "Week 2-3: agent roles, tool permissions, and prompt contracts.",
                  "Week 4-6: staging rollout, eval suite, and operator training.",
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

      <div className="relative z-10 border-t border-white/8 py-4 overflow-hidden bg-background/60 backdrop-blur-sm">
        <div className="flex animate-marquee">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i} className="section-label flex items-center gap-3 shrink-0 px-8">
              <span className="w-1.5 h-1.5 rounded-full bg-white/30 inline-block" />
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
    <div className="container mx-auto px-6">
      <div className="grid md:grid-cols-2 gap-16 items-center">
        <div>
          <FadeIn>
            <h2 className="text-4xl md:text-5xl font-serif mb-8">Most teams buy AI seats but keep the same manual workflow.</h2>
            <p className="text-lg text-muted-foreground mb-6 font-light leading-relaxed">
              Analysts still copy data between systems, managers still approve low-risk tasks, and reporting still depends on one person stitching documents every Friday.
            </p>
            <p className="text-lg text-muted-foreground font-light leading-relaxed">
              We replace these steps with targeted agents tied to your APIs and policies, then hand your team runbooks, fallback rules, and monthly performance baselines.
            </p>
          </FadeIn>
        </div>
        <div className="relative h-[600px] w-full border border-white/10 bg-background overflow-hidden p-8 flex flex-col justify-end">
          <img src={dataVis} alt="Data visualization" className="absolute inset-0 w-full h-full object-cover opacity-50 mix-blend-screen" />
          <div className="relative z-10 bg-black/80 backdrop-blur border border-white/10 p-6">
            <div className="section-label mb-2">Client Benchmark</div>
            <div className="text-3xl font-serif mb-1">90% Reduction</div>
            <div className="text-sm font-sans text-muted-foreground">in manual processing time on invoice, intake, and reporting flows</div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

const SocialProof = () => (
  <section className="py-24 border-t border-white/5">
    <div className="container mx-auto px-6">
      <FadeIn>
        <div className="flex items-center gap-3 mb-12 justify-center">
          <div className="h-[1px] w-10 bg-foreground/30" />
          <span className="section-label">Trusted By Operators</span>
          <div className="h-[1px] w-10 bg-foreground/30" />
        </div>
      </FadeIn>

      <FadeIn delay={0.1}>
        <figure className="max-w-3xl mx-auto text-center">
          <Quote className="w-8 h-8 text-primary/60 mx-auto mb-6" aria-hidden="true" />
          <blockquote className="text-2xl md:text-3xl font-serif leading-relaxed text-foreground/90 mb-8">
            &ldquo;DeerPark&apos;s diagnostic surfaced three workflows where agents paid back in under a quarter. The deployment shipped on schedule with the eval coverage our compliance team required.&rdquo;
          </blockquote>
          <figcaption className="text-sm font-sans text-muted-foreground">
            <span className="text-foreground font-medium">Head of Operations</span>
            <span className="mx-2 text-foreground/30">&middot;</span>
            <span>Fortune 500 Financial Services</span>
          </figcaption>
        </figure>
      </FadeIn>

      <FadeIn delay={0.2}>
        <div className="mt-20 pt-12 border-t border-white/5">
          <p className="section-label text-center text-muted-foreground/60 mb-8">Engagements across</p>
          <div className="flex flex-wrap justify-center items-center gap-x-12 gap-y-4 text-sm font-sans text-muted-foreground/70 uppercase tracking-[0.15em]">
            <span>Financial Services</span>
            <span className="text-foreground/20">&bull;</span>
            <span>Healthcare</span>
            <span className="text-foreground/20">&bull;</span>
            <span>Logistics</span>
            <span className="text-foreground/20">&bull;</span>
            <span>Legal</span>
            <span className="text-foreground/20">&bull;</span>
            <span>SaaS</span>
          </div>
        </div>
      </FadeIn>
    </div>
  </section>
);

const SERVICE_PILLARS = [
  {
    phase: "01",
    title: "Assess",
    icon: ScanSearch,
    summary: "We map your current process end-to-end and surface the workflows where agents pay back fastest.",
    services: [
      "Workflow Diagnostic & Mapping",
      "AI Application Assessment",
      "Tool & Vendor Evaluation",
    ],
  },
  {
    phase: "02",
    title: "Architect",
    icon: Layers,
    summary: "We design agent roles, tool permissions, orchestration logic, and eval thresholds that meet your security and compliance bar.",
    services: [
      "Agent Architecture & Design",
      "Prompt Engineering & Governance",
      "Multi-Agent Orchestration",
      "Foundation Model Evaluation",
    ],
  },
  {
    phase: "03",
    title: "Deploy",
    icon: Rocket,
    summary: "We ship to your stack with logging, approval gates, and operator playbooks so your team runs the system after handoff.",
    services: [
      "MCP & Integration Engineering",
      "Capability Rollout & Enablement",
    ],
  },
];

const Services = () => (
  <section id="services" className="py-32 border-t border-white/5">
    <div className="container mx-auto px-6">
      <FadeIn>
        <div className="flex items-center gap-3 mb-16">
          <div className="h-[1px] w-12 bg-primary"></div>
          <span className="section-label">Practice Areas</span>
        </div>
        <h2 className="text-4xl md:text-6xl font-serif mb-6 max-w-3xl">Three pillars. One continuous engagement.</h2>
        <p className="text-lg text-muted-foreground font-light max-w-2xl mb-20">
          Every engagement moves through assessment, architecture, and deployment — each pillar rolls up a set of specific practice areas your team will see on the plan.
        </p>
      </FadeIn>

      <div className="grid md:grid-cols-3 gap-8">
        {SERVICE_PILLARS.map((pillar, i) => (
          <FadeIn key={pillar.phase} delay={i * 0.1}>
            <div className="group h-full border border-white/10 bg-white/[0.02] p-8 hover:bg-white/[0.04] transition-colors flex flex-col">
              <div className="flex items-center justify-between mb-8">
                <span className="font-sans text-xs font-medium tracking-[0.15em] text-muted-foreground uppercase">{pillar.phase}</span>
                <div className="p-3 border border-white/10 bg-white/5 group-hover:bg-white/10 transition-colors">
                  <pillar.icon className="w-5 h-5 text-primary" />
                </div>
              </div>
              <h3 className="text-3xl font-serif mb-4">{pillar.title}</h3>
              <p className="text-muted-foreground font-light leading-relaxed text-sm mb-8">
                {pillar.summary}
              </p>
              <div className="mt-auto pt-6 border-t border-white/5">
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

const TechStack = () => {
  const concepts = [
    { label: "Agents", desc: "Autonomous AI systems with defined skills and tool access, capable of completing multi-step tasks without human intervention." },
    { label: "Skills", desc: "Discrete capabilities assigned to agents — from web search and document retrieval to code execution and API calls — composable and reusable across workflows." },
    { label: "MCPs", desc: "Model Context Protocols provide agents with structured, permission-controlled access to your internal data, software, and APIs in real time." },
    { label: "Prompts", desc: "The governed interface between your organization's knowledge and model behavior — designed, versioned, and maintained as a strategic internal asset." },
    { label: "Orchestration", desc: "The coordination layer that sequences agents, routes tasks, handles failures, and synthesizes outputs into coherent results across complex workflows." },
    { label: "Evals", desc: "Systematic frameworks for measuring whether agent outputs are correct, safe, and on-task — including LLM-as-judge pipelines, ground truth test suites, regression testing across prompt versions, and human review workflows." },
  ];

  return (
    <section id="impact" className="py-32 border-t border-white/5 bg-card">
      <div className="container mx-auto px-6">
        <FadeIn>
          <div className="flex items-center gap-3 mb-16">
            <div className="h-[1px] w-12 bg-primary"></div>
            <span className="section-label">The Stack We Build With</span>
          </div>
          <h2 className="text-4xl md:text-6xl font-serif mb-6 max-w-3xl">The technical stack behind reliable agent workflows.</h2>
          <p className="text-lg text-muted-foreground font-light max-w-2xl mb-20">
            Each implementation uses the same core components: scoped agent roles, controlled data access, orchestration rules, and measurable quality checks.
          </p>
        </FadeIn>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/5">
          {concepts.map((c, i) => (
            <FadeIn key={i} delay={i * 0.07}>
              <div className="bg-background p-8 hover:bg-white/[0.03] transition-colors">
                <div className="font-sans text-xs font-semibold uppercase tracking-[0.15em] text-primary/80 mb-4">{c.label}</div>
                <p className="text-muted-foreground font-light text-sm leading-relaxed">{c.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
};

const Approach = () => (
  <section id="methodology" className="py-32 bg-foreground text-background">
    <div className="container mx-auto px-6">
      <div className="flex flex-col md:flex-row justify-between items-end mb-20">
        <FadeIn>
          <h2 className="text-4xl md:text-6xl font-serif max-w-2xl">The DeerPark Methodology.</h2>
        </FadeIn>
        <FadeIn delay={0.2} className="max-w-md mt-8 md:mt-0 text-background/70 font-light">
          We build custom workflow systems for your environment and hand your team the operating model to run them after launch.
        </FadeIn>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {[
          {
            step: "01",
            title: "Workflow Diagnostic",
            desc: "We map your current process end-to-end, measure cycle time and error rate, and select the first workflow where automation reduces cost quickly."
          },
          {
            step: "02",
            title: "System Architecture",
            desc: "We define agent skills, tool permissions, orchestration logic, and eval thresholds based on your security and compliance requirements."
          },
          {
            step: "03",
            title: "Deployment & Enablement",
            desc: "We deploy to your stack, run acceptance tests, train workflow owners, and set a review cadence for quality, latency, and escalation metrics."
          }
        ].map((s, i) => (
          <FadeIn key={i} delay={i * 0.15}>
            <div className="border-t border-background/20 pt-8">
              <div className="font-sans text-xs font-medium tracking-[0.15em] mb-6 text-background/40 uppercase">{s.step}</div>
              <h3 className="text-2xl font-serif mb-4">{s.title}</h3>
              <p className="text-background/80 font-light text-sm leading-relaxed">{s.desc}</p>
            </div>
          </FadeIn>
        ))}
      </div>
    </div>
  </section>
);

const Trust = () => (
  <section id="about" className="py-32 relative overflow-hidden">
    <div className="absolute inset-0 z-0">
      <img src={officeImg} alt="Office" className="w-full h-full object-cover opacity-20 grayscale" />
      <div className="absolute inset-0 bg-background/90 mix-blend-multiply" />
      <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
    </div>

    <div className="container relative z-10 mx-auto px-6 text-center max-w-4xl">
      <FadeIn>
        <div className="inline-block p-4 border border-white/10 bg-black/50 backdrop-blur-md mb-8">
          <Network className="w-8 h-8" />
        </div>
        <h2 className="text-4xl md:text-5xl font-serif mb-8 leading-tight">
          Where strategic consulting meets<br />agentic AI.
        </h2>
        <p className="text-xl text-muted-foreground font-light mb-12">
          Our team has delivered enterprise software, operations programs, and production AI systems. We focus on teams with high process volume and low tolerance for output errors.
        </p>
        <a href="#assessment">
          <Button size="lg" className="rounded-none h-14 px-10 text-sm uppercase tracking-widest bg-white text-black hover:bg-gray-200">
            Request a Confidential Assessment
          </Button>
        </a>
      </FadeIn>
    </div>
  </section>
);

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
    <section id="assessment" className="py-32 border-t border-white/10 bg-card">
      <div className="container mx-auto px-6">
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
              <form onSubmit={handleSubmit} className="border border-white/10 bg-background p-8 space-y-5">
                <div>
                  <label htmlFor="name" className="section-label block mb-2">Name</label>
                  <input id="name" name="name" required disabled={submitting} className="w-full h-12 bg-card border border-white/10 px-4 text-sm outline-none focus:border-primary/80 disabled:opacity-50" />
                </div>
                <div>
                  <label htmlFor="email" className="section-label block mb-2">Work Email</label>
                  <input id="email" name="email" type="email" required disabled={submitting} className="w-full h-12 bg-card border border-white/10 px-4 text-sm outline-none focus:border-primary/80 disabled:opacity-50" />
                </div>
                <div>
                  <label htmlFor="company" className="section-label block mb-2">Company</label>
                  <input id="company" name="company" required disabled={submitting} className="w-full h-12 bg-card border border-white/10 px-4 text-sm outline-none focus:border-primary/80 disabled:opacity-50" />
                </div>
                <div>
                  <label htmlFor="challenge" className="section-label block mb-2">Biggest Workflow Challenge</label>
                  <textarea id="challenge" name="challenge" rows={4} required disabled={submitting} className="w-full bg-card border border-white/10 px-4 py-3 text-sm outline-none focus:border-primary/80 disabled:opacity-50" />
                </div>
                <Button type="submit" size="lg" disabled={submitting} className="w-full rounded-none h-14 px-8 text-sm uppercase tracking-widest bg-white text-black hover:bg-gray-100 disabled:opacity-60">
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
  <footer className="border-t border-white/10 bg-background pt-20 pb-10">
    <div className="container mx-auto px-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-20">
        <div className="col-span-1 md:col-span-2">
          <a href="/" className="flex items-center gap-3 font-wordmark text-[1.35rem] font-medium tracking-[0.06em] text-foreground mb-6">
            <img src={logo} alt="DeerPark icon" className="h-10 w-10 object-contain brightness-150" />
            <span>{"DeerPark"}<span className="text-foreground/50 font-light">.io</span></span>
          </a>
          <p className="text-muted-foreground font-light text-sm max-w-sm">
            Strategic AI implementation for high-volume workflows. We design, deploy, and operationalize agents tied to measurable business outcomes.
          </p>
        </div>
        <div>
          <h4 className="font-sans text-xs font-semibold uppercase tracking-[0.15em] mb-6 text-foreground">Practice</h4>
          <ul className="space-y-4 text-sm text-muted-foreground font-light">
            <li><a href="#services" className="hover:text-white transition-colors">Assess</a></li>
            <li><a href="#services" className="hover:text-white transition-colors">Architect</a></li>
            <li><a href="#services" className="hover:text-white transition-colors">Deploy</a></li>
            <li><a href="#impact" className="hover:text-white transition-colors">Technical Stack</a></li>
          </ul>
        </div>
        <div>
          <h4 className="font-sans text-xs font-semibold uppercase tracking-[0.15em] mb-6 text-foreground">Company</h4>
          <ul className="space-y-4 text-sm text-muted-foreground font-light">
            <li><a href="#about" className="hover:text-white transition-colors">About Us</a></li>
            <li><a href="#methodology" className="hover:text-white transition-colors">Methodology</a></li>
            <li><a href="#assessment" className="hover:text-white transition-colors">Free Scorecard</a></li>
            <li><a href="mailto:contact@deerpark.io" className="hover:text-white transition-colors">Contact</a></li>
          </ul>
        </div>
      </div>
      <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-white/5 text-xs text-muted-foreground font-light">
        <div>&copy; {new Date().getFullYear()} DeerPark.io. All rights reserved.</div>
        <div className="flex gap-6 mt-4 md:mt-0">
          <a href="mailto:contact@deerpark.io?subject=Privacy+Inquiry" className="hover:text-white transition-colors">Privacy Policy</a>
          <a href="mailto:contact@deerpark.io?subject=Terms+Inquiry" className="hover:text-white transition-colors">Terms of Service</a>
        </div>
      </div>
    </div>
  </footer>
);

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-white selection:text-black">
      <Navbar />
      <main>
        <Hero />
        <Problem />
        <SocialProof />
        <Services />
        <Approach />
        <TechStack />
        <Trust />
        <LeadCapture />
      </main>
      <a
        href="#assessment"
        className="fixed bottom-4 right-4 z-50 md:hidden rounded-none bg-white text-black px-5 py-3 text-[11px] font-semibold uppercase tracking-widest shadow-lg"
      >
        Get Free Scorecard
      </a>
      <Footer />
    </div>
  );
}
