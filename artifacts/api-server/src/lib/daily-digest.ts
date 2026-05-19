// Daily top-10 dispatch email. Replaces the previous writer-post digest:
// each send is the top-10 headlines + commentary that the website serves,
// with the Deerpark logo + a freshly-generated banner image at the top,
// run through an LLM editor pass for subject line + intro + light copy
// edits.
//
// Idempotency: at most one send per Pacific-time calendar day. Tracked
// via a settings-table key so the writer-post pipeline isn't entangled.

import { db, settingsTable, subscribersTable } from "@workspace/db";
import { eq, isNull, sql } from "drizzle-orm";
import { logger } from "./logger";
import {
  composeDailyEmail,
  loadTopHeadlinesForEmail,
  BANNER_CID,
  type ComposedEmail,
} from "./top10-email";
import {
  archiveDispatch,
  ensureDispatchArchiveSchema,
} from "./dispatch-archive";
import { ensureDispatchEvalSchema } from "./dispatch-eval";
import { ensureDispatchPromptsSchema } from "./dispatch-prompts";
import { ensureDispatchLlmCallsSchema } from "./dispatch-llm-calls";

const RESEND_API = "https://api.resend.com/emails";

// One settings-table row per day-of-send. Stored as the PT YYYY-MM-DD
// string we last successfully sent for. Lets `alreadySentToday()` answer
// without scraping mail-provider logs.
const LAST_SENT_KEY = "daily_top10_email.last_sent_pt_date";

type DigestConfig = {
  fromEmail: string;
  resendApiKey: string;
  /**
   * Send time in America/Los_Angeles (Pacific Time). DST-aware via
   * Intl.DateTimeFormat in the tick — same wall-clock hour year-round
   * regardless of PST/PDT.
   */
  hourPt: number;
  minutePt: number;
  /** Days of week (PT) on which the digest may send. 0 = Sun, 6 = Sat. */
  daysOfWeekPt: Set<number>;
  /** Public archive link in the email footer. */
  archiveUrl: string;
  /** Base URL for the unsubscribe link. */
  publicBaseUrl: string;
};

const DIGEST_TIMEZONE = "America/Los_Angeles";
const DEFAULT_HOUR_PT = 15;
const DEFAULT_MINUTE_PT = 30;
// Send days in PT — 0 = Sun, 1 = Mon, ..., 6 = Sat. Tue + Thu cadence so
// subscribers get two dispatches a week instead of one a day.
const DEFAULT_DAYS_OF_WEEK_PT = "2,4";

/**
 * Trim whitespace and strip outer quotes from a config value. Common failure
 * mode: env values pasted with surrounding quotes which `fly secrets set` then
 * stores literally.
 */
function sanitizeEnv(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  let v = raw.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

/**
 * Parse a CSV like "2,4" into a set of valid 0–6 day indices. Anything
 * unparseable falls back to the default cadence so a typo in env can't
 * accidentally disable all sends.
 */
function parseDaysOfWeekPt(raw: string | undefined): Set<number> {
  const src = sanitizeEnv(raw) ?? DEFAULT_DAYS_OF_WEEK_PT;
  // Drop empty/whitespace tokens before numeric coercion — without this,
  // a trailing comma (`"2,4,"`) becomes `Number("")` = 0, silently adding
  // Sunday to the schedule.
  const parts = src
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => Number(p))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  if (parts.length === 0) {
    return new Set(
      DEFAULT_DAYS_OF_WEEK_PT.split(",").map((p) => Number(p.trim())),
    );
  }
  return new Set(parts);
}

/** Public-safe view of config state. */
export function digestConfigStatus(): {
  hasFromEmail: boolean;
  hasResendKey: boolean;
  hasLlmKey: boolean;
  hourPt: number;
  minutePt: number;
  daysOfWeekPt: number[];
  timezone: string;
  ready: boolean;
} {
  const hasFromEmail = Boolean(sanitizeEnv(process.env["DAILY_DIGEST_FROM_EMAIL"]));
  const hasResendKey = Boolean(sanitizeEnv(process.env["RESEND_API_KEY"]));
  const hasLlmKey = Boolean(sanitizeEnv(process.env["LLM_API_KEY"]));
  return {
    hasFromEmail,
    hasResendKey,
    hasLlmKey,
    hourPt: Number(process.env["DAILY_DIGEST_HOUR_PT"] ?? String(DEFAULT_HOUR_PT)),
    minutePt: Number(process.env["DAILY_DIGEST_MINUTE_PT"] ?? String(DEFAULT_MINUTE_PT)),
    daysOfWeekPt: [...parseDaysOfWeekPt(process.env["DAILY_DIGEST_DAYS_PT"])].sort(),
    timezone: DIGEST_TIMEZONE,
    // Resend + from-email are required to send. LLM_API_KEY is optional —
    // missing it just disables image gen + polish (fallback subject/intro).
    ready: hasFromEmail && hasResendKey,
  };
}

