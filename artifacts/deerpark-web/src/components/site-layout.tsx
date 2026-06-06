import React, { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, Menu, X } from "lucide-react";
import logo from "../assets/logo-icon.png";

export const CONTACT_EMAIL = "contact@deerpark.io";

/** Primary navigation — points at the site's real routes. Shared by the
 *  desktop bar, the mobile menu, and (a subset) the footer. */
export const NAV_LINKS = [
  { href: "/case-studies", label: "AI Deployment" },
  { href: "/products", label: "Products" },
  { href: "/benchmarks", label: "Benchmarks" },
] as const;

export const FadeIn = ({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    // Positive margin extends the IntersectionObserver root so content just
    // below the fold fades in on first paint instead of waiting for a scroll
    // the user has no reason to make — and so headless renderers / SEO
    // crawlers see the content.
    viewport={{ once: true, margin: "400px" }}
    transition={{ duration: 0.7, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
    className={className}
  >
    {children}
  </motion.div>
);

const Wordmark = ({
  className = "text-lg md:text-xl",
  logoClassName = "h-8 md:h-9",
}: {
  className?: string;
  logoClassName?: string;
}) => (
  <Link
    href="/"
    className={`group inline-flex items-center gap-2.5 font-wordmark ${className} tracking-[0.06em] text-foreground hover:text-foreground/70 transition-colors shrink-0`}
  >
    <img src={logo} alt="" className={`${logoClassName} w-auto`} />
    <span>
      {"DeerPark"}
      <span className="text-foreground/50 font-light">.io</span>
    </span>
  </Link>
);

const ScheduleButton = ({
  source,
  onClick,
  className = "",
}: {
  source: string;
  onClick?: () => void;
  className?: string;
}) => (
  <a
    href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Intro call — DeerPark")}`}
    data-cta={source}
    onClick={onClick}
    className={`group inline-flex items-center justify-center gap-2 rounded-full bg-foreground text-background font-medium tracking-wide hover:bg-foreground/85 transition-colors ${className}`}
  >
    Schedule a call
    <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
  </a>
);

/**
 * Site header: the brand mark plus real navigation and a persistent
 * "Schedule a call" CTA. Sticky so the nav and primary action stay reachable
 * as visitors scroll long pages. The logo/wordmark are sized for presence but
 * stay well below the hero headline so page hierarchy holds. Collapses to a
 * hamburger menu on mobile.
 */
export const SiteHeader = () => {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-foreground/10 bg-background/85 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 h-20 md:h-24 flex items-center justify-between gap-6">
        <Wordmark className="text-xl md:text-2xl" logoClassName="h-10 md:h-12" />

        <nav className="hidden md:flex items-center gap-6 lg:gap-8 text-sm font-medium text-muted-foreground">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-foreground transition-colors">
              {l.label}
            </Link>
          ))}
          <ScheduleButton source="nav" className="px-5 py-2 text-sm" />
        </nav>

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="md:hidden p-2 -mr-2 text-foreground"
        >
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-foreground/10 bg-background">
          <nav className="max-w-7xl mx-auto px-6 py-6 flex flex-col gap-5 text-base font-medium text-muted-foreground">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="hover:text-foreground transition-colors"
              >
                {l.label}
              </Link>
            ))}
            <ScheduleButton
              source="nav_mobile"
              onClick={() => setOpen(false)}
              className="px-5 py-3 text-sm"
            />
          </nav>
        </div>
      )}
    </header>
  );
};

const FOOTER_EXPLORE = [
  { href: "/case-studies", label: "Case Studies" },
  { href: "/products", label: "Products" },
  { href: "/sec", label: "SEC MCP" },
  { href: "/benchmarks", label: "Benchmarks" },
] as const;

/** Footer: brand blurb, navigation columns, and legal links. */
export const SiteFooter = () => (
  <footer className="border-t border-foreground/10 bg-background">
    <div className="max-w-7xl mx-auto px-6 py-16">
      <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2 max-w-sm">
          <Wordmark className="text-xl" />
          <p className="mt-5 text-sm text-muted-foreground font-light leading-relaxed">
            Applied AI for organizations. We map where AI pays back fastest, build the software
            your team needs, and train your people to run it.
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="mt-5 inline-flex items-center gap-2 text-sm text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground transition-colors"
          >
            {CONTACT_EMAIL}
          </a>
        </div>

        <div>
          <h4 className="section-label mb-5">Explore</h4>
          <ul className="space-y-3 text-sm text-muted-foreground font-light">
            {FOOTER_EXPLORE.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-foreground transition-colors">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="section-label mb-5">Company</h4>
          <ul className="space-y-3 text-sm text-muted-foreground font-light">
            <li>
              <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-foreground transition-colors">
                Contact
              </a>
            </li>
            <li>
              <Link href="/privacy" className="hover:text-foreground transition-colors">
                Privacy
              </Link>
            </li>
            <li>
              <Link href="/terms" className="hover:text-foreground transition-colors">
                Terms
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-14 pt-8 border-t border-foreground/10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-xs text-muted-foreground font-light">
        <div>&copy; {new Date().getFullYear()} DeerPark.io</div>
        <div className="flex gap-6">
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground transition-colors">
            Terms
          </Link>
        </div>
      </div>
    </div>
  </footer>
);
