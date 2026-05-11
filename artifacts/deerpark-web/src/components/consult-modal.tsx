import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Lead-source tag persisted alongside the row (e.g. "nav", "footer"). */
  source: string;
};

type Status =
  | { state: "idle" }
  | { state: "submitting" }
  | { state: "success" }
  | { state: "error"; message: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Desktop "Free Consult" modal: collects first name, last name, email and
// POSTs to /api/leads as an email-typed lead. The server then fires an
// auto-reply with a short PM-style discovery brief, so the user knows to
// check their inbox before any human follow-up.
export function ConsultModal({ open, onClose, source }: Props) {
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    firstFieldRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  // Reset transient state when the modal is dismissed so the next open
  // starts on the form, not a stale success/error screen.
  useEffect(() => {
    if (!open) setStatus({ state: "idle" });
  }, [open]);

  if (!open) return null;

  const submitting = status.state === "submitting";

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const firstName = String(data.get("firstName") || "").trim();
    const lastName = String(data.get("lastName") || "").trim();
    const email = String(data.get("email") || "").trim();

    if (!firstName || !lastName) {
      setStatus({ state: "error", message: "Please enter your first and last name." });
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setStatus({ state: "error", message: "Please enter a valid email address." });
      return;
    }

    setStatus({ state: "submitting" });

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${firstName} ${lastName}`,
          contact: email,
          contactType: "email",
          source,
        }),
      });
      if (!res.ok) {
        const message =
          res.status === 400
            ? "Please check your entries and try again."
            : "Something went wrong on our end. Please email contact@deerpark.io or try again in a few minutes.";
        setStatus({ state: "error", message });
        return;
      }
      form.reset();
      setStatus({ state: "success" });
    } catch {
      setStatus({
        state: "error",
        message: "Network error. Please check your connection and retry.",
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-background/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="consult-modal-title"
        className="relative w-full sm:max-w-lg border border-foreground/20 bg-background p-6 sm:p-8 shadow-xl"
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute top-3 right-3 p-2 text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>

        {status.state === "success" ? (
          <>
            <div className="flex items-center gap-3 mb-5">
              <div className="h-[1px] w-8 bg-primary" />
              <span className="section-label">Check your inbox</span>
            </div>
            <div className="inline-flex items-center justify-center w-10 h-10 border border-primary/40 bg-primary/10 mb-5">
              <Check className="w-5 h-5 text-primary" />
            </div>
            <h2
              id="consult-modal-title"
              className="text-2xl sm:text-3xl font-serif leading-tight mb-3"
            >
              On its way — check your inbox.
            </h2>
            <p className="text-sm text-muted-foreground font-light leading-relaxed">
              We just sent a short product-manager-style brief — a few discovery
              questions about your workflow. Reply when you have a few minutes
              and a DeerPark strategist will pick it up from there.
            </p>
            <div className="mt-7 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-none bg-foreground text-background px-5 py-3 text-[11px] font-semibold uppercase tracking-widest hover:bg-foreground/90"
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-5">
              <div className="h-[1px] w-8 bg-primary" />
              <span className="section-label">Free Consultation</span>
            </div>
            <h2
              id="consult-modal-title"
              className="text-2xl sm:text-3xl font-serif leading-tight mb-3"
            >
              Tell us where to send a few questions.
            </h2>
            <p className="text-sm text-muted-foreground font-light leading-relaxed mb-6">
              Drop your name and email. We'll send a short discovery brief — a
              few PM-style questions about your workflow — so the first call
              starts in the right place.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="consult-firstName" className="section-label block mb-2">
                    First name
                  </label>
                  <input
                    ref={firstFieldRef}
                    id="consult-firstName"
                    name="firstName"
                    autoComplete="given-name"
                    required
                    disabled={submitting}
                    className="w-full h-12 bg-card border border-foreground/15 px-4 text-sm outline-none focus:border-primary/80 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label htmlFor="consult-lastName" className="section-label block mb-2">
                    Last name
                  </label>
                  <input
                    id="consult-lastName"
                    name="lastName"
                    autoComplete="family-name"
                    required
                    disabled={submitting}
                    className="w-full h-12 bg-card border border-foreground/15 px-4 text-sm outline-none focus:border-primary/80 disabled:opacity-50"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="consult-email" className="section-label block mb-2">
                  Work email
                </label>
                <input
                  id="consult-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  required
                  disabled={submitting}
                  className="w-full h-12 bg-card border border-foreground/15 px-4 text-sm outline-none focus:border-primary/80 disabled:opacity-50"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-none h-14 px-3 md:px-8 text-xs md:text-sm uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90 disabled:opacity-60 inline-flex items-center justify-center font-medium"
              >
                {submitting ? (
                  "Sending…"
                ) : (
                  <>
                    Send Me The Questions <ArrowRight className="ml-2 w-4 h-4" />
                  </>
                )}
              </button>
              {status.state === "error" && (
                <p role="alert" className="text-xs text-red-400">
                  {status.message}
                </p>
              )}
            </form>
          </>
        )}
      </div>
    </div>
  );
}
