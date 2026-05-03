import { Router, type IRouter } from "express";
import { db, postsTable, subscribersTable } from "@workspace/db";
import { desc, isNotNull, isNull, sql } from "drizzle-orm";
import { digestConfigStatus, loadCandidates, pickBestPost } from "../lib/daily-digest";

const router: IRouter = Router();

/**
 * Public diagnostics for the daily digest. Exposes only non-sensitive state:
 * config booleans, schema check, candidate previews (post titles are already
 * public), subscriber counts (no addresses), and the last-sent record.
 */
router.get("/digest/status", async (req, res) => {
  const config = digestConfigStatus();

  let schemaOk = false;
  let schemaError: string | null = null;
  try {
    await db.execute(sql`SELECT sent_to_substack_at FROM posts LIMIT 1`);
    await db.execute(sql`SELECT unsubscribe_token, unsubscribed_at FROM subscribers LIMIT 1`);
    schemaOk = true;
  } catch (err) {
    schemaError = err instanceof Error ? err.message : String(err);
  }

  let candidates: Awaited<ReturnType<typeof loadCandidates>> = [];
  let candidateError: string | null = null;
  try {
    candidates = await loadCandidates();
  } catch (err) {
    candidateError = err instanceof Error ? err.message : String(err);
  }

  let subscribers: { active: number; unsubscribed: number; total: number } = {
    active: 0,
    unsubscribed: 0,
    total: 0,
  };
  let subscriberError: string | null = null;
  try {
    const totalRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(subscribersTable);
    const activeRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(subscribersTable)
      .where(isNull(subscribersTable.unsubscribedAt));
    const total = totalRows[0]?.count ?? 0;
    const active = activeRows[0]?.count ?? 0;
    subscribers = { active, unsubscribed: total - active, total };
  } catch (err) {
    subscriberError = err instanceof Error ? err.message : String(err);
  }

  let lastSent: { id: number; title: string; sentToSubstackAt: Date | null } | null = null;
  try {
    const rows = await db
      .select({
        id: postsTable.id,
        title: postsTable.title,
        sentToSubstackAt: postsTable.sentToSubstackAt,
      })
      .from(postsTable)
      .where(isNotNull(postsTable.sentToSubstackAt))
      .orderBy(desc(postsTable.sentToSubstackAt))
      .limit(1);
    lastSent = rows[0] ?? null;
  } catch (err) {
    req.log.warn({ err }, "Failed to load lastSent");
  }

  const best = candidates.length ? pickBestPost(candidates) : null;

  return res.json({
    config,
    schema: { ok: schemaOk, error: schemaError },
    subscribers: { ...subscribers, error: subscriberError },
    candidates: {
      count: candidates.length,
      error: candidateError,
      preview: candidates.slice(0, 5).map((c) => ({
        id: c.id,
        mode: c.mode,
        publishedAt: c.publishedAt,
        title: c.title,
        citationsCount: c.citations.length,
        bodyLength: c.bodyMarkdown.length,
      })),
    },
    bestCandidate: best
      ? { id: best.id, mode: best.mode, title: best.title, publishedAt: best.publishedAt }
      : null,
    lastSent,
    nowUtc: new Date().toISOString(),
  });
});

export default router;
