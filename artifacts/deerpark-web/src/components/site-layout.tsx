import React, { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { Menu, MessageSquare, X } from "lucide-react";
import logo from "../assets/logo-icon.png";
import { SMS_ENABLED, SMS_NUMBER_E164 } from "@/lib/sms";
import { useConsultModals } from "@/components/consult-modal-provider";

/** Site-wide: product destinations linked from the home Products section + footer. */
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
    // Positive margin extends the IntersectionObserver root, so content just
    // below the fold (e.g. the dispatch headlines on phones) fades in on first
    // paint instead of waiting for a scroll that the user has no reason to make
    // — and so headless renderers / SEO crawlers see the content.
    viewport={{ once: true, margin: "400px" }}
    transition={{ duration: 0.7, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
    className={className}
  >
    {children}
  </motion.div>
);

type HashLink = { href: string; label: string };

const NAV_HASH_LINKS: HashLink[] = [
  { href: "/#approach", label: "Services" },
  { href: "/#products", label: "Products" },
  { href: "/#case-studies", label: "Case Studies" },
  { href: "/#faq", label: "FAQ" },
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

// Mobile (with SMS configured) opens the Twilio consent modal then
// deep-links to Messages. Every other path — desktop, or mobile with SMS
// disabled — opens the email-capture modal, which POSTs to /api/leads and
// triggers a PM-style discovery brief from the server. A single anchor
// drives all paths so the link is still crawlable and copy/paste-able.
//
// Modals are mounted by ConsultModalProvider at the app root, NOT here:
// when the mobile menu collapses on tap, the parent's onClick runs
// `setOpen(false)` and unmounts this CTA along with anything nested under
// it. A locally-mounted modal would die before it ever rendered.
type ConsultCTAProps = {
  source: string;
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
};

export const ConsultCTA = ({ source, className = "", onClick, children }: ConsultCTAProps) => {
  const { openConsult, openSms } = useConsultModals();
  const smsAvailable = SMS_ENABLED && SMS_NUMBER_E164 !== null;
  const href = `/?ref=${source}`;

  return (
    <a
      href={href}
      onClick={(e) => {
        if (typeof window === "undefined") return;
        e.preventDefault();
        const isMobile = window.matchMedia("(max-width: 767px)").matches;
        if (isMobile && smsAvailable) {
          openSms();
        } else {
          openConsult(source);
        }
        // Call parent onClick LAST. The provider lives above us, so its
        // state updates survive even when the parent immediately unmounts
        // this CTA (e.g. mobile menu collapse).
        onClick?.();
      }}
      className={className}
    >
      {children}
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
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-muted-foreground">
          {NAV_HASH_LINKS.map((l) => (
            <NavHashLink key={l.href} link={l} />
          ))}
          <ConsultCTA
            source="nav"
            className="font-sans text-xs uppercase tracking-widest rounded-none bg-foreground text-background hover:bg-foreground/90 inline-flex items-center justify-center px-4 h-9 font-medium transition-colors"
          >
            Free Consult
          </ConsultCTA>
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
            {NAV_HASH_LINKS.map((l) => (
              <NavHashLink key={l.href} link={l} onClick={() => setOpen(false)} />
            ))}
            <ConsultCTA
              source="nav_mobile"
              onClick={() => setOpen(false)}
              className="w-full font-sans text-xs uppercase tracking-widest rounded-none bg-foreground text-background hover:bg-foreground/90 inline-flex items-center justify-center px-4 h-10 font-medium transition-colors"
            >
              Free Consult
            </ConsultCTA>
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
          <h4 className="font-sans text-xs font-semibold uppercase tracking-[0.15em] mb-6 text-foreground">Approach</h4>
          <ul className="space-y-4 text-sm text-muted-foreground font-light">
            <li><a href="/#approach" className="hover:text-foreground transition-colors">Assess</a></li>
            <li><a href="/#approach" className="hover:text-foreground transition-colors">Build</a></li>
            <li><a href="/#approach" className="hover:text-foreground transition-colors">Deploy</a></li>
            <li><a href="/#approach" className="hover:text-foreground transition-colors">Train</a></li>
          </ul>
        </div>
        <div>
          <h4 className="font-sans text-xs font-semibold uppercase tracking-[0.15em] mb-6 text-foreground">Company</h4>
          <ul className="space-y-4 text-sm text-muted-foreground font-light">
            <li><a href="/#case-studies" className="hover:text-foreground transition-colors">Case Studies</a></li>
            <li className="pt-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-foreground">
              <a href="/#products" className="hover:text-foreground/70 transition-colors">
                Products
              </a>
            </li>
            {PRODUCT_LINKS.map(({ href, label }) => (
              <li key={href} className="pl-2">
                <Link href={href} className="hover:text-foreground transition-colors">
                  {label}
                </Link>
              </li>
            ))}
            <li><a href="/#faq" className="hover:text-foreground transition-colors">FAQ</a></li>
            <li>
              <ConsultCTA source="footer" className="text-left hover:text-foreground transition-colors">
                Free Consultation
              </ConsultCTA>
            </li>
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

// Mobile-only floating CTA. When SMS is configured, it opens the Twilio
// consent modal then deep-links to Messages — texting converts higher than
// a form for the top-of-funnel "I'm curious" cohort. When SMS isn't
// configured, it falls back to the email-capture modal so the FAB always
// has somewhere to send people. Both modals live on the provider so the
// FAB just dispatches; it doesn't own any modal state.
export const ConsultationFAB = () => {
  const { openConsult, openSms } = useConsultModals();
  if (SMS_ENABLED && SMS_NUMBER_E164) {
    return (
      <button
        type="button"
        onClick={openSms}
        aria-label="Text us for a free consultation"
        aria-haspopup="dialog"
        className="fixed bottom-4 right-4 z-50 md:hidden rounded-none bg-foreground text-background px-5 py-3 text-[11px] font-semibold uppercase tracking-widest shadow-lg flex items-center gap-2"
      >
        <MessageSquare className="w-3.5 h-3.5" />
        Text Us
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => openConsult("fab")}
      aria-haspopup="dialog"
      className="fixed bottom-4 right-4 z-50 md:hidden rounded-none bg-foreground text-background px-5 py-3 text-[11px] font-semibold uppercase tracking-widest shadow-lg"
    >
      Get Free Consultation
    </button>
  );
};