function readConfig(): DigestConfig | { error: string } {
  const fromEmail = sanitizeEnv(process.env["DAILY_DIGEST_FROM_EMAIL"]);
  const resendApiKey = sanitizeEnv(process.env["RESEND_API_KEY"]);
  if (!fromEmail) return { error: "DAILY_DIGEST_FROM_EMAIL not set" };
  if (!resendApiKey) return { error: "RESEND_API_KEY not set" };

  const hourPt = Number(process.env["DAILY_DIGEST_HOUR_PT"] ?? String(DEFAULT_HOUR_PT));
  const minutePt = Number(process.env["DAILY_DIGEST_MINUTE_PT"] ?? String(DEFAULT_MINUTE_PT));
  if (!Number.isFinite(hourPt) || hourPt < 0 || hourPt > 23) {
    return { error: `Invalid DAILY_DIGEST_HOUR_PT: ${hourPt}` };
  }
  if (!Number.isFinite(minutePt) || minutePt < 0 || minutePt > 59) {
    return { error: `Invalid DAILY_DIGEST_MINUTE_PT: ${minutePt}` };
  }

  return {
    fromEmail,
    resendApiKey,
    hourPt,
    minutePt,
    daysOfWeekPt: parseDaysOfWeekPt(process.env["DAILY_DIGEST_DAYS_PT"]),
    archiveUrl: sanitizeEnv(process.env["SUBSTACK_URL"]) ?? "https://deerparkai.substack.com",
    publicBaseUrl: sanitizeEnv(process.env["PUBLIC_API_BASE_URL"]) ?? "https://deerpark-api.fly.dev",
  };
}

function ptDateString(now: Date = new Date()): string {
  // YYYY-MM-DD in PT for the idempotency key. en-CA gives ISO-like format.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DIGEST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Current Pacific-time minute-of-day (0–1439). Uses Intl.DateTimeFormat with
 * `hourCycle: "h23"` so 12am reads as 0, not 24, regardless of host locale.
 */
function ptMinutesOfDay(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DIGEST_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/** Current Pacific-time day-of-week (0 = Sun, 6 = Sat). */
function ptDayOfWeek(now: Date = new Date()): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: DIGEST_TIMEZONE,
    weekday: "short",
  }).format(now);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
}

async function getLastSentPtDate(): Promise<string | null> {
  const [row] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, LAST_SENT_KEY))
    .limit(1);
  return row?.value ?? null;
}

async function setLastSentPtDate(date: string): Promise<void> {
  await db
    .insert(settingsTable)
    .values({ key: LAST_SENT_KEY, value: date })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value: date, updatedAt: new Date() },
    });
}

async function alreadySentToday(): Promise<boolean> {
  const last = await getLastSentPtDate();
  return last !== null && last === ptDateString();
}

/** Active subscribers (not unsubscribed), with a guaranteed unsubscribe token. */
export async function loadActiveSubscribers(): Promise<
  Array<{ email: string; unsubscribeToken: string }>
> {
  // Backfill missing tokens — cheap (only affects legacy rows). The unique
  // constraint on the column makes this idempotent across racing instances.
  await db.execute(sql`
    UPDATE subscribers
    SET unsubscribe_token = gen_random_uuid()::text
    WHERE unsubscribe_token IS NULL
  `);

  const rows = await db
    .select({ email: subscribersTable.email, unsubscribeToken: subscribersTable.unsubscribeToken })
    .from(subscribersTable)
    .where(isNull(subscribersTable.unsubscribedAt));

  return rows
    .filter((r): r is { email: string; unsubscribeToken: string } => r.unsubscribeToken !== null);
}

