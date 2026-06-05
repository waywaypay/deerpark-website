import React from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import logo from "../assets/logo-icon.png";

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

/** Minimal header for interior pages: just a wordmark that returns home. */
export const SiteHeader = () => (
  <header className="border-b border-foreground/10">
    <div className="max-w-7xl mx-auto px-6 h-16 md:h-20 flex items-center">
      <Link
        href="/"
        className="group inline-flex items-center gap-2.5 font-wordmark text-lg md:text-xl tracking-[0.06em] text-foreground hover:text-foreground/70 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 text-foreground/40 group-hover:text-foreground/80 transition-colors" />
        <img src={logo} alt="" className="h-7 md:h-8 w-auto" />
        <span>
          {"DeerPark"}
          <span className="text-foreground/50 font-light">.io</span>
        </span>
      </Link>
    </div>
  </header>
);

/** Minimal footer for interior pages: copyright plus legal links. */
export const SiteFooter = () => (
  <footer className="border-t border-foreground/10">
    <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-xs text-muted-foreground font-light">
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
  </footer>
);
