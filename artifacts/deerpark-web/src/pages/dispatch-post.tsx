import { Link, useRoute } from "wouter";
import ReactMarkdown from "react-markdown";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { FadeIn, Footer, Navbar, ScorecardFAB } from "@/components/site-layout";
import { usePosts } from "@/lib/dispatch";

const POST_DATE_FMT = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

export default function DispatchPost() {
  const [, params] = useRoute("/dispatch/:id");
  const postId = params?.id ? Number(params.id) : null;
  const postsQuery = usePosts();
  const post = postsQuery.data?.find((p) => p.id === postId) ?? null;

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-foreground selection:text-background">
      <Navbar />
      <main className="pt-32 md:pt-40 pb-32">
        <article className="max-w-3xl mx-auto px-6">
          <FadeIn>
            <Link
              href="/dispatch"
              className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors mb-12"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Dispatch
            </Link>
          </FadeIn>

          {postsQuery.isLoading && (
            <FadeIn>
              <div className="text-sm text-muted-foreground font-light">Loading…</div>
            </FadeIn>
          )}

          {!postsQuery.isLoading && !post && (
            <FadeIn>
              <h1 className="text-3xl md:text-4xl font-serif mb-4">Post not found</h1>
              <p className="text-muted-foreground font-light leading-relaxed">
                The dispatch you're looking for isn't in the recent archive. Try the{" "}
                <Link href="/dispatch/archive" className="underline underline-offset-4 hover:text-foreground">archive</Link>{" "}
                or head back to <Link href="/dispatch" className="underline underline-offset-4 hover:text-foreground">Dispatch</Link>.
              </p>
            </FadeIn>
          )}

          {post && (
            <FadeIn delay={0.05}>
              <div className="flex items-center gap-3 mb-6">
                <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground border border-foreground/20 px-2 py-1 font-sans">
                  {post.tag}
                </span>
                <span className="text-xs text-muted-foreground font-sans">
                  {POST_DATE_FMT.format(new Date(post.publishedAt))}
                </span>
              </div>
              <h1 className="text-3xl md:text-5xl font-serif leading-[1.1] mb-6">{post.title}</h1>
              <p className="text-lg md:text-xl text-muted-foreground font-light leading-relaxed mb-12 italic">
                {post.dek}
              </p>
              <div className="prose prose-neutral dark:prose-invert max-w-none prose-headings:font-serif prose-p:font-light prose-p:leading-relaxed prose-a:text-foreground prose-a:underline-offset-4">
                <ReactMarkdown>{post.bodyMarkdown}</ReactMarkdown>
              </div>
              {post.citations.length > 0 && (
                <div className="mt-16 pt-8 border-t border-foreground/15">
                  <div className="section-label mb-4">Citations</div>
                  <ul className="space-y-2 text-sm font-light">
                    {post.citations.map((url) => (
                      <li key={url}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-baseline gap-2 text-foreground/80 hover:text-foreground underline underline-offset-4 break-all"
                        >
                          <span>{url}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </FadeIn>
          )}
        </article>
      </main>
      <ScorecardFAB />
      <Footer />
    </div>
  );
}
