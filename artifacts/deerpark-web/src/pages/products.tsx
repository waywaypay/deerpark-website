import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-layout";

type ProductLink = {
  href: string;
  name: string;
  tagline: string;
};

const PRODUCTS: ProductLink[] = [
  {
    href: "/sec",
    name: "SEC MCP",
    tagline: "MCP server and CLI for SEC EDGAR filings.",
  },
];

export default function Products() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground selection:bg-foreground selection:text-background">
      <SiteHeader />
      <main className="flex-1">
        <section className="max-w-3xl mx-auto px-6 py-20 md:py-28">
          <h1 className="text-3xl md:text-4xl font-serif mb-10">Products</h1>
          <ul className="border-t border-foreground/10">
            {PRODUCTS.map((product) => (
              <li key={product.href} className="border-b border-foreground/10">
                <Link
                  href={product.href}
                  className="group flex flex-col gap-2 py-6 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
                >
                  <span className="text-xl md:text-2xl font-serif text-foreground">
                    {product.name}
                  </span>
                  <span className="inline-flex items-center gap-3 text-sm text-muted-foreground font-light group-hover:text-foreground transition-colors">
                    {product.tagline}
                    <ArrowRight className="w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
