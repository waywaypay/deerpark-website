import React, { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
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
    viewport={{ once: true, margin: "-100px" }}
    transition={{ duration: 0.7, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
    className={className}
  >
    {children}
  </motion.div>
);

type NavLink = { href: string; label: string; route?: boolean };

const NAV_LINKS: NavLink[] = [
  { href: "/#services", label: "Services" },
  { href: "/#case-study", label: "Case Study" },
  { href: "/dispatch", label: "Dispatch", route: true },
  { href: "/#faq", label: "FAQ" },
];

const NavItem = ({ link, onClick }: { link: NavLink; onClick?: () => void }) => {
  const className = "hover:text-foreground transition-colors";
  if (link.route) {
    return (
      <Link href={link.href} onClick={onClick} className={className}>
        {link.label}
      </Link>
    );
  }
  return (
    <a href={link.href} onClick={onClick} className={className}>
      {link.label}
    </a>
  );
};

export const Navbar = () => {
  const [open, setOpen] = useState(false);
  return (
    <header className="fixed top-0 w-full z-50 border-b border-foreground/10 bg-background/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 h-20 md:h-24 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-3 font-wordmark text-[1.25rem] md:text-[1.5rem] font-medium tracking-[0.06em] text-foreground"
        >
          <img src={logo} alt="DeerPark icon" className="h-10 md:h-12 w-auto" />
          <span>
            {"DeerPark"}
            <span className="text-foreground/50 font-light">.io</span>
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
          {NAV_LINKS.map((l) => (
            <NavItem key={l.href} link={l} />
          ))}
          <a href="/#assessment">
            <Button className="font-sans text-xs uppercase tracking-widest rounded-none bg-foreground text-background hover:bg-foreground/90">
              Free Scorecard
            </Button>
          </a>
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
          <nav className="max-w-7xl mx-auto px-6 py-6 flex flex-col gap-5 text-sm font-medium text-muted-foreground">
            {NAV_LINKS.map((l) => (
              <NavItem key={l.href} link={l} onClick={() => setOpen(false)} />
            ))}
            <a href="/#assessment" onClick={() => setOpen(false)}>
              <Button className="w-full font-sans text-xs uppercase tracking-widest rounded-none bg-foreground text-background hover:bg-foreground/90">
                Free Scorecard
              </Button>
            </a>
          </nav>
        </div>
      )}
    </header>
  );
};

export const Footer = () => (
  <footer className="border-t border-foreground/15 bg-background pt-20 pb-10">
    <div className="max-w-7xl mx-auto px-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-20">
        <div className="col-span-1 md:col-span-2">
          <Link
            href="/"
            className="flex items-center gap-3 font-wordmark text-[1.5rem] font-medium tracking-[0.06em] text-foreground mb-6"
          >
            <img src={logo} alt="DeerPark icon" className="h-12 w-auto" />
            <span>
              {"DeerPark"}
              <span className="text-foreground/50 font-light">.io</span>
            </span>
          </Link>
          <p className="text-muted-foreground font-light text-sm max-w-sm">
            AI enablement for organizations. We assess, build, train, and deploy — so your team actually uses what we ship.
          </p>
        </div>
        <div>
          <h4 className="font-sans text-xs font-semibold uppercase tracking-[0.15em] mb-6 text-foreground">Practice</h4>
          <ul className="space-y-4 text-sm text-muted-foreground font-light">
            <li><a href="/#services" className="hover:text-foreground transition-colors">Assess</a></li>
            <li><a href="/#services" className="hover:text-foreground transition-colors">Build</a></li>
            <li><a href="/#services" className="hover:text-foreground transition-colors">Deploy</a></li>
            <li><a href="/#services" className="hover:text-foreground transition-colors">Train</a></li>
          </ul>
        </div>
        <div>
          <h4 className="font-sans text-xs font-semibold uppercase tracking-[0.15em] mb-6 text-foreground">Company</h4>
          <ul className="space-y-4 text-sm text-muted-foreground font-light">
            <li><a href="/#case-study" className="hover:text-foreground transition-colors">Case Study</a></li>
            <li><Link href="/dispatch" className="hover:text-foreground transition-colors">Dispatch</Link></li>
            <li><a href="/#faq" className="hover:text-foreground transition-colors">FAQ</a></li>
            <li><a href="/#assessment" className="hover:text-foreground transition-colors">Free Scorecard</a></li>
            <li><a href="mailto:contact@deerpark.io" className="hover:text-foreground transition-colors">Contact</a></li>
          </ul>
        </div>
      </div>
      <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-foreground/10 text-xs text-muted-foreground font-light">
        <div>&copy; {new Date().getFullYear()} DeerPark.io. All rights reserved.</div>
        <div className="flex gap-6 mt-4 md:mt-0">
          <a href="mailto:contact@deerpark.io?subject=Privacy+Inquiry" className="hover:text-foreground transition-colors">Privacy Policy</a>
          <a href="mailto:contact@deerpark.io?subject=Terms+Inquiry" className="hover:text-foreground transition-colors">Terms of Service</a>
        </div>
      </div>
    </div>
  </footer>
);

export const ScorecardFAB = () => (
  <a
    href="/#assessment"
    className="fixed bottom-4 right-4 z-50 md:hidden rounded-none bg-foreground text-background px-5 py-3 text-[11px] font-semibold uppercase tracking-widest shadow-lg"
  >
    Get Free Scorecard
  </a>
);
