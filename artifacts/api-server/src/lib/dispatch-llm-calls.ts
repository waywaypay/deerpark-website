// Per-call LLM trace for dispatch composes. The trace is buffered in
// memory during composeDailyEmail (the calls happen before the archive
// row exists, so we can't FK them yet), then flushed in one batch after
// archiveDispatch inserts the row.
//
// What this unlocks: paired (input, output) tuples filtered by
// eval scores on dispatch_archive — that's the SFT-extractable form
// the dataset was missing.

import {
  db,
  dispatchLlmCallsTable,
  type DispatchLlmCall,
} from "@workspace/db";
import { asc, eq, sql } from "drizzle-orm";
import { logger } from "./logger";

export type DispatchLlmCallKind = "polish" | "fallback" | "commentator";
export type DispatchLlmCallStatus =
  | "ok"
  | "request_failed"
  | "parse_failed"
  | "missing_subject_or_intro";

/** In-flight call record collected during compose. archive_id is filled
 *  in at flush time once the dispatch_archive row exists. */
export type DispatchLlmCallTrace = {
  kind: DispatchLlmCallKind;
  promptHash: string;
  userMessage: string;
  responseText: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
  status: DispatchLlmCallStatus;
  errorMessage?: string;
};

export async function recordDispatchLlmCalls(
  dispatchArchiveId: number,
  traces: DispatchLlmCallTrace[],
): Promise<void> {
  if (traces.length === 0) return;
  try {
    await db.insert(dispatchLlmCallsTable).values(
      traces.map((t) => ({
        dispatchArchiveId,
        kind: t.kind,
        promptHash: t.promptHash,
        userMessage: t.userMessage,
        responseText: t.responseText,
        model: t.model,
        promptTokens: t.promptTokens ?? null,
        completionTokens: t.completionTokens ?? null,
        totalTokens: t.totalTokens ?? null,
        latencyMs: t.latencyMs ?? null,
        status: t.status,
        errorMessage: t.errorMessage ?? null,
      })),
    );
  } catch (err) {
    logger.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        dispatchArchiveId,
        count: traces.length,
      },
      "Dispatch LLM calls: insert failed",
    );
  }
}

export async function listDispatchLlmCalls(
  dispatchArchiveId: number,
): Promise<DispatchLlmCall[]> {
  return db
    .select()
    .from(dispatchLlmCallsTable)
    .where(eq(dispatchLlmCallsTable.dispatchArchiveId, dispatchArchiveId))
    .orderBy(asc(dispatchLlmCallsTable.createdAt));
}

/** Mirrors lib/db/migrations/0006. Safe to call on every boot. */
export async function ensureDispatchLlmCallsSchema(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS dispatch_llm_calls (
      id SERIAL PRIMARY KEY,
      dispatch_archive_id INTEGER,
      kind TEXT NOT NULL,
      prompt_hash TEXT NOT NULL,
      user_message TEXT NOT NULL,
      response_text TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      total_tokens INTEGER,
      latency_ms INTEGER,
      status TEXT NOT NULL,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS dispatch_llm_calls_archive_id_idx
      ON dispatch_llm_calls (dispatch_archive_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS dispatch_llm_calls_created_at_idx
      ON dispatch_llm_calls (created_at)
  `);
}
