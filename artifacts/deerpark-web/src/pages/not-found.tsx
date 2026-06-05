import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-layout";

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground selection:bg-foreground selection:text-background">
      <SiteHeader />
      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-6 py-24 md:py-32">
          <div className="flex items-center gap-3 mb-10">
            <div className="h-[1px] w-10 bg-foreground/30" />
            <span className="section-label">404 — Not Found</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-serif leading-[1.1] mb-8 pb-1">
            <em className="not-italic font-light">This page wandered off.</em>
          </h1>
          <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-xl mb-10 font-light">
            The address you followed isn't on the site. It may have moved, or the link
            may have been mistyped.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm uppercase tracking-widest underline decoration-foreground/25 underline-offset-[6px] hover:decoration-foreground transition-colors"
          >
            Back to home <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
