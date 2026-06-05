import { SiteHeader, SiteFooter } from "@/components/site-layout";

export default function Benchmarks() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground selection:bg-foreground selection:text-background">
      <SiteHeader />
      <main className="flex-1">
        <section className="max-w-3xl mx-auto px-6 py-20 md:py-28">
          <h1 className="text-3xl md:text-4xl font-serif mb-6">Benchmarks</h1>
          <p className="text-lg text-muted-foreground font-light leading-relaxed max-w-xl">
            Evaluating model performance and cost.
          </p>
          <p className="mt-12 section-label text-muted-foreground">Coming soon</p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
