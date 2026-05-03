import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeIn, Footer, Navbar } from "@/components/site-layout";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-foreground selection:text-background">
      <Navbar />
      <main className="pt-32 md:pt-40 pb-32">
        <div className="max-w-3xl mx-auto px-6">
          <FadeIn>
            <div className="flex items-center gap-3 mb-12">
              <div className="h-[1px] w-10 bg-foreground/30" />
              <span className="section-label">404 — Not Found</span>
            </div>
          </FadeIn>
          <FadeIn delay={0.1}>
            <h1 className="text-5xl md:text-[4.75rem] font-serif leading-[1.1] mb-8 text-gradient pb-1">
              <em className="not-italic font-light">This page wandered off.</em>
            </h1>
          </FadeIn>
          <FadeIn delay={0.2}>
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-xl mb-10 font-sans font-light">
              The address you followed isn't on the site. It may have moved, or the link
              may have been mistyped. Try one of the entry points below.
            </p>
          </FadeIn>
          <FadeIn delay={0.3}>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/">
                <Button
                  size="lg"
                  className="rounded-none h-14 px-8 text-sm uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90"
                >
                  Back to home <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
              <Link href="/dispatch">
                <Button
                  variant="outline"
                  size="lg"
                  className="rounded-none h-14 px-8 text-sm uppercase tracking-widest border-foreground/25 hover:bg-foreground/5"
                >
                  Read the Dispatch
                </Button>
              </Link>
            </div>
            <p className="mt-5 text-sm text-muted-foreground font-light">
              Or email us:{" "}
              <a
                href="mailto:contact@deerpark.io"
                className="text-foreground underline underline-offset-4 hover:text-foreground/70"
              >
                contact@deerpark.io
              </a>
            </p>
          </FadeIn>
        </div>
      </main>
      <Footer />
    </div>
  );
}
