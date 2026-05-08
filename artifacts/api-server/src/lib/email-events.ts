// Email engagement event ingestion + analytics. Resend posts every send /
// delivery / open / click / bounce / complaint to a Svix-signed webhook;
// we verify the signature, persist the event under an idempotency key,
// and aggregate it into per-subscriber and overall metrics for the admin UI.
//
// Read-time caveat: standard email clients don't expose dwell time, and
// AMP-for-email isn't available on Resend. The closest proxies we can
// surface are open count and the gap between first open and first click —
// both are visible in the analytics views.

import crypto from "node:crypto";
import { db, emailEventsTable, subscribersTable } from "@workspace/db";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { logger } from "./logger";

const PROD = process.env["NODE_ENV"] === "production";

/**
 * Self-healing schema migration. Mirrors the pattern used by daily-digest
 * + leads — safe to run on every boot. Adds the email_events table and
 * indexes if they don't exist yet.
 */
export async function ensureEmailEventsSchema(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS email_events (
      id SERIAL PRIMARY KEY,
      provider_event_id TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL,
      event_type TEXT NOT NULL,
      message_id TEXT,
      link TEXT,
      user_agent TEXT,
      ip_address TEXT,
      reason TEXT,
      delta_seconds_from_send INTEGER,
      occurred_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS email_events_email_idx ON email_events (email)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS email_events_event_type_idx ON email_events (event_type)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS email_events_message_id_idx ON email_events (message_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS email_events_occurred_at_idx ON email_events (occurred_at)`);
}

export type ResendVerifyHeaders = {
  id: string;
  timestamp: string;
  signature: string;
};

export type ResendVerifyResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Verify a Resend (Svix-signed) webhook. The body is HMAC-SHA256'd over
 * `<svix-id>.<svix-timestamp>.<raw-body>` with the secret. Returns ok=true
 * on a match against any signature in the `svix-signature` header (it can
 * carry multiple `v1,<sig>` entries for key rotation).
 *
 * If RESEND_WEBHOOK_SECRET isn't set:
 *   - prod: reject (we don't want unsigned events in prod)
 *   - non-prod: accept with a warning (lets local dev work without setup)
 */
export function verifyResendSignature(
  rawBody: Buffer,
  headers: Partial<ResendVerifyHeaders>,
): ResendVerifyResult {
  const secret = process.env["RESEND_WEBHOOK_SECRET"];
  if (!secret) {
    if (PROD) {
      return { ok: false, reason: "RESEND_WEBHOOK_SECRET not configured" };
    }
    logger.warn(
      "RESEND_WEBHOOK_SECRET not set — accepting webhook without verification (dev only)",
    );
    return { ok: true };
  }

  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) {
    return { ok: false, reason: "Missing svix-id/timestamp/signature headers" };
  }

  // Reject events older than 5 minutes — defends against replay.
  const tsSec = Number(timestamp);
  if (!Number.isFinite(tsSec)) {
    return { ok: false, reason: "Invalid svix-timestamp" };
  }
  const ageSec = Math.abs(Math.floor(Date.now() / 1000) - tsSec);
  if (ageSec > 5 * 60) {
    return { ok: false, reason: `Timestamp out of tolerance (${ageSec}s)` };
  }

  // Svix secrets are formatted as `whsec_<base64>`; the actual HMAC key is
  // the base64-decoded suffix.
  const keyMaterial = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  let key: Buffer;
  try {
    key = Buffer.from(keyMaterial, "base64");
  } catch {
    return { ok: false, reason: "Webhook secret is not valid base64" };
  }

  const signedPayload = `${id}.${timestamp}.${rawBody.toString("utf8")}`;
  const expected = crypto.createHmac("sha256", key).update(signedPayload).digest("base64");

  // The header may carry multiple space-separated `v<version>,<sig>` entries.
  const candidates = signature
    .split(/\s+/)
    .map((s) => s.split(",", 2))
    .filter((parts) => parts.length === 2 && parts[0] && parts[0].startsWith("v"))
    .map((parts) => parts[1]!);
  for (const candidate of candidates) {
    if (timingSafeEqualB64(candidate, expected)) {
      return { ok: true };
    }
  }
  return { ok: false, reason: "Signature mismatch" };
}

function timingSafeEqualB64(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "base64");
  const bBuf = Buffer.from(b, "base64");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

type AnyRecord = Record<string, unknown>;

const asString = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;

/**
 * Parse a Resend webhook payload and persist the event. Idempotent on
 * `providerEventId` — duplicate deliveries become no-op `ON CONFLICT DO
 * NOTHING` inserts.
 *
 * Returns whether a new row was inserted (false = duplicate / unknown shape).
 */
export async function recordResendEvent(
  body: unknown,
  providerEventId: string,
): Promise<{ inserted: boolean; eventType?: string; email?: string }> {
  if (!body || typeof body !== "object") return { inserted: false };
  const root = body as AnyRecord;
  const eventType = asString(root["type"]);
  const data = (root["data"] as AnyRecord | undefined) ?? {};
  const createdAt = asString(root["created_at"]) ?? asString(data["created_at"]);
  const occurredAt = createdAt ? new Date(createdAt) : new Date();

  // Resend's `data.to` is sometimes an array of strings, sometimes a single
  // string; we record one row per recipient.
  const toRaw = data["to"];
  const recipients: string[] = Array.isArray(toRaw)
    ? (toRaw.filter((v): v is string => typeof v === "string"))
    : typeof toRaw === "string"
      ? [toRaw]
      : [];

  const messageId = asString(data["email_id"]) ?? asString(data["id"]);
  const link =
    asString((data["click"] as AnyRecord | undefined)?.["link"]) ??
    asString(data["link"]);
  const userAgent =
    asString((data["click"] as AnyRecord | undefined)?.["userAgent"]) ??
    asString((data["open"] as AnyRecord | undefined)?.["userAgent"]) ??
    asString(data["user_agent"]);
  const ipAddress =
    asString((data["click"] as AnyRecord | undefined)?.["ipAddress"]) ??
    asString((data["open"] as AnyRecord | undefined)?.["ipAddress"]) ??
    asString(data["ip_address"]);
  const reason =
    asString((data["bounce"] as AnyRecord | undefined)?.["type"]) ??
    asString(data["reason"]);

  if (!eventType || recipients.length === 0) {
    return { inserted: false };
  }

  let deltaSeconds: number | null = null;
  if (messageId && eventType !== "email.sent") {
    const [sentRow] = await db
      .select({ occurredAt: emailEventsTable.occurredAt })
      .from(emailEventsTable)
      .where(
        and(
          eq(emailEventsTable.messageId, messageId),
          eq(emailEventsTable.eventType, "email.sent"),
        ),
      )
      .limit(1);
    if (sentRow?.occurredAt) {
      deltaSeconds = Math.max(
        0,
        Math.round((occurredAt.getTime() - sentRow.occurredAt.getTime()) / 1000),
      );
    }
  }

  let inserted = false;
  for (let i = 0; i < recipients.length; i++) {
    // De-duplicate per (svix id, recipient index) so a fan-out send still
    // gets one row per recipient without colliding on the same provider id.
    const recipient = recipients[i]!.toLowerCase();
    const dedupeKey =
      recipients.length === 1 ? providerEventId : `${providerEventId}:${i}`;
    const result = await db
      .insert(emailEventsTable)
      .values({
        providerEventId: dedupeKey,
        email: recipient,
        eventType,
        messageId,
        link,
        userAgent,
        ipAddress,
        reason,
        deltaSecondsFromSend: deltaSeconds,
        occurredAt,
      })
      .onConflictDoNothing({ target: emailEventsTable.providerEventId })
      .returning({ id: emailEventsTable.id });
    if (result.length > 0) inserted = true;
  }

  return { inserted, eventType, email: recipients[0] };
}

export type SubscriberRow = {
  email: string;
  source: string | null;
  createdAt: string;
  unsubscribedAt: string | null;
  sends: number;
  delivered: number;
  opens: number;
  uniqueOpens: number;
  clicks: number;
  uniqueClicks: number;
  bounces: number;
  complaints: number;
  lastOpenAt: string | null;
  lastClickAt: string | null;
  /** Average seconds between send and first click for this subscriber. */
  avgSecondsToFirstClick: number | null;
};

export async function listSubscribersWithEngagement(): Promise<SubscriberRow[]> {
  // One trip: subscribers LEFT JOIN aggregated event counts.
  const rows = await db.execute(sql`
    SELECT
      s.email                                                   AS email,
      s.source                                                  AS source,
      s.created_at                                              AS created_at,
      s.unsubscribed_at                                         AS unsubscribed_at,
      COALESCE(e.sends, 0)::int                                 AS sends,
      COALESCE(e.delivered, 0)::int                             AS delivered,
      COALESCE(e.opens, 0)::int                                 AS opens,
      COALESCE(e.unique_opens, 0)::int                          AS unique_opens,
      COALESCE(e.clicks, 0)::int                                AS clicks,
      COALESCE(e.unique_clicks, 0)::int                         AS unique_clicks,
      COALESCE(e.bounces, 0)::int                               AS bounces,
      COALESCE(e.complaints, 0)::int                            AS complaints,
      e.last_open_at                                            AS last_open_at,
      e.last_click_at                                           AS last_click_at,
      e.avg_seconds_to_first_click                              AS avg_seconds_to_first_click
    FROM subscribers s
    LEFT JOIN (
      SELECT
        LOWER(email) AS email,
        SUM(CASE WHEN event_type = 'email.sent'      THEN 1 ELSE 0 END) AS sends,
        SUM(CASE WHEN event_type = 'email.delivered' THEN 1 ELSE 0 END) AS delivered,
        SUM(CASE WHEN event_type = 'email.opened'    THEN 1 ELSE 0 END) AS opens,
        COUNT(DISTINCT CASE WHEN event_type = 'email.opened'  THEN message_id END) AS unique_opens,
        SUM(CASE WHEN event_type = 'email.clicked'   THEN 1 ELSE 0 END) AS clicks,
        COUNT(DISTINCT CASE WHEN event_type = 'email.clicked' THEN message_id END) AS unique_clicks,
        SUM(CASE WHEN event_type = 'email.bounced'   THEN 1 ELSE 0 END) AS bounces,
        SUM(CASE WHEN event_type = 'email.complained' THEN 1 ELSE 0 END) AS complaints,
        MAX(CASE WHEN event_type = 'email.opened'    THEN occurred_at END) AS last_open_at,
        MAX(CASE WHEN event_type = 'email.clicked'   THEN occurred_at END) AS last_click_at,
        AVG(CASE WHEN event_type = 'email.clicked'   THEN delta_seconds_from_send END)::int AS avg_seconds_to_first_click
      FROM email_events
      GROUP BY LOWER(email)
    ) e ON e.email = LOWER(s.email)
    ORDER BY
      COALESCE(e.last_open_at, e.last_click_at, s.created_at) DESC NULLS LAST
  `);
  return (rows.rows as AnyRecord[]).map((r) => ({
    email: String(r["email"] ?? ""),
    source: r["source"] == null ? null : String(r["source"]),
    createdAt: r["created_at"] instanceof Date ? r["created_at"].toISOString() : String(r["created_at"]),
    unsubscribedAt:
      r["unsubscribed_at"] instanceof Date
        ? r["unsubscribed_at"].toISOString()
        : r["unsubscribed_at"] == null
          ? null
          : String(r["unsubscribed_at"]),
    sends: Number(r["sends"] ?? 0),
    delivered: Number(r["delivered"] ?? 0),
    opens: Number(r["opens"] ?? 0),
    uniqueOpens: Number(r["unique_opens"] ?? 0),
    clicks: Number(r["clicks"] ?? 0),
    uniqueClicks: Number(r["unique_clicks"] ?? 0),
    bounces: Number(r["bounces"] ?? 0),
    complaints: Number(r["complaints"] ?? 0),
    lastOpenAt:
      r["last_open_at"] instanceof Date
        ? r["last_open_at"].toISOString()
        : r["last_open_at"] == null
          ? null
          : String(r["last_open_at"]),
    lastClickAt:
      r["last_click_at"] instanceof Date
        ? r["last_click_at"].toISOString()
        : r["last_click_at"] == null
          ? null
          : String(r["last_click_at"]),
    avgSecondsToFirstClick:
      r["avg_seconds_to_first_click"] == null
        ? null
        : Number(r["avg_seconds_to_first_click"]),
  }));
}

export type EmailAnalytics = {
  totals: {
    activeSubscribers: number;
    unsubscribed: number;
    sends: number;
    delivered: number;
    opens: number;
    clicks: number;
    bounces: number;
    complaints: number;
    uniqueOpenEmails: number;
    uniqueClickEmails: number;
    openRate: number; // unique-open / delivered
    clickRate: number; // unique-click / delivered
    avgSecondsOpenToClick: number | null;
  };
  topLinks: Array<{ link: string; clicks: number; uniqueClickers: number }>;
  recentEvents: Array<{
    id: number;
    email: string;
    eventType: string;
    link: string | null;
    occurredAt: string;
  }>;
};

export async function getEmailAnalytics(): Promise<EmailAnalytics> {
  const [subStats] = await db
    .select({
      active: sql<number>`count(*) filter (where ${subscribersTable.unsubscribedAt} is null)::int`,
      unsubscribed: sql<number>`count(*) filter (where ${subscribersTable.unsubscribedAt} is not null)::int`,
    })
    .from(subscribersTable);

  const [eventStats] = await db.execute(sql`
    SELECT
      SUM(CASE WHEN event_type = 'email.sent'        THEN 1 ELSE 0 END)::int                          AS sends,
      SUM(CASE WHEN event_type = 'email.delivered'   THEN 1 ELSE 0 END)::int                          AS delivered,
      SUM(CASE WHEN event_type = 'email.opened'      THEN 1 ELSE 0 END)::int                          AS opens,
      SUM(CASE WHEN event_type = 'email.clicked'     THEN 1 ELSE 0 END)::int                          AS clicks,
      SUM(CASE WHEN event_type = 'email.bounced'     THEN 1 ELSE 0 END)::int                          AS bounces,
      SUM(CASE WHEN event_type = 'email.complained'  THEN 1 ELSE 0 END)::int                          AS complaints,
      COUNT(DISTINCT CASE WHEN event_type = 'email.opened'  THEN (LOWER(email) || ':' || COALESCE(message_id, '')) END)::int AS unique_opens,
      COUNT(DISTINCT CASE WHEN event_type = 'email.clicked' THEN (LOWER(email) || ':' || COALESCE(message_id, '')) END)::int AS unique_clicks,
      AVG(CASE WHEN event_type = 'email.clicked' THEN delta_seconds_from_send END)::int               AS avg_seconds_open_to_click
    FROM email_events
  `).then((r) => r.rows as AnyRecord[]);

  const sends = Number(eventStats?.["sends"] ?? 0);
  const delivered = Number(eventStats?.["delivered"] ?? 0);
  const opens = Number(eventStats?.["opens"] ?? 0);
  const clicks = Number(eventStats?.["clicks"] ?? 0);
  const bounces = Number(eventStats?.["bounces"] ?? 0);
  const complaints = Number(eventStats?.["complaints"] ?? 0);
  const uniqueOpenEmails = Number(eventStats?.["unique_opens"] ?? 0);
  const uniqueClickEmails = Number(eventStats?.["unique_clicks"] ?? 0);
  const denom = delivered > 0 ? delivered : sends;
  const openRate = denom > 0 ? uniqueOpenEmails / denom : 0;
  const clickRate = denom > 0 ? uniqueClickEmails / denom : 0;

  const linkRows = await db.execute(sql`
    SELECT
      link                                AS link,
      COUNT(*)::int                       AS clicks,
      COUNT(DISTINCT LOWER(email))::int   AS unique_clickers
    FROM email_events
    WHERE event_type = 'email.clicked' AND link IS NOT NULL
    GROUP BY link
    ORDER BY clicks DESC
    LIMIT 10
  `);

  const recentRows = await db
    .select({
      id: emailEventsTable.id,
      email: emailEventsTable.email,
      eventType: emailEventsTable.eventType,
      link: emailEventsTable.link,
      occurredAt: emailEventsTable.occurredAt,
    })
    .from(emailEventsTable)
    .orderBy(desc(emailEventsTable.occurredAt))
    .limit(50);

  return {
    totals: {
      activeSubscribers: Number(subStats?.active ?? 0),
      unsubscribed: Number(subStats?.unsubscribed ?? 0),
      sends,
      delivered,
      opens,
      clicks,
      bounces,
      complaints,
      uniqueOpenEmails,
      uniqueClickEmails,
      openRate,
      clickRate,
      avgSecondsOpenToClick:
        eventStats?.["avg_seconds_open_to_click"] == null
          ? null
          : Number(eventStats["avg_seconds_open_to_click"]),
    },
    topLinks: (linkRows.rows as AnyRecord[]).map((r) => ({
      link: String(r["link"] ?? ""),
      clicks: Number(r["clicks"] ?? 0),
      uniqueClickers: Number(r["unique_clickers"] ?? 0),
    })),
    recentEvents: recentRows.map((r) => ({
      id: r.id,
      email: r.email,
      eventType: r.eventType,
      link: r.link,
      occurredAt: r.occurredAt.toISOString(),
    })),
  };
}

export async function activeSubscriberCount(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(subscribersTable)
    .where(isNull(subscribersTable.unsubscribedAt));
  return row?.count ?? 0;
}
