import React, { useEffect, useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, ChevronRight, BarChart3, Clock, Zap, Shield, FileText, MessagesSquare } from "lucide-react";
import heroTexture from "../assets/hero-texture.png";
import dataVis from "../assets/data-vis.png";
import officeImg from "../assets/office.png";

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
      <Link href="/" className="font-serif text-2xl font-semibold tracking-wide">
        deerpark<span className="text-muted-foreground">.io</span>
      </Link>
      <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
        <a href="#services" className="hover:text-foreground transition-colors">Services</a>
        <a href="#methodology" className="hover:text-foreground transition-colors">Methodology</a>
        <a href="#impact" className="hover:text-foreground transition-colors">Impact</a>
        <Button variant="secondary" className="font-sans text-xs uppercase tracking-widest rounded-none">
          Client Portal
        </Button>
        <Button className="font-sans text-xs uppercase tracking-widest rounded-none">
          Schedule Briefing
        </Button>
      </nav>
    </div>
  </header>
);

const Hero = () => {
  const { scrollYProgress } = useScroll();
  const y = useTransform(scrollYProgress, [0, 1], [0, 200]);

  return (
    <section className="relative min-h-[100dvh] flex items-center pt-20 overflow-hidden">
      <motion.div style={{ y }} className="absolute inset-0 z-0 opacity-40">
        <img src={heroTexture} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
      </motion.div>
      
      <div className="container relative z-10 mx-auto px-6">
        <div className="max-w-4xl">
          <FadeIn>
            <div className="flex items-center gap-3 mb-8">
              <div className="h-[1px] w-12 bg-primary"></div>
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">AI-First IR Consulting</span>
            </div>
          </FadeIn>
          
          <FadeIn delay={0.1}>
            <h1 className="text-6xl md:text-8xl font-serif leading-[1.05] mb-8 text-gradient">
              Precision advisory.<br />
              Accelerated by intelligence.
            </h1>
          </FadeIn>
          
          <FadeIn delay={0.2}>
            <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed max-w-2xl mb-12 font-sans font-light">
              We redesign investor relations workflows using advanced AI models, delivering up to 90% time savings and uncompromising analytical rigor for the modern CFO.
            </p>
          </FadeIn>
          
          <FadeIn delay={0.3} className="flex flex-col sm:flex-row gap-4">
            <Button size="lg" className="rounded-none h-14 px-8 text-sm uppercase tracking-widest bg-white text-black hover:bg-gray-200">
              Schedule Confidential Briefing <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
            <Button variant="outline" size="lg" className="rounded-none h-14 px-8 text-sm uppercase tracking-widest border-white/20 hover:bg-white/5">
              Explore Methodology
            </Button>
          </FadeIn>
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
            <h2 className="text-4xl md:text-5xl font-serif mb-8">The manual synthesis era is over.</h2>
            <p className="text-lg text-muted-foreground mb-6 font-light leading-relaxed">
              Investor relations teams spend countless hours parsing transcripts, summarizing market sentiment, and drafting disclosures. This manual extraction of insight is prone to fatigue, bias, and delay.
            </p>
            <p className="text-lg text-muted-foreground font-light leading-relaxed">
              Deerpark replaces brute-force analysis with highly tuned AI agents. We build bespoke systems that instantly process qualitative data, allowing your team to focus entirely on strategic narrative and relationship management.
            </p>
          </FadeIn>
        </div>
        <div className="relative h-[600px] w-full border border-white/10 bg-background overflow-hidden p-8 flex flex-col justify-end">
          <img src={dataVis} alt="Data visualization" className="absolute inset-0 w-full h-full object-cover opacity-50 mix-blend-screen" />
          <div className="relative z-10 bg-black/80 backdrop-blur border border-white/10 p-6">
            <div className="font-mono text-sm text-muted-foreground mb-2">SYSTEM METRIC</div>
            <div className="text-3xl font-serif mb-1">90% Reduction</div>
            <div className="text-sm font-sans text-muted-foreground">in manual synthesis time</div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

const Services = () => {
  const services = [
    {
      title: "Earnings Call Preparation",
      desc: "Automated aggregation of peer transcripts, analyst notes, and internal data to generate comprehensive Q&A prep documents and scripts.",
      icon: MessagesSquare
    },
    {
      title: "Roadshow Materials",
      desc: "Dynamic generation of localized investor profiles, historical interaction logs, and tailored pitch variations for institutional meetings.",
      icon: Zap
    },
    {
      title: "Disclosure Management",
      desc: "AI-assisted drafting and cross-referencing of quarterly filings against prior statements and peer disclosures to ensure narrative consistency.",
      icon: FileText
    },
    {
      title: "Shareholder Communications",
      desc: "Rapid drafting of precise, tone-matched correspondence for institutional and retail inquiries based on approved corporate messaging.",
      icon: Shield
    },
    {
      title: "Financial Narrative Development",
      desc: "Algorithmic analysis of market sentiment and media reception to refine positioning and address emerging investor concerns.",
      icon: BarChart3
    },
    {
      title: "Continuous Workflow Automation",
      desc: "End-to-end redesign of your IR tech stack, integrating bespoke LLM pipelines securely within your existing corporate infrastructure.",
      icon: Clock
    }
  ];

  return (
    <section id="services" className="py-32 border-t border-white/5">
      <div className="container mx-auto px-6">
        <FadeIn>
          <div className="flex items-center gap-3 mb-16">
            <div className="h-[1px] w-12 bg-primary"></div>
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Focus Areas</span>
          </div>
          <h2 className="text-4xl md:text-6xl font-serif mb-20 max-w-3xl">Comprehensive redesign of the IR function.</h2>
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

const Approach = () => (
  <section id="methodology" className="py-32 bg-foreground text-background">
    <div className="container mx-auto px-6">
      <div className="flex flex-col md:flex-row justify-between items-end mb-20">
        <FadeIn>
          <h2 className="text-4xl md:text-6xl font-serif max-w-2xl">The Deerpark Methodology.</h2>
        </FadeIn>
        <FadeIn delay={0.2} className="max-w-md mt-8 md:mt-0 text-background/70 font-light">
          We don't sell software. We sell operational leverage. Our engagements are consultative, deeply integrated, and intensely focused on measurable outcomes.
        </FadeIn>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {[
          { step: "01", title: "Diagnostic Audit", desc: "We map your current IR workflows, identifying latency, redundancy, and areas where human capital is misallocated to rote synthesis." },
          { step: "02", title: "System Architecture", desc: "We design custom AI agents and prompt chains tailored to your company's distinct voice, data structures, and regulatory constraints." },
          { step: "03", title: "Deployment & Training", desc: "We embed the solution into your environment, training your team to operate as editors of AI output rather than manual drafters." }
        ].map((s, i) => (
          <FadeIn key={i} delay={i * 0.15}>
            <div className="border-t border-background/20 pt-8">
              <div className="font-mono text-sm mb-6 text-background/50">{s.step}</div>
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
  <section className="py-32 relative overflow-hidden">
    <div className="absolute inset-0 z-0">
      <img src={officeImg} alt="Office" className="w-full h-full object-cover opacity-20 grayscale" />
      <div className="absolute inset-0 bg-background/90 mix-blend-multiply" />
      <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
    </div>
    
    <div className="container relative z-10 mx-auto px-6 text-center max-w-4xl">
      <FadeIn>
        <div className="inline-block p-4 border border-white/10 bg-black/50 backdrop-blur-md mb-8">
          <Shield className="w-8 h-8" />
        </div>
        <h2 className="text-4xl md:text-5xl font-serif mb-8 leading-tight">
          Where elite consulting meets<br />artificial intelligence.
        </h2>
        <p className="text-xl text-muted-foreground font-light mb-12">
          Founded by veterans of top-tier financial institutions and leading technology firms, Deerpark provides the discretion and rigor demanded by the Fortune 500.
        </p>
        <Button size="lg" className="rounded-none h-14 px-10 text-sm uppercase tracking-widest bg-white text-black hover:bg-gray-200">
          Request a Case Study
        </Button>
      </FadeIn>
    </div>
  </section>
);

const Footer = () => (
  <footer className="border-t border-white/10 bg-background pt-20 pb-10">
    <div className="container mx-auto px-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-20">
        <div className="col-span-1 md:col-span-2">
          <div className="font-serif text-2xl font-semibold tracking-wide mb-6">
            deerpark<span className="text-muted-foreground">.io</span>
          </div>
          <p className="text-muted-foreground font-light text-sm max-w-sm">
            AI-first investor relations consulting. We transform the IR function from a cost center to a strategic advantage through applied intelligence.
          </p>
        </div>
        <div>
          <h4 className="font-mono text-xs uppercase tracking-widest mb-6 text-foreground">Practice</h4>
          <ul className="space-y-4 text-sm text-muted-foreground font-light">
            <li><a href="#" className="hover:text-white transition-colors">Earnings Prep</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Disclosure Automation</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Market Intelligence</a></li>
            <li><a href="#" className="hover:text-white transition-colors">IR Tech Stack</a></li>
          </ul>
        </div>
        <div>
          <h4 className="font-mono text-xs uppercase tracking-widest mb-6 text-foreground">Company</h4>
          <ul className="space-y-4 text-sm text-muted-foreground font-light">
            <li><a href="#" className="hover:text-white transition-colors">About Us</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Methodology</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Client Portal</a></li>
          </ul>
        </div>
      </div>
      <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-white/5 text-xs text-muted-foreground font-light">
        <div>&copy; {new Date().getFullYear()} Deerpark.io. All rights reserved.</div>
        <div className="flex gap-6 mt-4 md:mt-0">
          <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
          <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
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
        <Approach />
        <Trust />
      </main>
      <Footer />
    </div>
  );
}
