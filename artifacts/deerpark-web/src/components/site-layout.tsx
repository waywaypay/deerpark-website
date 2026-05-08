import React, { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ChevronDown, Menu, MessageSquare, X } from "lucide-react";
import logo from "../assets/logo-icon.png";
import { SMS_ENABLED, SMS_NUMBER_E164, smsHref } from "@/lib/sms";

/** Site-wide: product destinations shown under “Products” in the header. */
export const PRODUCT_LINKS = [
  { href: "/dispatch", label: "Dispatch" },
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
    viewport={{ once: true, margin: "-100px" }}
    transition={{ duration: 0.7, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
    className={className}
  >
    {children}
  </motion.div>
);

type HashLink = { href: string; label: string };

const NAV_HASH_LINKS_BEFORE_PRODUCTS: HashLink[] = [
  { href: "/#services", label: "Services" },
];

const NAV_HASH_LINKS_AFTER_PRODUCTS: HashLink[] = [
  { href: "/#case-study", label: "Case Studies" },
];

const NavHashLink = ({
  link,
  onClick,
}: {
  link: HashLink;
  onClick?: () => void;
}) => (
  <a href={link.href} onClick={onClick} className="hover:text-foreground transition-colors">
    {link.label}
  </a>
);

const ProductsNavDesktop = () => {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="relative hidden md:block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Link
        href="/products"
        className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Products
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </Link>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 min-w-[13rem] pt-2"
        >
          <div className="border border-foreground/15 bg-background py-2 shadow-lg">
            {PRODUCT_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                role="menuitem"
                className="block px-4 py-2.5 text-left text-sm hover:bg-foreground/[0.04] hover:text-foreground"
                onClick={() => setOpen(false)}
              >
                {label}
              </Link>
            ))}
            <div className="my-1 border-t border-foreground/10" />
            <Link
              href="/products"
              role="menuitem"
              className="block px-4 py-2.5 text-left text-xs uppercase tracking-widest text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
              onClick={() => setOpen(false)}
            >
              View all products →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

const ProductsNavMobile = ({ onNavigate }: { onNavigate: () => void }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 py-0.5 text-left text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span>Products</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="ml-3 flex flex-col gap-3 border-l border-foreground/15 pl-4">
          {PRODUCT_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={onNavigate}
            >
              {label}
            </Link>
          ))}
          <Link
            href="/products"
            className="text-xs uppercase tracking-widest text-muted-foreground/80 hover:text-foreground transition-colors"
            onClick={onNavigate}
          >
            View all products →
          </Link>
        </div>
      )}
    </div>
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
          {NAV_HASH_LINKS_BEFORE_PRODUCTS.map((l) => (
            <NavHashLink key={l.href} link={l} />
          ))}
          <ProductsNavDesktop />
          {NAV_HASH_LINKS_AFTER_PRODUCTS.map((l) => (
            <NavHashLink key={l.href} link={l} />
          ))}
          <a href="/#faq" className="hover:text-foreground transition-colors">
            FAQ
          </a>
          <a href="/?ref=nav#assessment">
            <Button className="font-sans text-xs uppercase tracking-widest rounded-none bg-foreground text-background hover:bg-foreground/90">
              Free Assessment
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
            {NAV_HASH_LINKS_BEFORE_PRODUCTS.map((l) => (
              <NavHashLink key={l.href} link={l} onClick={() => setOpen(false)} />
            ))}
            <ProductsNavMobile onNavigate={() => setOpen(false)} />
            {NAV_HASH_LINKS_AFTER_PRODUCTS.map((l) => (
              <NavHashLink key={l.href} link={l} onClick={() => setOpen(false)} />
            ))}
            <a href="/#faq" onClick={() => setOpen(false)} className="hover:text-foreground transition-colors">
              FAQ
            </a>
            <a href="/?ref=nav_mobile#assessment" onClick={() => setOpen(false)}>
              <Button className="w-full font-sans text-xs uppercase tracking-widest rounded-none bg-foreground text-background hover:bg-foreground/90">
                Free Assessment
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
            <li><a href="/#case-study" className="hover:text-foreground transition-colors">Case Studies</a></li>
            <li className="pt-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-foreground">
              <Link href="/products" className="hover:text-foreground/70 transition-colors">
                Products
              </Link>
            </li>
            {PRODUCT_LINKS.map(({ href, label }) => (
              <li key={href} className="pl-2">
                <Link href={href} className="hover:text-foreground transition-colors">
                  {label}
                </Link>
              </li>
            ))}
            <li><a href="/#faq" className="hover:text-foreground transition-colors">FAQ</a></li>
            <li><a href="/?ref=footer#assessment" className="hover:text-foreground transition-colors">Free Assessment</a></li>
            <li><a href="mailto:contact@deerpark.io" className="hover:text-foreground transition-colors">Contact</a></li>
          </ul>
        </div>
      </div>
      <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-foreground/10 text-xs text-muted-foreground font-light">
        <div>&copy; {new Date().getFullYear()} DeerPark.io. All rights reserved.</div>
        <div className="flex gap-6 mt-4 md:mt-0">
          <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
        </div>
      </div>
    </div>
  </footer>
);

export const AssessmentFAB = () => {
  // When SMS is live, the "Text" pill replaces the "Get Free Assessment" pill
  // on mobile entirely — texting converts higher than the form for the
  // top-of-funnel "I'm curious" cohort, and stacking two FABs ate too much
  // viewport. The Lead Capture section still has the form CTA inline for
  // anyone who scrolls down.
  if (SMS_ENABLED && SMS_NUMBER_E164) {
    return (
      <a
        href={smsHref(SMS_NUMBER_E164)}
        aria-label="Text our concierge"
        className="fixed bottom-4 right-4 z-50 md:hidden rounded-none bg-foreground text-background px-5 py-3 text-[11px] font-semibold uppercase tracking-widest shadow-lg flex items-center gap-2"
      >
        <MessageSquare className="w-3.5 h-3.5" />
        Text
      </a>
    );
  }
  return (
    <a
      href="/?ref=fab#assessment"
      className="fixed bottom-4 right-4 z-50 md:hidden rounded-none bg-foreground text-background px-5 py-3 text-[11px] font-semibold uppercase tracking-widest shadow-lg"
    >
      Get Free Assessment
    </a>
  );
};
