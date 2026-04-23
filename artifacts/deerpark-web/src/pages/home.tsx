import React, { FormEvent, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, Network, Cpu, GitBranch, Layers, Terminal, ScanSearch, FlaskConical, Scale, AppWindow, Check } from "lucide-react";
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
        <a href="mailto:contact@deerpark.io?subject=Client+Portal+Access">
          <Button variant="secondary" className="font-sans text-xs uppercase tracking-widest rounded-none">
            Client Portal
          </Button>
        </a>
        <a href="mailto:contact@deerpark.io?subject=Briefing+Request">
          <Button className="font-sans text-xs uppercase tracking-widest rounded-none">
            Schedule Briefing
          </Button>
        </a>
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
      {/* Atmospheric background — light source from right */}
      <div className="absolute inset-0 z-0" style={{
        background: "radial-gradient(ellipse 70% 80% at 80% 50%, rgba(34,90,48,0.45) 0%, transparent 65%)"
      }} />
      {/* Fine diagonal lines for texture */}
      <div className="absolute inset-0 z-0 opacity-[0.06]" style={{
        backgroundImage: "repeating-linear-gradient(120deg, rgba(255,255,255,0.8) 0px, rgba(255,255,255,0.8) 1px, transparent 1px, transparent 60px)"
      }} />

      {/* Main content */}
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

      {/* Bottom ticker */}
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

