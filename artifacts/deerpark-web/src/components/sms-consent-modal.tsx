import React, { useEffect, useRef } from "react";
import { Link } from "wouter";
import { X } from "lucide-react";
import { formatSmsNumber } from "@/lib/sms";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Full sms: URI to follow when the user confirms. */
  smsUrl: string;
  /** E.164 number being texted, shown to the user as a sanity check. */
  number: string;
};

// Twilio A2P 10DLC and toll-free verification require these disclosures to
// appear at the opt-in surface — not just buried in /privacy. Keep the copy
// here in sync with the SMS sections of /privacy and /terms. Voice mirrors
// the bot's own system prompt: discovery, not a sales pitch.
export function SmsConsentModal({ open, onClose, smsUrl, number }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    cancelRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-background/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sms-consent-title"
        aria-describedby="sms-consent-body"
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

        <div className="flex items-center gap-3 mb-5">
          <div className="h-[1px] w-8 bg-primary" />
          <span className="section-label">Before you text</span>
        </div>
        <h2
          id="sms-consent-title"
          className="text-2xl sm:text-3xl font-serif leading-tight mb-4"
        >
          Text DeerPark's discovery line.
        </h2>

        <div
          id="sms-consent-body"
          className="space-y-3 text-sm text-muted-foreground font-light leading-relaxed"
        >
          <p>
            You'll text{" "}
            <span className="text-foreground">{formatSmsNumber(number)}</span>.
            We reply to help you talk through what's actually slowing your team
            down — finding the real pain before anyone talks solutions. A
            DeerPark strategist follows up when there's something to dig into.
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <span className="text-foreground">Cost:</span> message and data
              rates may apply, depending on your mobile plan.
            </li>
            <li>
              <span className="text-foreground">Opt out:</span> reply{" "}
              <code className="text-foreground">STOP</code> at any time. Reply{" "}
              <code className="text-foreground">HELP</code> for help.
            </li>
            <li>
              <span className="text-foreground">No sharing:</span> your number
              is not sold or shared with third parties.
            </li>
          </ul>
          <p className="pt-1">
            By tapping "Continue to Messages" you consent to receive SMS replies
            from DeerPark. See our{" "}
            <Link
              href="/privacy"
              className="text-foreground underline underline-offset-2 hover:text-foreground/70"
            >
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link
              href="/terms"
              className="text-foreground underline underline-offset-2 hover:text-foreground/70"
            >
              Terms
            </Link>{" "}
            for the full SMS terms.
          </p>
        </div>

        <div className="mt-7 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            className="rounded-none border border-foreground/25 bg-background px-5 py-3 text-[11px] font-semibold uppercase tracking-widest hover:bg-foreground/5"
          >
            Cancel
          </button>
          <a
            href={smsUrl}
            onClick={onClose}
            className="rounded-none bg-foreground text-background px-5 py-3 text-[11px] font-semibold uppercase tracking-widest text-center hover:bg-foreground/90"
          >
            Continue to Messages
          </a>
        </div>
      </div>
    </div>
  );
}
