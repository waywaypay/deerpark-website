import React from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, Network, Cpu, GitBranch, Layers, Terminal, ScanSearch, FlaskConical, Scale, AppWindow } from "lucide-react";
import heroTexture from "../assets/hero-texture.png";
import dataVis from "../assets/data-vis.png";
import officeImg from "../assets/office.png";
import capybara from "../assets/capybara.png";

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
        <img src={capybara} alt="DeerPark mascot" className="h-12 w-12 object-contain" />
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
  const capybaraY = useTransform(scrollYProgress, [0, 1], [0, 80]);

  return (
    <section className="relative min-h-[100dvh] flex flex-col justify-between pt-20 overflow-hidden">
      {/* Subtle grid overlay */}
      <div className="absolute inset-0 z-0" style={{
        backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
        backgroundSize: "80px 80px"
      }} />
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-background via-background to-background/80" />

      {/* Main content */}
      <div className="container relative z-10 mx-auto px-6 flex-1 flex items-center">
        <div className="grid md:grid-cols-2 gap-8 items-center w-full py-12">
          {/* Left: text */}
          <div>
            <FadeIn>
              <div className="flex items-center gap-3 mb-10">
                <div className="h-[1px] w-12 bg-white/40"></div>
                <span className="section-label">AI-First Strategic Consulting</span>
              </div>
            </FadeIn>

            <FadeIn delay={0.1}>
              <h1 className="text-5xl md:text-[4.5rem] font-serif leading-[1.05] mb-8 text-gradient">
                We rebuild how your organization works.
              </h1>
            </FadeIn>

            <FadeIn delay={0.2}>
              <p className="text-lg text-muted-foreground leading-relaxed max-w-lg mb-12 font-sans font-light">
                DeerPark maps your operations, architects multi-agent systems, and deploys agentic infrastructure — fundamentally restructuring where human effort is actually required.
              </p>
            </FadeIn>

            <FadeIn delay={0.3} className="flex flex-col sm:flex-row gap-4">
              <a href="mailto:contact@deerpark.io?subject=Confidential+Briefing+Request">
                <Button size="lg" className="rounded-none h-14 px-8 text-sm uppercase tracking-widest bg-white text-black hover:bg-gray-200">
                  Schedule Confidential Briefing <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </a>
              <a href="#methodology">
                <Button variant="outline" size="lg" className="rounded-none h-14 px-8 text-sm uppercase tracking-widest border-white/20 hover:bg-white/5">
                  Explore Methodology
                </Button>
              </a>
            </FadeIn>
          </div>

          {/* Right: capybara */}
          <motion.div
            style={{ y: capybaraY }}
            className="hidden md:flex items-center justify-center relative"
          >
            <FadeIn delay={0.15} className="relative">
              {/* warm ambient glow */}
              <div className="absolute inset-0 -m-20 rounded-full bg-amber-800/25 blur-3xl pointer-events-none" />
              <div className="absolute inset-0 -m-8 rounded-full bg-amber-900/15 blur-xl pointer-events-none" />
              <img
                src={capybara}
                alt="DeerPark"
                className="relative z-10 w-[440px] h-[440px] object-contain select-none"
                draggable={false}
              />
            </FadeIn>
          </motion.div>
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
            <h2 className="text-4xl md:text-5xl font-serif mb-8">Most organizations are running 2019 workflows on 2025 infrastructure.</h2>
            <p className="text-lg text-muted-foreground mb-6 font-light leading-relaxed">
              Teams have adopted AI tools piecemeal — a chatbot here, a summarizer there. But the underlying workflow logic hasn't changed. The result is AI that assists, not AI that transforms.
            </p>
            <p className="text-lg text-muted-foreground font-light leading-relaxed">
              DeerPark takes a different approach. We map your entire operational stack, identify where agents, prompts, and Model Context Protocols can displace manual effort, and architect purpose-built systems that fundamentally restructure how work gets done.
            </p>
          </FadeIn>
        </div>
        <div className="relative h-[600px] w-full border border-white/10 bg-background overflow-hidden p-8 flex flex-col justify-end">
          <img src={dataVis} alt="Data visualization" className="absolute inset-0 w-full h-full object-cover opacity-50 mix-blend-screen" />
          <div className="relative z-10 bg-black/80 backdrop-blur border border-white/10 p-6">
            <div className="section-label mb-2">Client Benchmark</div>
            <div className="text-3xl font-serif mb-1">90% Reduction</div>
            <div className="text-sm font-sans text-muted-foreground">in manual processing time, across client engagements</div>
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
      desc: "We document every workflow, decision point, and human handoff across your organization — quantifying where time and capital are being lost to tasks that agents can own end-to-end.",
      icon: ScanSearch
    },
    {
      title: "Agent Architecture & Design",
      desc: "We design purpose-built AI agents with clearly defined skills, memory structures, and tool access — built to operate autonomously within your existing systems and data environment.",
      icon: Network
    },
    {
      title: "MCP & Integration Engineering",
      desc: "We implement Model Context Protocols (MCPs) that give your agents secure, structured access to internal databases, APIs, and enterprise software — safely and at scale.",
      icon: Terminal
    },
    {
      title: "Prompt Engineering & Governance",
      desc: "We build and maintain your organization's prompt library — system prompts, chain-of-thought templates, few-shot examples, and evaluation frameworks — as a governed internal asset.",
      icon: GitBranch
    },
    {
      title: "Multi-Agent Orchestration",
      desc: "For complex workflows, we design orchestrator-agent hierarchies where specialized sub-agents handle discrete tasks and a coordinating layer manages sequencing, routing, and error recovery.",
      icon: Layers
    },
    {
      title: "Capability Rollout & Enablement",
      desc: "We manage phased deployment of AI capabilities across business units, training teams to operate as orchestrators of agentic systems rather than manual executors of repetitive tasks.",
      icon: Cpu
    },
    {
      title: "Tool & Vendor Evaluation",
      desc: "We assess the crowded AI tooling landscape on your behalf — evaluating orchestration frameworks, retrieval systems, vector stores, and SaaS AI products against your specific technical requirements and build-versus-buy calculus.",
      icon: Scale
    },
    {
      title: "Foundation Model Evaluation",
      desc: "We run structured benchmarks across frontier and open-weight models for your specific tasks — measuring accuracy, latency, cost, and context handling to identify the right model for each workload in your stack.",
      icon: FlaskConical
    },
    {
      title: "AI Application Assessment",
      desc: "We audit deployed AI applications for output quality, failure modes, prompt injection risk, and alignment with business intent — providing a rigorous report and a remediation roadmap before systems reach production at scale.",
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
          <h2 className="text-4xl md:text-6xl font-serif mb-20 max-w-3xl">From first audit to full agentic deployment.</h2>
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
          <h2 className="text-4xl md:text-6xl font-serif mb-6 max-w-3xl">The vocabulary of enterprise AI. Spoken fluently.</h2>
          <p className="text-lg text-muted-foreground font-light max-w-2xl mb-20">
            We don't translate AI for your business — we build the AI that becomes your business advantage. Every engagement is grounded in the primitives that make enterprise AI systems actually work.
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
          We don't sell software licenses or pre-packaged AI tools. We sell operational leverage — bespoke systems built for your specific workflows, data, and organizational constraints.
        </FadeIn>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {[
          {
            step: "01",
            title: "Workflow Diagnostic",
            desc: "We conduct a comprehensive audit of your existing processes — documenting every workflow, tool, decision gate, and human touchpoint. We quantify time cost, error rate, and strategic misallocation across your operations."
          },
          {
            step: "02",
            title: "System Architecture",
            desc: "We design a tailored AI system: agent roles and skills, prompt libraries, MCP integrations, orchestration logic, and evaluation criteria. Every element is scoped to your environment, data governance requirements, and measurable targets."
          },
          {
            step: "03",
            title: "Deployment & Enablement",
            desc: "We build, test, and deploy the system within your infrastructure. We train your teams to operate as orchestrators — setting goals, reviewing outputs, and continuously improving the agents that execute on their behalf."
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
          Founded by veterans of enterprise software, management consulting, and AI research, DeerPark operates at the intersection of deep domain knowledge and frontier model capability. We serve organizations that can't afford to get AI wrong.
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

const Footer = () => (
  <footer className="border-t border-white/10 bg-background pt-20 pb-10">
    <div className="container mx-auto px-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-20">
        <div className="col-span-1 md:col-span-2">
          <a href="/" className="flex items-center gap-3 font-wordmark text-[1.35rem] font-medium tracking-[0.06em] text-foreground mb-6">
            <img src={capybara} alt="DeerPark mascot" className="h-12 w-12 object-contain" />
            <span>{"DeerPark"}<span className="text-foreground/50 font-light">.io</span></span>
          </a>
          <p className="text-muted-foreground font-light text-sm max-w-sm">
            AI-first strategic consulting. We help organizations redesign how work gets done — deploying agents, skills, and agentic infrastructure that compound over time.
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
      </main>
      <Footer />
    </div>
  );
}
