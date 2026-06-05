import { Link } from "wouter";

const PRODUCTIVITY_STUDY_URL =
  "https://www.anthropic.com/research/estimating-productivity-gains";

const linkClass =
  "underline decoration-foreground/25 underline-offset-[6px] hover:decoration-foreground transition-colors";

export default function Home() {
  return (
    <main className="min-h-[100dvh] bg-background text-foreground flex items-center px-6 selection:bg-foreground selection:text-background">
      <ul className="w-full max-w-3xl mx-auto space-y-7 text-xl sm:text-2xl md:text-3xl font-serif leading-snug">
        <li>
          <Link href="/case-studies" className={linkClass}>
            AI Deployment
          </Link>
          <span className="text-muted-foreground font-light">{" — "}</span>
          <a
            href={PRODUCTIVITY_STUDY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            80% efficiency gain
          </a>
        </li>
        <li>
          <Link href="/products" className={linkClass}>
            Products
          </Link>
        </li>
        <li>
          <Link href="/benchmarks" className={linkClass}>
            Benchmarks
          </Link>
          <span className="text-muted-foreground font-light">
            {" — evaluating model performance and cost"}
          </span>
        </li>
      </ul>
    </main>
  );
}
