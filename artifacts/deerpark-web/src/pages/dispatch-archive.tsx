import { useMemo } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { FadeIn, Footer, Navbar, AssessmentFAB } from "@/components/site-layout";
import { DispatchList } from "@/components/dispatch-list";
import { DISPATCH_WEEKS, groupPostsToWeeks, usePosts } from "@/lib/dispatch";

export default function DispatchArchive() {
  const postsQuery = usePosts();
  const weeks = useMemo(() => {
    if (postsQuery.data && postsQuery.data.length > 0) {
      return groupPostsToWeeks(postsQuery.data);
    }
    return DISPATCH_WEEKS;
  }, [postsQuery.data]);
  // Skip the latest week — that's already on /dispatch.
  const olderWeeks = weeks.slice(1);

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-foreground selection:text-background">
      <Navbar />
      <main className="pt-32 md:pt-40 pb-32">
        <div className="max-w-5xl mx-auto px-6">
          <FadeIn>
            <Link
              href="/dispatch"
              className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors mb-12"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Dispatch
            </Link>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-[1px] w-12 bg-primary"></div>
              <span className="section-label">Archive</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-serif leading-[1.05] mb-6">
              Every dispatch, by week.
            </h1>
            <p className="text-muted-foreground font-light leading-relaxed max-w-2xl mb-16">
              Older notes from the agent. Click any entry to read in full.
            </p>
          </FadeIn>

          {olderWeeks.length === 0 && (
            <FadeIn>
              <div className="text-sm text-muted-foreground font-light">
                Nothing in the archive yet — check back next week.
              </div>
            </FadeIn>
          )}

          {olderWeeks.map((week, i) => (
            <FadeIn key={week.id} delay={i * 0.05} className="mb-16">
              <div className="flex items-baseline justify-between mb-6">
                <h2 className="text-2xl md:text-3xl font-serif">Week of {week.label}</h2>
                <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-sans">
                  {week.sublabel}
                </span>
              </div>
              <DispatchList entries={week.entries} />
            </FadeIn>
          ))}
        </div>
      </main>
      <AssessmentFAB />
      <Footer />
    </div>
  );
}
