// Prompt version registry for dispatch composition. Hashes each active
// prompt at compose time, upserts into dispatch_prompts the first time
// we see a given hash, returns the hash so archiveDispatch can record
// it on the dispatch_archive row.
//
// Content-addressed: identical prompts across deploys collapse to one
// version. Hash is sha256, truncated to 16 hex chars — long enough to
// dedupe across many versions, short enough to render as a label.

import { createHash } from "node:crypto";
import {
  db,
  dispatchPromptsTable,
  type DispatchPrompt,
  type DispatchPromptVersionMap,
} from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { logger } from "./logger";

export type DispatchPromptSlot = keyof DispatchPromptVersionMap;

export function hashPrompt(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/**
 * Upsert one prompt by content. Returns the hash. The first time we see
 * a given (hash) the row is inserted; subsequent calls are no-ops.
 * Safe to call on every compose for every slot.
 */
export async function recordPromptVersion(
  slot: DispatchPromptSlot,
  content: string,
): Promise<string> {
  const hash = hashPrompt(content);
  try {
    await db
      .insert(dispatchPromptsTable)
      .values({
        hash,
        slot,
        content,
        contentLength: Buffer.byteLength(content, "utf8"),
      })
      .onConflictDoNothing({ target: dispatchPromptsTable.hash });
  } catch (err) {
    // Don't let registry hiccups break a compose. Archive insert will
    // still happen and the hash is computable client-side later.
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), slot, hash },
      "Dispatch prompts: upsert failed",
    );
  }
  return hash;
}

/**
 * Convenience wrapper — hashes + upserts every slot in one call. Pass
 * the active prompts at compose time. Slots whose content is null/empty
 * are omitted from the returned map (e.g. fallback wasn't invoked).
 */
export async function recordActivePromptVersions(
  prompts: Partial<Record<DispatchPromptSlot, string | null | undefined>>,
): Promise<DispatchPromptVersionMap> {
  const result: DispatchPromptVersionMap = {};
  await Promise.all(
    (Object.entries(prompts) as Array<[DispatchPromptSlot, string | null | undefined]>).map(
      async ([slot, content]) => {
        if (!content) return;
        const hash = await recordPromptVersion(slot, content);
        result[slot] = hash;
      },
    ),
  );
  return result;
}

export type DispatchPromptSummary = Omit<DispatchPrompt, "content"> & {
  usageCount: number;
};

/**
 * List observed prompt versions, newest first. Optionally filter by slot.
 * Includes a usage count (how many archived dispatches reference this
 * hash) so the UI can show "v8 — used by 14 dispatches".
 */
export async function listDispatchPrompts(
  filter: { slot?: DispatchPromptSlot } = {},
): Promise<DispatchPromptSummary[]> {
  const rows = await db
    .select({
      hash: dispatchPromptsTable.hash,
      slot: dispatchPromptsTable.slot,
      contentLength: dispatchPromptsTable.contentLength,
      note: dispatchPromptsTable.note,
      firstSeenAt: dispatchPromptsTable.firstSeenAt,
      // Count archive rows whose prompt_versions jsonb contains this
      // hash at any slot position. The `@>` operator is the natural
      // jsonb contains, but the value-by-key check is cheaper.
      usageCount: sql<number>`
        coalesce(
          (
            SELECT count(*)::int FROM dispatch_archive
            WHERE prompt_versions IS NOT NULL
              AND prompt_versions::jsonb ? ${dispatchPromptsTable.slot}
              AND prompt_versions ->> ${dispatchPromptsTable.slot} = ${dispatchPromptsTable.hash}
          ),
          0
        )
      `,
    })
    .from(dispatchPromptsTable)
    .where(filter.slot ? eq(dispatchPromptsTable.slot, filter.slot) : sql`true`)
    .orderBy(desc(dispatchPromptsTable.firstSeenAt));
  return rows;
}

export async function getDispatchPrompt(hash: string): Promise<DispatchPrompt | null> {
  const [row] = await db
    .select()
    .from(dispatchPromptsTable)
    .where(eq(dispatchPromptsTable.hash, hash))
    .limit(1);
  return row ?? null;
}

/**
 * Self-heal — mirrors lib/db/migrations/0005. Safe to call on boot.
 */
export async function ensureDispatchPromptsSchema(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS dispatch_prompts (
      hash TEXT PRIMARY KEY,
      slot TEXT NOT NULL,
      content TEXT NOT NULL,
      content_length INTEGER NOT NULL,
      note TEXT,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS dispatch_prompts_slot_idx
      ON dispatch_prompts (slot, first_seen_at)
  `);
  await db.execute(sql`
    ALTER TABLE dispatch_archive
      ADD COLUMN IF NOT EXISTS prompt_versions JSONB
  `);
}
