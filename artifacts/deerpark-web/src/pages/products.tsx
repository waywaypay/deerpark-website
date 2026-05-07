import { Link } from "wouter";
import { ArrowRight, Mail, Sparkles } from "lucide-react";
import { AssessmentFAB, FadeIn, Footer, Navbar } from "@/components/site-layout";

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
      "An always-on agent that reads the public AI landscape — labs, clouds, model releases, community signal — and ships a single curated brief every weekday at 3:30 PM PT.",
    bullets: [
      "Filters for enterprise-relevant releases and research",
      "Cites every claim — no hallucinated coverage",
      "Email + on-site archive",
    ],
  },
];

const ProductsHero = () => (
  <section className="pt-32 md:pt-40 pb-12 border-b border-foreground/10">
    <div className="max-w-7xl mx-auto px-6">
      <FadeIn>
        <div className="flex items-center gap-3 mb-8">
          <div className="h-[1px] w-12 bg-primary"></div>
          <span className="section-label">Products</span>
        </div>
        <h1 className="text-4xl md:text-6xl font-serif mb-6 max-w-3xl">
          Agents we build, host, and keep running.
        </h1>
        <p className="text-lg text-muted-foreground font-light max-w-2xl">
          Production AI agents from our practice. Each one solves a specific operator workflow,
          runs on our infrastructure, and improves as we tune it. Pick one off the shelf — or
          have us build the one you actually need.
        </p>
      </FadeIn>
    </div>
  </section>
);

const ProductGrid = () => (
  <section className="py-24 md:py-32">
    <div className="max-w-7xl mx-auto px-6">
      <div className="grid md:grid-cols-2 gap-8">
        {PRODUCTS.map((product, i) => (
          <FadeIn key={product.href} delay={i * 0.1}>
            <Link
              href={product.href}
              className="group block h-full border border-foreground/15 bg-foreground/[0.03] p-8 hover:bg-white/[0.04] transition-colors"
            >
              <div className="flex items-center justify-between mb-8">
                <span className="font-sans text-xs font-medium tracking-[0.15em] text-muted-foreground uppercase">
                  {product.status}
                </span>
                <div className="p-3 border border-foreground/15 bg-foreground/5 group-hover:bg-foreground/15 transition-colors">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
              </div>
              <h3 className="text-3xl font-serif mb-3">{product.name}</h3>
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

        <FadeIn delay={PRODUCTS.length * 0.1}>
          <div className="h-full border border-dashed border-foreground/20 bg-transparent p-8 flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <span className="font-sans text-xs font-medium tracking-[0.15em] text-muted-foreground uppercase">
                In development
              </span>
              <div className="p-3 border border-dashed border-foreground/20 bg-transparent">
                <Sparkles className="w-5 h-5 text-foreground/30" />
              </div>
            </div>
            <h3 className="text-3xl font-serif mb-3 text-foreground/60">More agents soon.</h3>
            <p className="text-sm text-muted-foreground font-light leading-relaxed mb-8">
              We're shipping additional agents this quarter — outbound research, internal
              knowledge ops, and a writer for regulated content. If you have a workflow you'd
              like turned into an agent, we'd rather build yours next than guess.
            </p>
            <div className="mt-auto">
              <a
                href="/#assessment"
                className="inline-flex items-center text-xs uppercase tracking-widest text-foreground/80 hover:text-foreground"
              >
                Tell us your workflow <ArrowRight className="ml-2 w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </FadeIn>
      </div>

      <FadeIn delay={0.3}>
        <div className="mt-20 border-t border-foreground/10 pt-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="max-w-xl">
            <h4 className="text-2xl font-serif mb-2">Want a custom agent?</h4>
            <p className="text-sm text-muted-foreground font-light">
              Most engagements start with a free assessment — we map the workflow, scope the
              agent, and give you a fixed plan before any build work begins.
            </p>
          </div>
          <a
            href="/#assessment"
            className="inline-flex items-center gap-2 bg-foreground text-background px-6 py-3 font-sans text-xs uppercase tracking-widest hover:bg-foreground/90"
          >
            <Mail className="w-3.5 h-3.5" />
            Get free assessment
          </a>
        </div>
      </FadeIn>
    </div>
  </section>
);

export default function Products() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-foreground selection:text-background">
      <Navbar />
      <main>
        <ProductsHero />
        <ProductGrid />
      </main>
      <AssessmentFAB />
      <Footer />
    </div>
  );
}
