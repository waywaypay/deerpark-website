import { db, postsTable, subscribersTable, type Post } from "@workspace/db";
import { and, desc, gte, isNull, sql } from "drizzle-orm";
import { marked } from "marked";
import { logger } from "./logger";

const RESEND_API = "https://api.resend.com/emails";

type DigestConfig = {
  fromEmail: string;
  resendApiKey: string;
  hourUtc: number;
  minuteUtc: number;
  /** Public archive link in the email footer. */
  archiveUrl: string;
  /** Base URL for the unsubscribe link. */
  publicBaseUrl: string;
};

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

/** Public-safe view of config state. */
export function digestConfigStatus(): {
  hasFromEmail: boolean;
  hasResendKey: boolean;
  hourUtc: number;
  minuteUtc: number;
  ready: boolean;
} {
  const hasFromEmail = Boolean(sanitizeEnv(process.env["DAILY_DIGEST_FROM_EMAIL"]));
  const hasResendKey = Boolean(sanitizeEnv(process.env["RESEND_API_KEY"]));
  return {
    hasFromEmail,
    hasResendKey,
    hourUtc: Number(process.env["DAILY_DIGEST_HOUR_UTC"] ?? "13"),
    minuteUtc: Number(process.env["DAILY_DIGEST_MINUTE_UTC"] ?? "0"),
    ready: hasFromEmail && hasResendKey,
  };
}

function readConfig(): DigestConfig | { error: string } {
  const fromEmail = sanitizeEnv(process.env["DAILY_DIGEST_FROM_EMAIL"]);
  const resendApiKey = sanitizeEnv(process.env["RESEND_API_KEY"]);
  if (!fromEmail) return { error: "DAILY_DIGEST_FROM_EMAIL not set" };
  if (!resendApiKey) return { error: "RESEND_API_KEY not set" };

  const hourUtc = Number(process.env["DAILY_DIGEST_HOUR_UTC"] ?? "13");
  const minuteUtc = Number(process.env["DAILY_DIGEST_MINUTE_UTC"] ?? "0");
  if (!Number.isFinite(hourUtc) || hourUtc < 0 || hourUtc > 23) {
    return { error: `Invalid DAILY_DIGEST_HOUR_UTC: ${hourUtc}` };
  }
  if (!Number.isFinite(minuteUtc) || minuteUtc < 0 || minuteUtc > 59) {
    return { error: `Invalid DAILY_DIGEST_MINUTE_UTC: ${minuteUtc}` };
  }

  return {
    fromEmail,
    resendApiKey,
    hourUtc,
    minuteUtc,
    archiveUrl: sanitizeEnv(process.env["SUBSTACK_URL"]) ?? "https://deerparkai.substack.com",
    publicBaseUrl: sanitizeEnv(process.env["PUBLIC_API_BASE_URL"]) ?? "https://deerpark-api.fly.dev",
  };
}

/**
 * Pick the single best post from a candidate set.
 *
 * Heuristic, in priority order:
 *   1. mode = "deep_dive" beats mode = "free_pick"
 *   2. more citations
 *   3. longer body (proxy for substance)
 *   4. most recently published (tiebreak)
 */
export function pickBestPost(candidates: Post[]): Post | null {
  if (candidates.length === 0) return null;
  const ranked = [...candidates].sort((a, b) => {
    const modeRank = (p: Post) => (p.mode === "deep_dive" ? 1 : 0);
    const dm = modeRank(b) - modeRank(a);
    if (dm !== 0) return dm;
    const dc = b.citations.length - a.citations.length;
    if (dc !== 0) return dc;
    const dl = b.bodyMarkdown.length - a.bodyMarkdown.length;
    if (dl !== 0) return dl;
    return b.publishedAt.getTime() - a.publishedAt.getTime();
  });
  return ranked[0] ?? null;
}

/**
 * Posts created in the last 24h that haven't been sent yet. The 24h window
 * matches our daily cadence — a missed day picks up the freshest unsent post,
 * not yesterday's leftover.
 */
export async function loadCandidates(): Promise<Post[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return db
    .select()
    .from(postsTable)
    .where(and(gte(postsTable.publishedAt, since), isNull(postsTable.sentToSubstackAt)))
    .orderBy(desc(postsTable.publishedAt));
}

