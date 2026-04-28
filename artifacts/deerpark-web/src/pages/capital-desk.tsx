import { Navbar, Footer, ScorecardFAB, FadeIn } from "@/components/site-layout";

/**
 * Investor-relations / capital-markets briefing agent (“Capital Desk”).
 * Product name subject to rename once positioning is finalized.
 */
export default function CapitalDeskPage() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-foreground selection:text-background">
      <Navbar />
      <main>
        <section className="border-b border-foreground/10 px-6 pt-32 pb-28 md:pt-40 md:pb-36">
          <div className="max-w-3xl mx-auto">
            <FadeIn>
              <div className="flex items-center gap-3 mb-10">
                <div className="h-px w-10 bg-foreground/30" />
                <span className="section-label">Agents</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-serif leading-[1.1] mb-8">Capital Desk</h1>
              <p className="text-lg text-muted-foreground font-light leading-relaxed mb-6">
                A dedicated agent for investor-relations and capital-markets context — earnings cycles, filings, narrative, and stakeholder questions in one place.
              </p>
              <p className="text-sm text-muted-foreground font-light leading-relaxed border border-foreground/15 bg-card/50 px-5 py-4">
                In development. Check back soon, or{" "}
                <a
                  href="mailto:contact@deerpark.io?subject=Capital%20Desk%20agent"
                  className="text-foreground underline underline-offset-4 hover:text-foreground/80"
                >
                  email us
                </a>{" "}
                if you want early access.
              </p>
            </FadeIn>
          </div>
        </section>
      </main>
      <ScorecardFAB />
      <Footer />
    </div>
  );
}
