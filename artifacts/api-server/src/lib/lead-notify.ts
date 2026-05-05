import type { Lead } from "@workspace/db";
import { logger } from "./logger";

const RESEND_API = "https://api.resend.com/emails";
const DEFAULT_RECIPIENT = "contact@deerpark.io";

function sanitizeEnv(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  let v = raw.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function contactLink(lead: Pick<Lead, "contact" | "contactType">): string {
  const safe = escapeHtml(lead.contact);
  if (lead.contactType === "email") {
    return `<a href="mailto:${safe}">${safe}</a>`;
  }
  return `<a href="tel:${safe}">${safe}</a>`;
}

function renderHtml(lead: Lead): string {
  const rows: Array<[string, string]> = [
    ["Name", escapeHtml(lead.name)],
    ["Company", escapeHtml(lead.company)],
    [lead.contactType === "sms" ? "Mobile" : "Email", contactLink(lead)],
    ["Submitted", escapeHtml(lead.createdAt.toISOString())],
  ];
  const table = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#666;font-size:13px;vertical-align:top;">${k}</td><td style="padding:4px 0;font-size:14px;">${v}</td></tr>`,
    )
    .join("");
  const challenge = escapeHtml(lead.challenge).replace(/\n/g, "<br>");
  return `<h2 style="margin:0 0 16px 0;font-family:Georgia,serif;">New AI Workflow Assessment request</h2>
<table style="border-collapse:collapse;margin-bottom:20px;">${table}</table>
<h3 style="margin:0 0 8px 0;font-size:14px;color:#666;text-transform:uppercase;letter-spacing:0.05em;">Challenge</h3>
<p style="margin:0;font-size:15px;line-height:1.6;white-space:pre-wrap;">${challenge}</p>`;
}

function renderText(lead: Lead): string {
  const contactLabel = lead.contactType === "sms" ? "Mobile" : "Email";
  return [
    "New AI Workflow Assessment request",
    "",
    `Name: ${lead.name}`,
    `Company: ${lead.company}`,
    `${contactLabel}: ${lead.contact}`,
    `Submitted: ${lead.createdAt.toISOString()}`,
    "",
    "Challenge:",
    lead.challenge,
  ].join("\n");
}

/**
 * Email contact@deerpark.io that a new assessment request came in. Best effort:
 * resolves to true on a 2xx Resend response, false otherwise. Never throws —
 * the caller has already persisted the lead and should not fail the HTTP
 * request just because the notification didn't go out.
 */
export async function sendLeadNotificationEmail(lead: Lead): Promise<boolean> {
  const apiKey = sanitizeEnv(process.env["RESEND_API_KEY"]);
  const fromEmail = sanitizeEnv(
    process.env["LEAD_NOTIFY_FROM_EMAIL"] ?? process.env["DAILY_DIGEST_FROM_EMAIL"],
  );
  const toEmail = sanitizeEnv(process.env["LEAD_NOTIFY_TO_EMAIL"]) ?? DEFAULT_RECIPIENT;

  if (!apiKey || !fromEmail) {
    logger.warn(
      { leadId: lead.id, hasKey: Boolean(apiKey), hasFrom: Boolean(fromEmail) },
      "Lead notify skipped — RESEND_API_KEY or from-email not configured",
    );
    return false;
  }

  const subject = `New assessment request — ${lead.name} (${lead.company})`;
  const replyTo = lead.contactType === "email" ? lead.contact : undefined;

  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject,
        html: renderHtml(lead),
        text: renderText(lead),
        ...(replyTo ? { reply_to: [replyTo] } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.error(
        { leadId: lead.id, status: res.status, body },
        "Lead notify: Resend rejected send",
      );
      return false;
    }
    logger.info({ leadId: lead.id, to: toEmail }, "Lead notify: email sent");
    return true;
  } catch (err) {
    logger.error({ leadId: lead.id, err }, "Lead notify: send threw");
    return false;
  }
}