async function alreadySentToday(): Promise<boolean> {
  const rows = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count
    FROM posts
    WHERE sent_to_substack_at IS NOT NULL
      AND sent_to_substack_at::date = (NOW() AT TIME ZONE 'UTC')::date
  `);
  const first = rows.rows[0];
  return first ? Number(first.count) > 0 : false;
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Render the email body for a single recipient. Includes the personalized
 * unsubscribe link in the footer.
 */
export function renderEmailHtml(
  post: Post,
  unsubscribeUrl: string,
  archiveUrl: string,
): string {
  const body = marked.parse(post.bodyMarkdown, { async: false }) as string;
  const citations = post.citations.length
    ? `<hr><h4>Sources</h4><ol>${post.citations
        .map((c) => `<li><a href="${escapeHtml(c)}">${escapeHtml(c)}</a></li>`)
        .join("")}</ol>`
    : "";
  const footer = `<hr><p style="color:#666;font-size:12px;line-height:1.5;">From the Deer Park writer agent. <a href="${escapeHtml(archiveUrl)}">Archive</a> &middot; <a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe</a></p>`;
  return `<h1>${escapeHtml(post.title)}</h1><p style="font-size:18px;color:#444;"><em>${escapeHtml(post.dek)}</em></p>${body}${citations}${footer}`;
}

function renderEmailText(post: Post, unsubscribeUrl: string): string {
  const sources = post.citations.length
    ? `\n\nSources:\n${post.citations.map((c) => `- ${c}`).join("\n")}`
    : "";
  return `${post.title}\n\n${post.dek}\n\n${post.bodyMarkdown}${sources}\n\n---\nUnsubscribe: ${unsubscribeUrl}`;
}

type SendResult = { recipient: string; ok: boolean; error?: string };

async function sendOne(
  post: Post,
  recipient: { email: string; unsubscribeToken: string },
  cfg: DigestConfig,
): Promise<SendResult> {
  const unsubscribeUrl = `${cfg.publicBaseUrl}/api/unsubscribe?token=${encodeURIComponent(recipient.unsubscribeToken)}`;
  const html = renderEmailHtml(post, unsubscribeUrl, cfg.archiveUrl);
  const text = renderEmailText(post, unsubscribeUrl);

  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: cfg.fromEmail,
      to: [recipient.email],
      subject: post.title,
      html,
      text,
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

async function markSent(postId: number): Promise<void> {
  await db.execute(sql`
    UPDATE posts SET sent_to_substack_at = NOW() WHERE id = ${postId}
  `);
}

/**
 * Run one digest send. Idempotent: at most one send per UTC day. Returns the
 * post sent and per-recipient results, or null if nothing was sent.
 */
export async function runDailyDigest(): Promise<
  | { post: Post; sent: number; failed: number; results: SendResult[] }
  | null
> {
  const cfg = readConfig();
  if ("error" in cfg) {
    logger.warn({ reason: cfg.error }, "Daily digest skipped — config incomplete");
    return null;
  }

  if (await alreadySentToday()) {
    logger.info("Daily digest skipped — already sent today");
    return null;
  }

  const candidates = await loadCandidates();
  if (candidates.length === 0) {
    logger.info("Daily digest skipped — no unsent posts in last 24h");
    return null;
  }

  const subscribers = await loadActiveSubscribers();
  if (subscribers.length === 0) {
    logger.warn("Daily digest skipped — no active subscribers");
    return null;
  }

  const best = pickBestPost(candidates);
  if (!best) return null;

  logger.info(
    {
      postId: best.id,
      title: best.title,
      mode: best.mode,
      candidates: candidates.length,
      subscribers: subscribers.length,
    },
    "Daily digest: sending best-of-day to subscribers",
  );

  // Per-recipient send. Sequential with a small gap to stay under Resend's
  // rate limit (2 req/s on the free tier). Small lists; fine for now.
  const results: SendResult[] = [];
  for (const sub of subscribers) {
    try {
      const r = await sendOne(best, sub, cfg);
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

  // Mark the post sent if AT LEAST ONE recipient got it. That preserves
  // idempotency (no duplicate sends tomorrow) without losing the send to
  // a single bad address.
  if (sent > 0) {
    await markSent(best.id);
  }

  logger.info({ postId: best.id, sent, failed }, "Daily digest: complete");
  return { post: best, sent, failed, results };
}

/**
 * Self-healing schema migration. Adds the `sent_to_substack_at` column to
 * posts and the `unsubscribe_token` / `unsubscribed_at` columns to subscribers
 * if they're missing, and backfills tokens for legacy subscriber rows.
 * Idempotent; safe to run on every boot.
 */
export async function ensureSchema(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS sent_to_substack_at TIMESTAMPTZ
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS posts_sent_to_substack_at_idx
    ON posts (sent_to_substack_at)
  `);
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

    const now = new Date();
    const targetMin = cfg.hourUtc * 60 + cfg.minuteUtc;
    const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
    if (nowMin < targetMin) return; // too early; wait for the configured hour

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
