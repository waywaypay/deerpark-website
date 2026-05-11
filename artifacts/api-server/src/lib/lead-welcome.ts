import type { Lead } from "@workspace/db";
import { logger } from "./logger";

const RESEND_API = "https://api.resend.com/emails";
const DEFAULT_FROM = "DeerPark <hello@deerpark.io>";
const DEFAULT_REPLY_TO = "contact@deerpark.io";

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

function firstName(name: string): string {
  const first = name.split(/\s+/)[0]?.trim();
  return first || "there";
}

// PM-style discovery questions. Each pairs a question with a one-line "why"
// so the reader knows what kind of answer is actually useful.
const QUESTIONS: Array<{ q: string; why: string }> = [
  {
    q: "What workflow are you hoping AI will fit into? Walk us through it end-to-end — the steps a teammate actually takes today.",
    why: "We want to see the real path, not the idealized one.",
  },
  {
    q: "Who does that work today, how long does each run take, and how often does it happen?",
    why: "This is where the cost actually lives — people, minutes, frequency.",
  },
  {
    q: "What would have to be true 90 days from now for this to feel like a win?",
    why: "Concrete success criteria beat \"transformation.\"",
  },
  {
    q: "What have you already tried — internal tools, vendors, prompts — and what didn't stick?",
    why: "We'd rather hear it now than rediscover it.",
  },
  {
    q: "Where does the input data live (systems, docs, inboxes, people), and who owns access?",
    why: "Most stalls trace back to data access, not the model.",
  },
  {
    q: "Any compliance, security, or procurement guardrails we should know about up front?",
    why: "Cheaper to design for them than to retrofit.",
  },
];

function renderHtml(lead: Lead): string {
  const greeting = escapeHtml(firstName(lead.name));
  const items = QUESTIONS.map(
    ({ q, why }) =>
      `<li style="margin-bottom:14px;"><div style="font-size:15px;line-height:1.55;color:#111;">${escapeHtml(
        q,
      )}</div><div style="font-size:13px;line-height:1.5;color:#666;margin-top:4px;">${escapeHtml(
        why,
      )}</div></li>`,
  ).join("");
  return `<div style="font-family:Georgia,serif;color:#111;max-width:560px;">
  <p style="font-size:15px;line-height:1.6;margin:0 0 14px 0;">Hi ${greeting},</p>
  <p style="font-size:15px;line-height:1.6;margin:0 0 14px 0;">Thanks for raising your hand. Before we get on a call, a short product-manager-style brief tends to make the first 20 minutes worth more than an hour of throat-clearing.</p>
  <p style="font-size:15px;line-height:1.6;margin:0 0 20px 0;">If you can reply to this email with rough answers — bullets are perfect — we'll come to the conversation with a sharper take.</p>
  <ol style="padding-left:20px;margin:0 0 20px 0;">${items}</ol>
  <p style="font-size:15px;line-height:1.6;margin:0 0 14px 0;">No prep, no slides — just diagnostics. Reply whenever you have a few minutes.</p>
  <p style="font-size:15px;line-height:1.6;margin:0;">— DeerPark</p>
</div>`;
}

function renderText(lead: Lead): string {
  const greeting = firstName(lead.name);
  const lines: string[] = [
    `Hi ${greeting},`,
    "",
    "Thanks for raising your hand. Before we get on a call, a short product-manager-style brief tends to make the first 20 minutes worth more than an hour of throat-clearing.",
    "",
    "If you can reply to this email with rough answers — bullets are perfect — we'll come to the conversation with a sharper take.",
    "",
  ];
  QUESTIONS.forEach(({ q, why }, i) => {
    lines.push(`${i + 1}. ${q}`);
    lines.push(`   (${why})`);
    lines.push("");
  });
  lines.push(
    "No prep, no slides — just diagnostics. Reply whenever you have a few minutes.",
    "",
    "— DeerPark",
  );
  return lines.join("\n");
}

/**
 * Best-effort PM-style discovery email sent FROM DeerPark TO an email-typed
 * lead immediately after they submit the desktop Free Consult modal.
 * Resolves to true on Resend 2xx, false otherwise; never throws — the lead
 * is already persisted and visible in the admin dashboard regardless.
 */
export async function sendLeadWelcomeEmail(lead: Lead): Promise<boolean> {
  if (lead.contactType !== "email") return false;

  const apiKey = sanitizeEnv(process.env["RESEND_API_KEY"]);
  const fromEmail =
    sanitizeEnv(process.env["LEAD_WELCOME_FROM_EMAIL"]) ?? DEFAULT_FROM;
  const replyTo =
    sanitizeEnv(process.env["LEAD_WELCOME_REPLY_TO"]) ?? DEFAULT_REPLY_TO;

  if (!apiKey) {
    logger.warn(
      { leadId: lead.id },
      "Lead welcome skipped — RESEND_API_KEY not configured",
    );
    return false;
  }

  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [lead.contact],
        subject: "A few questions before we talk — DeerPark",
        html: renderHtml(lead),
        text: renderText(lead),
        reply_to: [replyTo],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.error(
        { leadId: lead.id, status: res.status, body },
        "Lead welcome: Resend rejected send",
      );
      return false;
    }
    logger.info({ leadId: lead.id, to: lead.contact }, "Lead welcome: email sent");
    return true;
  } catch (err) {
    logger.error({ leadId: lead.id, err }, "Lead welcome: send threw");
    return false;
  }
}