const Services = () => {
  const services = [
    {
      title: "Workflow Diagnostic & Mapping",
      desc: "We capture each step, owner, and system touchpoint, then rank tasks by automation value, complexity, and risk so implementation starts where payback is fastest.",
      icon: ScanSearch
    },
    {
      title: "Agent Architecture & Design",
      desc: "We define agent roles, allowed actions, escalation paths, and context windows for each workflow so every task has clear boundaries and ownership.",
      icon: Network
    },
    {
      title: "MCP & Integration Engineering",
      desc: "We connect agents to your systems through MCP servers and direct APIs with role-based access, request logs, and test fixtures before production release.",
      icon: Terminal
    },
    {
      title: "Prompt Engineering & Governance",
      desc: "We version system prompts and task templates, attach acceptance tests to each change, and route high-risk outputs to human approval.",
      icon: GitBranch
    },
    {
      title: "Multi-Agent Orchestration",
      desc: "For multi-step work, we define orchestrator logic for routing, retry rules, timeout behavior, and fallback actions when a step fails.",
      icon: Layers
    },
    {
      title: "Capability Rollout & Enablement",
      desc: "We launch in phases with operator playbooks, change tracking, and weekly KPI reviews so teams can manage agent workflows without vendor dependence.",
      icon: Cpu
    },
    {
      title: "Tool & Vendor Evaluation",
      desc: "We compare platforms using your latency, security, and cost targets and deliver a build-vs-buy decision memo with migration effort estimates.",
      icon: Scale
    },
    {
      title: "Foundation Model Evaluation",
      desc: "We benchmark candidate models on your real tasks for accuracy, latency, and cost, then assign each workflow a default model and fallback model.",
      icon: FlaskConical
    },
    {
      title: "AI Application Assessment",
      desc: "We audit existing AI apps for failure patterns, prompt injection exposure, and policy gaps, then prioritize fixes by operational impact.",
      icon: AppWindow
    }
  ];

  return (
    <section id="services" className="py-32 border-t border-white/5">
      <div className="container mx-auto px-6">
        <FadeIn>
          <div className="flex items-center gap-3 mb-16">
            <div className="h-[1px] w-12 bg-primary"></div>
            <span className="section-label">Practice Areas</span>
          </div>
          <h2 className="text-4xl md:text-6xl font-serif mb-20 max-w-3xl">Delivery scope by workflow stage.</h2>
        </FadeIn>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-16">
          {services.map((s, i) => (
            <FadeIn key={i} delay={i * 0.1}>
              <div className="group">
                <div className="mb-6 p-4 border border-white/10 inline-block bg-white/5 group-hover:bg-white/10 transition-colors">
                  <s.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-serif mb-4">{s.title}</h3>
                <p className="text-muted-foreground font-light leading-relaxed text-sm">
                  {s.desc}
                </p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
};

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
        <a href="mailto:contact@deerpark.io?subject=Assessment+Request">
          <Button size="lg" className="rounded-none h-14 px-10 text-sm uppercase tracking-widest bg-white text-black hover:bg-gray-200">
            Request a Confidential Assessment
          </Button>
        </a>
      </FadeIn>
    </div>
  </section>
);

const LeadCapture = () => {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const company = String(formData.get("company") || "").trim();
    const challenge = String(formData.get("challenge") || "").trim();

    const subject = encodeURIComponent("AI Workflow Scorecard Request");
    const body = encodeURIComponent(
      `Name: ${name}\nEmail: ${email}\nCompany: ${company}\nBiggest workflow challenge: ${challenge}`,
    );

    window.location.href = `mailto:contact@deerpark.io?subject=${subject}&body=${body}`;
    setSubmitted(true);
    event.currentTarget.reset();
  };

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
              <p>• Delivery target: 2 business days.</p>
              <p>• Includes effort estimate and priority ranking.</p>
              <p>• No software purchase required.</p>
            </div>
          </FadeIn>

          <FadeIn delay={0.1}>
            <form onSubmit={handleSubmit} className="border border-white/10 bg-background p-8 space-y-5">
              <div>
                <label htmlFor="name" className="section-label block mb-2">Name</label>
                <input id="name" name="name" required className="w-full h-12 bg-card border border-white/10 px-4 text-sm outline-none focus:border-primary/80" />
              </div>
              <div>
                <label htmlFor="email" className="section-label block mb-2">Work Email</label>
                <input id="email" name="email" type="email" required className="w-full h-12 bg-card border border-white/10 px-4 text-sm outline-none focus:border-primary/80" />
              </div>
              <div>
                <label htmlFor="company" className="section-label block mb-2">Company</label>
                <input id="company" name="company" required className="w-full h-12 bg-card border border-white/10 px-4 text-sm outline-none focus:border-primary/80" />
              </div>
              <div>
                <label htmlFor="challenge" className="section-label block mb-2">Biggest Workflow Challenge</label>
                <textarea id="challenge" name="challenge" rows={4} required className="w-full bg-card border border-white/10 px-4 py-3 text-sm outline-none focus:border-primary/80" />
              </div>
              <Button type="submit" size="lg" className="w-full rounded-none h-14 px-8 text-sm uppercase tracking-widest bg-white text-black hover:bg-gray-100">
                Send My Scorecard Request <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
              {submitted && (
                <p className="text-xs text-muted-foreground">
                  Thank you — your default email app should open to send the request.
                </p>
              )}
            </form>
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
            <li><a href="#services" className="hover:text-white transition-colors">Workflow Diagnostics</a></li>
            <li><a href="#services" className="hover:text-white transition-colors">Agent Architecture</a></li>
            <li><a href="#services" className="hover:text-white transition-colors">Model Evaluation</a></li>
            <li><a href="#services" className="hover:text-white transition-colors">Application Assessment</a></li>
            <li><a href="#services" className="hover:text-white transition-colors">Prompt Governance</a></li>
          </ul>
        </div>
        <div>
          <h4 className="font-sans text-xs font-semibold uppercase tracking-[0.15em] mb-6 text-foreground">Company</h4>
          <ul className="space-y-4 text-sm text-muted-foreground font-light">
            <li><a href="#about" className="hover:text-white transition-colors">About Us</a></li>
            <li><a href="#methodology" className="hover:text-white transition-colors">Methodology</a></li>
            <li><a href="#assessment" className="hover:text-white transition-colors">Free Scorecard</a></li>
            <li><a href="mailto:contact@deerpark.io" className="hover:text-white transition-colors">Contact</a></li>
            <li><a href="mailto:contact@deerpark.io?subject=Client+Portal+Access" className="hover:text-white transition-colors">Client Portal</a></li>
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
        <Services />
        <TechStack />
        <Approach />
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
