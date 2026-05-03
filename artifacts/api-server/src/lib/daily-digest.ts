import { db, postsTable, type Post } from "@workspace/db";
import { and, desc, gte, isNull, sql } from "drizzle-orm";
import { marked } from "marked";
import { logger } from "./logger";

const RESEND_API = "https://api.resend.com/emails";

type DigestConfig = {
  postingEmail: string;
  fromEmail: string;
  resendApiKey: string;
  hourUtc: number;
  minuteUtc: number;
  /** Optional: Substack URL to link the public archive in the email footer. */
  substackUrl?: string;
};

/**
 * Trim whitespace and strip outer quotes from a config value. Common failure
 * mode: env values pasted with surrounding `"..."` (which `fly secrets set
 * X='...'` typically handles, but `X=...` from a stray paste includes them
 * literally).
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
 * Diagnostic fingerprint of an email-shaped secret. Exposes enough to debug
 * format issues (length, whitespace, quote presence, the @domain part) without
 * leaking the full value. The local part is collapsed to its first 3 chars.
 */
function emailFingerprint(raw: string | undefined): {
  set: boolean;
  length: number;
  trimmedLength: number;
  hasOuterQuotes: boolean;
  hasInnerWhitespace: boolean;
  hasAt: boolean;
  hasAngleBrackets: boolean;
  preview: string | null;
} {
  if (!raw) {
    return {
      set: false,
      length: 0,
      trimmedLength: 0,
      hasOuterQuotes: false,
      hasInnerWhitespace: false,
      hasAt: false,
      hasAngleBrackets: false,
      preview: null,
    };
  }
  const trimmed = raw.trim();
  const cleaned = sanitizeEnv(raw) ?? "";
  const at = cleaned.indexOf("@");
  let preview: string | null = null;
  if (at > 0) {
    const local = cleaned.slice(0, at);
    const domain = cleaned.slice(at);
    preview = `${local.slice(0, 3)}…(${local.length})${domain}`;
  } else {
    preview = `${cleaned.slice(0, 3)}…(${cleaned.length})`;
  }
  return {
    set: true,
    length: raw.length,
    trimmedLength: trimmed.length,
    hasOuterQuotes:
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")),
    hasInnerWhitespace: /\s/.test(cleaned),
    hasAt: cleaned.includes("@"),
    hasAngleBrackets: cleaned.includes("<") || cleaned.includes(">"),
    preview,
  };
}

/** Public-safe view of config state — booleans + format fingerprints. */
export function digestConfigStatus(): {
  hasSubstackEmail: boolean;
  hasFromEmail: boolean;
  hasResendKey: boolean;
  hourUtc: number;
  minuteUtc: number;
  ready: boolean;
  postingEmail: ReturnType<typeof emailFingerprint>;
  fromEmail: ReturnType<typeof emailFingerprint>;
} {
  const postingEmail = emailFingerprint(process.env["SUBSTACK_POSTING_EMAIL"]);
  const fromEmail = emailFingerprint(process.env["DAILY_DIGEST_FROM_EMAIL"]);
  return {
    hasSubstackEmail: postingEmail.set,
    hasFromEmail: fromEmail.set,
    hasResendKey: Boolean(process.env["RESEND_API_KEY"]),
    hourUtc: Number(process.env["DAILY_DIGEST_HOUR_UTC"] ?? "13"),
    minuteUtc: Number(process.env["DAILY_DIGEST_MINUTE_UTC"] ?? "0"),
    ready: postingEmail.set && fromEmail.set && Boolean(process.env["RESEND_API_KEY"]),
    postingEmail,
    fromEmail,
  };
}