type SendResult = { recipient: string; ok: boolean; error?: string };

/**
 * Build the Resend `attachments` array for the composed email's banner.
 * Inlining via `content_id` keeps the binary out of the HTML body so
 * Gmail's ~102KB clip threshold isn't tripped by a base64-encoded PNG.
 */
function buildAttachments(
  email: ComposedEmail,
): Array<{ filename: string; content: string; content_id: string }> {
  if (!email.bannerImage) return [];
  return [
    {
      filename: BANNER_CID,
      content: email.bannerImage.base64,
      content_id: BANNER_CID,
    },
  ];
}

async function sendOne(
  email: ComposedEmail,
  recipient: { email: string; unsubscribeToken: string },
  cfg: DigestConfig,
): Promise<SendResult> {
  const unsubscribeUrl = `${cfg.publicBaseUrl}/api/unsubscribe?token=${encodeURIComponent(recipient.unsubscribeToken)}`;
  const attachments = buildAttachments(email);
  // The composed HTML/text already contain the per-recipient unsubscribe URL
  // because we re-compose per recipient (see composeAndSendDailyTop10 below).
  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: cfg.fromEmail,
      to: [recipient.email],
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(attachments.length > 0 ? { attachments } : {}),
      // RFC 8058 one-click unsubscribe header. Gmail/Yahoo prefer this.
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { recipient: recipient.email, ok: false, error: `${res.status}: ${body}` };
  }
  return { recipient: recipient.email, ok: true };
}

export type DigestRunResult = {
  subject: string;
  headlineCount: number;
  sent: number;
  failed: number;
  bannerGenerated: boolean;
  polishApplied: boolean;
  results: SendResult[];
};

/**
 * Run one digest send. Idempotent: at most one send per Pacific-time day.
 * Returns a summary, or null if nothing was sent (config incomplete, no
 * candidates, no subscribers, or already sent today).
 */
