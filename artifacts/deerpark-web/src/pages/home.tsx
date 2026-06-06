import { Link } from "wouter";
import { ArrowRight } from "lucide-react";

const PRODUCTIVITY_STUDY_URL =
  "https://www.anthropic.com/research/estimating-productivity-gains";

const CONTACT_EMAIL = "contact@deerpark.io";

const headingClass =
  "font-serif text-2xl sm:text-3xl md:text-4xl text-foreground transition-colors group-hover:text-foreground/60";

const descriptorClass =
  "mt-1 text-sm sm:text-base text-muted-foreground font-light";

const inlineLinkClass =
  "underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground text-foreground/80 hover:text-foreground transition-colors";

export default function Home() {
  return (
    <main className="min-h-[100dvh] bg-background text-foreground flex items-center px-6 py-14 sm:py-20 selection:bg-foreground selection:text-background">
      <div className="w-full max-w-3xl mx-auto">
        <ul className="border-b border-foreground/10">
          <li className="border-t border-foreground/10 py-5 sm:py-7 md:py-8">
            <Link href="/case-studies" className="group inline-block">
              <span className={headingClass}>AI Deployment</span>
            </Link>
            <p className={descriptorClass}>
              Case studies with up to an{" "}
              <a
                href={PRODUCTIVITY_STUDY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={inlineLinkClass}
              >
                80% efficiency gain
              </a>
            </p>
          </li>
          <li className="border-t border-foreground/10 py-5 sm:py-7 md:py-8">
            <Link href="/products" className="group inline-block">
              <span className={headingClass}>Products</span>
            </Link>
            <p className={descriptorClass}>
              MCP servers and developer tooling
            </p>
          </li>
          <li className="border-t border-foreground/10 py-5 sm:py-7 md:py-8">
            <Link href="/benchmarks" className="group inline-block">
              <span className={headingClass}>Benchmarks</span>
            </Link>
            <p className={descriptorClass}>
              Evaluating model performance and cost
            </p>
          </li>
        </ul>

        <div className="mt-8 sm:mt-12">
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="group inline-flex items-center gap-2 rounded-full bg-foreground text-background px-6 py-3 text-sm sm:text-base font-medium tracking-wide hover:bg-foreground/85 transition-colors"
          >
            Schedule a call
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>
      </div>
    </main>
  );
}