function readConfig(): DigestConfig | { error: string } {
  const postingEmail = sanitizeEnv(process.env["SUBSTACK_POSTING_EMAIL"]);
  const fromEmail = sanitizeEnv(process.env["DAILY_DIGEST_FROM_EMAIL"]);
  const resendApiKey = sanitizeEnv(process.env["RESEND_API_KEY"]);
  if (!postingEmail) return { error: "SUBSTACK_POSTING_EMAIL not set" };
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
    postingEmail,
    fromEmail,
    resendApiKey,
    hourUtc,
    minuteUtc,
    substackUrl: process.env["SUBSTACK_URL"] ?? "https://deerparkai.substack.com",
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
 * Posts created in the last 24h that have not yet been sent to Substack.
 * The 24h window matches our daily cadence — if we miss a day, the next
 * tick still picks the freshest unsent post rather than retroactively
 * shipping yesterday's leftovers.
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderEmailHtml(post: Post, substackUrl?: string): string {
  const body = marked.parse(post.bodyMarkdown, { async: false }) as string;
  const citations = post.citations.length
    ? `<hr><h4>Sources</h4><ol>${post.citations
        .map((c) => `<li>${escapeHtml(c)}</li>`)
        .join("")}</ol>`
    : "";
  const footer = substackUrl
    ? `<hr><p style="color:#666;font-size:12px;">Drafted automatically by the Deer Park writer agent. Archive: <a href="${escapeHtml(substackUrl)}">${escapeHtml(substackUrl)}</a></p>`
    : "";
  return `<h1>${escapeHtml(post.title)}</h1><p><em>${escapeHtml(post.dek)}</em></p>${body}${citations}${footer}`;
}

async function sendEmail(post: Post, cfg: DigestConfig): Promise<void> {
  const html = renderEmailHtml(post, cfg.substackUrl);
  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: cfg.fromEmail,
      to: [cfg.postingEmail],
      subject: post.title,
      html,
      text: `${post.title}\n\n${post.dek}\n\n${post.bodyMarkdown}`,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend failed (${res.status}): ${body}`);
  }
}

async function markSent(postId: number): Promise<void> {
  await db.execute(sql`
    UPDATE posts SET sent_to_substack_at = NOW() WHERE id = ${postId}
  `);
}

/**
 * Run one digest send. Idempotent: if a send has already happened today (UTC),
 * does nothing. Returns the post that was sent, or null if nothing was sent.
 */
export async function runDailyDigest(): Promise<Post | null> {
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

  const best = pickBestPost(candidates);
  if (!best) return null;

  logger.info(
    {
      postId: best.id,
      title: best.title,
      mode: best.mode,
      candidates: candidates.length,
    },
    "Daily digest: sending best-of-day to Substack",
  );

  await sendEmail(best, cfg);
  await markSent(best.id);

  logger.info({ postId: best.id }, "Daily digest: sent");
  return best;
}

/**
 * Self-healing schema migration. The digest column was added in the same PR
 * that introduced this scheduler, but pushing the schema separately via
 * `drizzle-kit push` is fragile (depends on a clean local checkout + the
 * developer not skipping the prompt). This guarantees the column exists by
 * the time the first tick runs. Idempotent: ALTER ... IF NOT EXISTS is a
 * no-op on subsequent boots.
 */
export async function ensureSchema(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS sent_to_substack_at TIMESTAMPTZ
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS posts_sent_to_substack_at_idx
    ON posts (sent_to_substack_at)
  `);
}

let digestHandle: NodeJS.Timeout | null = null;

/**
 * Tick every 5 minutes. On each tick, if the current UTC time has crossed
 * the configured send time, run the digest. The actual send is idempotent
 * (checks `alreadySentToday`), so the 5-minute granularity is a recovery
 * window — if the server restarts or a tick misses, the next tick within
 * the window still ships.
 */
export function startDailyDigestScheduler(intervalMs = 5 * 60 * 1000): void {
  if (digestHandle) return;

  // Run the idempotent migration once at scheduler start. Awaiting at
  // module-init level isn't possible in our boot sequence, so we kick this
  // off and let the first tick (60s later) wait on it implicitly via the
  // alreadySentToday query — by then the column exists.
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
    // No upper bound: if the machine was down at the target time, we still
    // want to ship today's digest as soon as it's back. `alreadySentToday`
    // is the actual double-send guard.

    try {
      await runDailyDigest();
    } catch (err) {
      logger.error({ err }, "Daily digest tick threw");
    }
  };

  // First tick after 60s (let server settle), then every interval.
  setTimeout(() => void tick(), 60_000);
  digestHandle = setInterval(() => void tick(), intervalMs);
}