export async function runDailyDigest(): Promise<DigestRunResult | null> {
  const cfg = readConfig();
  if ("error" in cfg) {
    logger.warn({ reason: cfg.error }, "Daily digest skipped — config incomplete");
    return null;
  }

  if (await alreadySentToday()) {
    logger.info("Daily digest skipped — already sent today (PT)");
    return null;
  }

  const subscribers = await loadActiveSubscribers();
  if (subscribers.length === 0) {
    logger.warn("Daily digest skipped — no active subscribers");
    return null;
  }

  // Compose once with a placeholder URL so we get a single image-gen +
  // polish round-trip; per-recipient we patch in the actual unsubscribe
  // URL via string replacement below. Cheaper than composing N times for
  // the small per-recipient delta.
  const placeholder = "__UNSUBSCRIBE_URL__";
  const composed = await composeDailyEmail({
    unsubscribeUrl: placeholder,
    archiveUrl: cfg.archiveUrl,
  });
  if (!composed) {
    logger.info("Daily digest skipped — no top-10 candidates");
    return null;
  }

  logger.info(
    {
      subject: composed.subject,
      headlineCount: composed.headlineCount,
      bannerGenerated: composed.bannerGenerated,
      polishApplied: composed.polishApplied,
      subscribers: subscribers.length,
    },
    "Daily digest: sending top-10 to subscribers",
  );

  // Per-recipient send. Sequential with a small gap to stay under Resend's
  // rate limit (2 req/s on the free tier). Small lists; fine for now.
  const results: SendResult[] = [];
  for (const sub of subscribers) {
    const unsubscribeUrl = `${cfg.publicBaseUrl}/api/unsubscribe?token=${encodeURIComponent(sub.unsubscribeToken)}`;
    const personalized: ComposedEmail = {
      ...composed,
      html: composed.html.split(placeholder).join(unsubscribeUrl),
      text: composed.text.split(placeholder).join(unsubscribeUrl),
    };
    try {
      const r = await sendOne(personalized, sub, cfg);
      results.push(r);
      if (!r.ok) {
        logger.warn({ recipient: r.recipient, error: r.error }, "Daily digest: per-recipient send failed");
      }
    } catch (err) {
      results.push({
        recipient: sub.email,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    // 600ms gap → ~1.6 req/s, comfortably under Resend's 2 req/s free-tier limit.
    await new Promise((r) => setTimeout(r, 600));
  }

  const sent = results.filter((r) => r.ok).length;
  const failed = results.length - sent;

  // Mark the day sent if AT LEAST ONE recipient got it. Preserves
  // idempotency without losing the send to a single bad address.
  if (sent > 0) {
    await setLastSentPtDate(ptDateString());
  }

  // Archive the composed dispatch for feedback capture (uses the placeholder
  // unsubscribe URL — we store the canonical composed HTML, not the
  // per-recipient personalized variants).
  await archiveDispatch({
    kind: "send",
    composed,
    recipientCount: sent,
  });

  logger.info(
    { subject: composed.subject, sent, failed },
    "Daily digest: complete",
  );

  return {
    subject: composed.subject,
    headlineCount: composed.headlineCount,
    sent,
    failed,
    bannerGenerated: composed.bannerGenerated,
    polishApplied: composed.polishApplied,
    results,
  };
}

// Loose RFC 5321 sanity check — good enough to reject typos before we hand
// the address to Resend, which does the real validation.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SendTestResult =
  | {
      ok: true;
      recipient: string;
      subject: string;
      headlineCount: number;
      bannerGenerated: boolean;
      polishApplied: boolean;
      diagnostics: import("./top10-email").ComposeDiagnostics;
    }
  | { ok: false; recipient: string; error: string };

/**
 * Send the day's composed top-10 to a single address — bypasses the
 * subscribers table, the per-day idempotency lock, and the last-sent
 * marker. Subject is prefixed with `[TEST] ` so a test send can't be
 * confused with the real dispatch. Used by the admin "send a test to me"
 * button so we can debug delivery without a fresh dispatch cycle.
 */
export async function sendTestDigest(to: string): Promise<SendTestResult> {
  const recipient = to.trim();
  if (!EMAIL_RE.test(recipient)) {
    return { ok: false, recipient, error: "Invalid email address" };
  }

  const cfg = readConfig();
  if ("error" in cfg) {
    return { ok: false, recipient, error: cfg.error };
  }

  const composed = await composeDailyEmail({
    unsubscribeUrl: `${cfg.publicBaseUrl}/api/unsubscribe?token=test`,
    archiveUrl: cfg.archiveUrl,
  });
  if (!composed) {
    return { ok: false, recipient, error: "No top-10 candidates available — nothing to send" };
  }

  const subject = `[TEST] ${composed.subject}`;
  const attachments = buildAttachments(composed);
  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: cfg.fromEmail,
      to: [recipient],
      subject,
      html: composed.html,
      text: composed.text,
      ...(attachments.length > 0 ? { attachments } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, recipient, error: `Resend ${res.status}: ${body}` };
  }

  // Archive the test send so the operator can review and leave feedback
  // even on test runs (those are typically how the operator reviews
  // dispatch quality before a real send).
  await archiveDispatch({ kind: "test", composed });

  return {
    ok: true,
    recipient,
    subject,
    headlineCount: composed.headlineCount,
    bannerGenerated: composed.bannerGenerated,
    polishApplied: composed.polishApplied,
    diagnostics: composed.diagnostics,
  };
}

/**
 * Compose the email without sending. Returns subject + HTML so the admin
 * UI can preview it in an iframe before bulk send.
 */
export async function previewDailyDigest(): Promise<
  | {
      subject: string;
      html: string;
      text: string;
      headlineCount: number;
      bannerGenerated: boolean;
      polishApplied: boolean;
    }
  | null
> {
  const cfg = readConfig();
  if ("error" in cfg) return null;

  const composed = await composeDailyEmail({
    unsubscribeUrl: `${cfg.publicBaseUrl}/api/unsubscribe?token=preview`,
    archiveUrl: cfg.archiveUrl,
  });
  if (!composed) return null;

  // Sends use `cid:` references resolved against MIME attachments, but the
  // admin preview renders inside a browser iframe where `cid:` won't load.
  // Swap to a `data:` URL just for the preview so the banner shows up.
  const previewHtml = composed.bannerImage
    ? composed.html.replace(
        `cid:${BANNER_CID}`,
        `data:${composed.bannerImage.mimeType};base64,${composed.bannerImage.base64}`,
      )
    : composed.html;

  // Archive the preview so it lands in the Eval & feedback dataset — the
  // operator typically reviews quality via Preview, so capturing those
  // compositions is how the eval log fills up between real sends.
  // Persist the cid-referencing canonical html (not the data-url preview
  // variant) so the body matches what an actual send would deliver.
  await archiveDispatch({ kind: "preview", composed });

  return {
    subject: composed.subject,
    html: previewHtml,
    text: composed.text,
    headlineCount: composed.headlineCount,
    bannerGenerated: composed.bannerGenerated,
    polishApplied: composed.polishApplied,
  };
}

/** Status snapshot for the admin "Email agents" tab. */
export async function getDailyDigestState(): Promise<{
  config: ReturnType<typeof digestConfigStatus>;
  lastSentPtDate: string | null;
  todayPtDate: string;
  alreadySentToday: boolean;
  topCandidateCount: number;
  activeSubscribers: number;
}> {
  const config = digestConfigStatus();
  const [lastSentPtDate, headlines] = await Promise.all([
    getLastSentPtDate(),
    loadTopHeadlinesForEmail().catch(() => []),
  ]);
  const today = ptDateString();
  const subRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(subscribersTable)
    .where(isNull(subscribersTable.unsubscribedAt));
  return {
    config,
    lastSentPtDate,
    todayPtDate: today,
    alreadySentToday: lastSentPtDate === today,
    topCandidateCount: headlines.length,
    activeSubscribers: subRows[0]?.count ?? 0,
  };
}

/**
 * Self-healing schema migration. Adds the `unsubscribe_token` /
 * `unsubscribed_at` columns to subscribers if missing, and backfills
 * tokens for legacy subscriber rows. Idempotent; safe to run on every boot.
 */
export async function ensureSchema(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS unsubscribe_token TEXT UNIQUE
  `);
  await db.execute(sql`
    ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS subscribers_unsubscribed_at_idx
    ON subscribers (unsubscribed_at)
  `);
  // pgcrypto for gen_random_uuid() — most Postgres installs have it; harmless if already enabled.
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  // Dispatch-archive table + eval columns — kept colocated with the other
  // dispatch boot bookkeeping so a fresh DB picks up everything in one place.
  await ensureDispatchArchiveSchema();
  await ensureDispatchEvalSchema();
  await ensureDispatchPromptsSchema();
  await ensureDispatchLlmCallsSchema();
}

let digestHandle: NodeJS.Timeout | null = null;

/**
 * Tick every 5 minutes. After the configured target time, on any tick where
 * no send has happened today, run the digest. `alreadySentToday()` is the
 * actual double-send guard; the time check is just "not too early."
 */
export function startDailyDigestScheduler(intervalMs = 5 * 60 * 1000): void {
  if (digestHandle) return;

  ensureSchema().catch((err) => {
    logger.error({ err }, "Daily digest: ensureSchema failed");
  });

  const tick = async () => {
    const cfg = readConfig();
    if ("error" in cfg) return;

    if (!cfg.daysOfWeekPt.has(ptDayOfWeek())) return; // not a send day

    const targetMin = cfg.hourPt * 60 + cfg.minutePt;
    const nowMin = ptMinutesOfDay();
    if (nowMin < targetMin) return; // too early in PT; wait for the configured hour

    try {
      await runDailyDigest();
    } catch (err) {
      logger.error({ err }, "Daily digest tick threw");
    }
  };

  setTimeout(() => void tick(), 60_000);
  digestHandle = setInterval(() => void tick(), intervalMs);
}

/**
 * Mark a subscriber as unsubscribed by token. Idempotent — repeat clicks are
 * fine. Returns the email that was unsubscribed (for the confirmation page),
 * or null if the token was unknown.
 */
export async function unsubscribeByToken(token: string): Promise<string | null> {
  if (!token) return null;
  // Look up first so we can return the email; UPDATE ... RETURNING would be one round-trip
  // but Drizzle's exec API doesn't surface it cleanly. Two queries is fine here.
  const rows = await db.execute<{ email: string }>(sql`
    SELECT email FROM subscribers WHERE unsubscribe_token = ${token}
  `);
  const email = rows.rows[0]?.email ?? null;
  if (!email) return null;
  await db.execute(sql`
    UPDATE subscribers SET unsubscribed_at = COALESCE(unsubscribed_at, NOW())
    WHERE unsubscribe_token = ${token}
  `);
  return email;
}
