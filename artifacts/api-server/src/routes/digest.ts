import { Router, type IRouter } from "express";
import { db, postsTable } from "@workspace/db";
import { desc, isNotNull, sql } from "drizzle-orm";
import { digestConfigStatus, loadCandidates, pickBestPost } from "../lib/daily-digest";

const router: IRouter = Router();

/**
 * Public diagnostics for the daily digest. Exposes only non-sensitive state:
 * config booleans (whether secrets are set, not their values), schema check,
 * candidate previews (post titles are already public via /api/posts), and the
 * last-sent record. Intended for debugging — not for automation.
 */
router.get("/digest/status", async (req, res) => {
  const config = digestConfigStatus();

  let schemaOk = false;
  let schemaError: string | null = null;
  try {
    await db.execute(sql`SELECT sent_to_substack_at FROM posts LIMIT 1`);
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
