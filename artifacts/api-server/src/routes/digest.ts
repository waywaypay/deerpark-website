import { Router, type IRouter } from "express";
import { db, subscribersTable } from "@workspace/db";
import { isNull, sql } from "drizzle-orm";
import { getDailyDigestState } from "../lib/daily-digest";
import { loadTopHeadlinesForEmail } from "../lib/top10-email";

const router: IRouter = Router();

/**
 * Public diagnostics for the daily top-10 dispatch email. Exposes only
 * non-sensitive state: config booleans, schema check, top-10 candidate
 * count + preview titles (already public), subscriber counts (no
 * addresses), and the last-sent PT date.
 */
router.get("/digest/status", async (req, res) => {
  let schemaOk = false;
  let schemaError: string | null = null;
  try {
    await db.execute(sql`SELECT unsubscribe_token, unsubscribed_at FROM subscribers LIMIT 1`);
    schemaOk = true;
  } catch (err) {
    schemaError = err instanceof Error ? err.message : String(err);
  }

  let state: Awaited<ReturnType<typeof getDailyDigestState>> | null = null;
  let stateError: string | null = null;
  try {
    state = await getDailyDigestState();
  } catch (err) {
    stateError = err instanceof Error ? err.message : String(err);
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

  let topPreview: Array<{ id: number; source: string; title: string }> = [];
  let topError: string | null = null;
  try {
    const headlines = await loadTopHeadlinesForEmail();
    topPreview = headlines.slice(0, 5).map((h) => ({
      id: h.id,
      source: h.source,
      title: h.title,
    }));
  } catch (err) {
    topError = err instanceof Error ? err.message : String(err);
  }

  return res.json({
    config: state?.config ?? null,
    stateError,
    schema: { ok: schemaOk, error: schemaError },
    subscribers: { ...subscribers, error: subscriberError },
    top: {
      count: state?.topCandidateCount ?? topPreview.length,
      error: topError,
      preview: topPreview,
    },
    lastSentPtDate: state?.lastSentPtDate ?? null,
    todayPtDate: state?.todayPtDate ?? null,
    alreadySentToday: state?.alreadySentToday ?? false,
    nowUtc: new Date().toISOString(),
  });
});

export default router;
