// Dispatch newsletter archive — records each composed dispatch (real send or
// admin test send) so the operator can review past sends and attach freeform
// feedback against each. Builds a training dataset for iterating on the
// dispatch prompt.
//
// The composed email is captured AS SENT (subject, intro, full body HTML, plus
// a structured snapshot of the top-10 headlines + commentary). Feedback is a
// separate column that the operator fills in later via the admin UI.

import { db, dispatchArchiveTable } from "@workspace/db";
import type { DispatchArchive, DispatchArchiveItem } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import type { ComposedEmail } from "./top10-email";
import { evaluateDispatchInBackground } from "./dispatch-eval";

/**
 * Idempotent self-heal. Mirrors the lib/db/migrations/0003 migration so the
 * table exists even if the data-migration runner hasn't picked it up yet.
 */
export async function ensureDispatchArchiveSchema(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS dispatch_archive (
      id SERIAL PRIMARY KEY,
      kind TEXT NOT NULL,
      subject TEXT NOT NULL,
      intro_html TEXT NOT NULL,
      body_html TEXT NOT NULL,
      headlines_snapshot JSONB NOT NULL,
      recipient_count INTEGER,
      polish_applied BOOLEAN NOT NULL DEFAULT FALSE,
      banner_generated BOOLEAN NOT NULL DEFAULT FALSE,
      feedback TEXT,
      feedback_updated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS dispatch_archive_created_at_idx
      ON dispatch_archive (created_at)
  `);
}

export type DispatchArchiveKind = "send" | "test" | "preview";

type ArchiveParams = {
  kind: DispatchArchiveKind;
  composed: ComposedEmail;
  /** Defaults to composed.html — pass an override when the persisted HTML
   *  should differ from the per-recipient HTML actually sent (e.g. preview
   *  with inlined banner data URL instead of cid:reference). */
  bodyHtml?: string;
  /** Null for test sends. For real sends, the count of actual recipients
   *  the dispatch was delivered to. */
  recipientCount?: number | null;
};

export async function archiveDispatch(params: ArchiveParams): Promise<void> {
  const { kind, composed, bodyHtml, recipientCount } = params;

  const snapshot: DispatchArchiveItem[] = composed.headlines.map((h) => ({
    id: h.id,
    source: h.source,
    title: h.title,
    url: h.url,
    commentary: h.commentary ?? null,
    publishedAt: h.publishedAt instanceof Date
      ? h.publishedAt.toISOString()
      : new Date(h.publishedAt).toISOString(),
  }));

  try {
    const [row] = await db
      .insert(dispatchArchiveTable)
      .values({
        kind,
        subject: composed.subject,
        introHtml: composed.introHtml,
        bodyHtml: bodyHtml ?? composed.html,
        headlinesSnapshot: snapshot,
        recipientCount: recipientCount ?? null,
        polishApplied: composed.polishApplied,
        bannerGenerated: composed.bannerGenerated,
        promptVersions:
          composed.promptVersions && Object.keys(composed.promptVersions).length > 0
            ? composed.promptVersions
            : null,
      })
      .returning({ id: dispatchArchiveTable.id });
    if (row) {
      // Kick off the regex sweep + LLM rubric in the background. Eval
      // failures never block the send / test flow.
      evaluateDispatchInBackground(row.id);
    }
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), kind },
      "Dispatch archive: insert failed",
    );
  }
}

export type DispatchArchiveSummary = Omit<DispatchArchive, "bodyHtml" | "headlinesSnapshot"> & {
  itemCount: number;
};

export async function listDispatchArchive(limit = 50): Promise<DispatchArchiveSummary[]> {
  const rows = await db
    .select({
      id: dispatchArchiveTable.id,
      kind: dispatchArchiveTable.kind,
      subject: dispatchArchiveTable.subject,
      introHtml: dispatchArchiveTable.introHtml,
      recipientCount: dispatchArchiveTable.recipientCount,
      polishApplied: dispatchArchiveTable.polishApplied,
      bannerGenerated: dispatchArchiveTable.bannerGenerated,
      feedback: dispatchArchiveTable.feedback,
      feedbackUpdatedAt: dispatchArchiveTable.feedbackUpdatedAt,
      evalScores: dispatchArchiveTable.evalScores,
      evalCompositeScore: dispatchArchiveTable.evalCompositeScore,
      evalBannedPhrasesCount: dispatchArchiveTable.evalBannedPhrasesCount,
      evalBannedPhrases: dispatchArchiveTable.evalBannedPhrases,
      evalModel: dispatchArchiveTable.evalModel,
      evalRunAt: dispatchArchiveTable.evalRunAt,
      promptVersions: dispatchArchiveTable.promptVersions,
      createdAt: dispatchArchiveTable.createdAt,
      itemCount: sql<number>`coalesce(jsonb_array_length(${dispatchArchiveTable.headlinesSnapshot}), 0)::int`,
    })
    .from(dispatchArchiveTable)
    .orderBy(desc(dispatchArchiveTable.createdAt))
    .limit(limit);
  return rows;
}

export async function getDispatchArchive(id: number): Promise<DispatchArchive | null> {
  const [row] = await db
    .select()
    .from(dispatchArchiveTable)
    .where(eq(dispatchArchiveTable.id, id))
    .limit(1);
  return row ?? null;
}

export async function updateDispatchFeedback(
  id: number,
  feedback: string,
): Promise<DispatchArchive | null> {
  const trimmed = feedback.trim();
  const [row] = await db
    .update(dispatchArchiveTable)
    .set({
      feedback: trimmed.length === 0 ? null : trimmed,
      feedbackUpdatedAt: new Date(),
    })
    .where(eq(dispatchArchiveTable.id, id))
    .returning();
  return row ?? null;
}
