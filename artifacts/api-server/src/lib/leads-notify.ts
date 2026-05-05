import type { Lead } from "@workspace/db";

const RESEND_API = "https://api.resend.com/emails";

function sanitizeEnv(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  let v = raw.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

type NotifyConfig = {
  fromEmail: string;
  toEmail: string;
  resendApiKey: string;
};

function readConfig(): NotifyConfig | { error: string } {
  const fromEmail =
    sanitizeEnv(process.env["LEADS_NOTIFY_FROM_EMAIL"]) ??
    sanitizeEnv(process.env["DAILY_DIGEST_FROM_EMAIL"]);
  const toEmail = sanitizeEnv(process.env["LEADS_NOTIFY_EMAIL"]);
  const resendApiKey = sanitizeEnv(process.env["RESEND_API_KEY"]);
  if (!resendApiKey) return { error: "RESEND_API_KEY not set" };
  if (!fromEmail) return { error: "LEADS_NOTIFY_FROM_EMAIL / DAILY_DIGEST_FROM_EMAIL not set" };
  if (!toEmail) return { error: "LEADS_NOTIFY_EMAIL not set" };
  return { fromEmail, toEmail, resendApiKey };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function extractRecommended(challenge: string): string | null {
  const m = challenge.match(/^Recommended:\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

function buildSubject(lead: Lead): string {
  const fit = extractRecommended(lead.challenge);
  const who = lead.company ? `${lead.name} (${lead.company})` : lead.name;
  return fit ? `New lead: ${who} — fit: ${fit}` : `New lead: ${who}`;
}

function buildHtml(lead: Lead): string {
  const meta = [
    ["Name", lead.name],
    ["Company", lead.company],
    [lead.contactType === "sms" ? "Mobile" : "Email", lead.contact],
    ["Channel", lead.contactType],
  ];
  const metaRows = meta
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#666;font-size:13px;">${escapeHtml(k)}</td><td style="padding:4px 0;font-size:13px;">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  return [
    `<h2 style="font-family:Georgia,serif;margin:0 0 16px;">New assessment lead</h2>`,
    `<table style="border-collapse:collapse;margin-bottom:24px;">${metaRows}</table>`,
    `<h3 style="font-family:Georgia,serif;margin:0 0 8px;font-size:16px;">Assessment</h3>`,
    `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:13px;line-height:1.5;background:#f6f5f0;padding:16px;border:1px solid #e6e2d6;white-space:pre-wrap;">${escapeHtml(
      lead.challenge,
    )}</pre>`,
  ].join("");
}

function buildText(lead: Lead): string {
  return [
    `New assessment lead`,
    ``,
    `Name:    ${lead.name}`,
    `Company: ${lead.company}`,
    `${lead.contactType === "sms" ? "Mobile" : "Email"}:   ${lead.contact}`,
    `Channel: ${lead.contactType}`,
    ``,
    `--- Assessment ---`,
    lead.challenge,
  ].join("\n");
}

export type LeadNotifyResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Email a notification when a new lead lands. Fire-and-forget from the route:
 * never throws, returns a result so callers can log. Skips silently with a
 * `reason` when env config is incomplete (so dev environments still work).
 */
export async function notifyNewLead(lead: Lead): Promise<LeadNotifyResult> {
  const cfg = readConfig();
  if ("error" in cfg) {
    return { ok: false, reason: cfg.error };
  }

  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: cfg.fromEmail,
        to: [cfg.toEmail],
        reply_to: lead.contactType === "email" ? lead.contact : undefined,
        subject: buildSubject(lead),
        html: buildHtml(lead),
        text: buildText(lead),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, reason: `${res.status}: ${body.slice(0, 500)}` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Public-safe view of config state for /admin/health-style endpoints. */
export function leadsNotifyStatus(): {
  hasFromEmail: boolean;
  hasToEmail: boolean;
  hasResendKey: boolean;
  ready: boolean;
} {
  const hasFromEmail = Boolean(
    sanitizeEnv(process.env["LEADS_NOTIFY_FROM_EMAIL"]) ??
      sanitizeEnv(process.env["DAILY_DIGEST_FROM_EMAIL"]),
  );
  const hasToEmail = Boolean(sanitizeEnv(process.env["LEADS_NOTIFY_EMAIL"]));
  const hasResendKey = Boolean(sanitizeEnv(process.env["RESEND_API_KEY"]));
  return {
    hasFromEmail,
    hasToEmail,
    hasResendKey,
    ready: hasFromEmail && hasToEmail && hasResendKey,
  };
}

