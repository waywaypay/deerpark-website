import React, { createContext, useCallback, useContext, useState } from "react";
import { ConsultModal } from "./consult-modal";
import { SmsConsentModal } from "./sms-consent-modal";
import { SMS_NUMBER_E164, smsHref } from "@/lib/sms";

type ConsultCtx = {
  openConsult: (source: string) => void;
  openSms: () => void;
};

const ConsultContext = createContext<ConsultCtx | null>(null);

/**
 * Mounts the Free Consult and SMS consent modals at the app root and
 * exposes openers via context. CTAs only flip state on the provider —
 * never own modal mounts themselves — so a parent that unmounts the CTA
 * mid-click (e.g. the mobile menu collapsing on tap) can't tear down the
 * modal before it renders.
 */
export function ConsultModalProvider({ children }: { children: React.ReactNode }) {
  const [consult, setConsult] = useState<{ open: boolean; source: string }>({
    open: false,
    source: "",
  });
  const [smsOpen, setSmsOpen] = useState(false);

  const openConsult = useCallback(
    (source: string) => setConsult({ open: true, source }),
    [],
  );
  const openSms = useCallback(() => setSmsOpen(true), []);

  return (
    <ConsultContext.Provider value={{ openConsult, openSms }}>
      {children}
      <ConsultModal
        open={consult.open}
        source={consult.source}
        onClose={() => setConsult((c) => ({ ...c, open: false }))}
      />
      {SMS_NUMBER_E164 ? (
        <SmsConsentModal
          open={smsOpen}
          onClose={() => setSmsOpen(false)}
          smsUrl={smsHref(SMS_NUMBER_E164)}
          number={SMS_NUMBER_E164}
        />
      ) : null}
    </ConsultContext.Provider>
  );
}

export function useConsultModals(): ConsultCtx {
  const ctx = useContext(ConsultContext);
  if (!ctx) {
    throw new Error("useConsultModals must be used inside ConsultModalProvider");
  }
  return ctx;
}
