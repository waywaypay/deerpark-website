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
import {
  dispatchLlmCallsTable,
  dispatchPromptsTable,
} from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import type { ComposedEmail } from "./top10-email";
import { evaluateDispatchInBackground } from "./dispatch-eval";
import { recordDispatchLlmCalls } from "./dispatch-llm-calls";

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
      // Flush the in-memory LLM call traces buffered during compose now
      // that we have an archive_id to FK them against. Done before the
      // eval kicks off so the eval can see them if it ever wants to.
      // Failures log but never break the archive.
      if (composed.llmCalls && composed.llmCalls.length > 0) {
        await recordDispatchLlmCalls(row.id, composed.llmCalls);
      }
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

// Aggregations for the eval section ----------------------------------------
//
// All computed in SQL against the full archive so the admin UI can show
// fleet-wide stats (not just the most recent 100/200 rows) without pulling
// the full table into JS. The shape is consumed by the admin "Eval &
// feedback" tab — it's the dashboard a model-tuner uses to pick which
// dispatches/prompts to mine for fine-tuning examples:
//
//   - dimensions: which rubric axes the model is weakest on (target with
//     more training examples)
//   - byPromptVersion: which polish/commentator/etc prompt hashes correlate
//     with the best composite (the prompt to clone toward in fine-tune data)
//   - topBannedPhrases: the most-leaked phrases across the whole archive
//     (negative examples to mine)
//   - feedbackCoverage: number of dispatches with operator feedback (= the
//     supervised training set size)
//   - trend: composite score by createdAt across the FULL archive

const RUBRIC_DIMS = [
  "introSpecificity",
  "lensDiversity",
  "cadenceVariety",
  "sourceTiering",
  "concreteness",
] as const;

export type DispatchEvalDimensionKey = (typeof RUBRIC_DIMS)[number];

export type DispatchEvalDimensionStats = {
  mean: number | null;
  min: number | null;
  max: number | null;
  n: number;
};

export type DispatchEvalPromptVersionAgg = {
  hash: string;
  n: number;
  compositeMean: number | null;
  bannedMean: number | null;
};

export type DispatchEvalBannedPhraseAgg = {
  phrase: string;
  severity: "violation" | "warning";
  totalCount: number;
  dispatchCount: number;
};

export type DispatchEvalAggregates = {
  totals: {
    archived: number;
    evaluated: number;
    withFeedback: number;
  };
  composite: DispatchEvalDimensionStats;
  bannedPerDispatch: DispatchEvalDimensionStats;
  dimensions: Record<DispatchEvalDimensionKey, DispatchEvalDimensionStats>;
  byPromptVersion: {
    polish: DispatchEvalPromptVersionAgg[];
    fallback: DispatchEvalPromptVersionAgg[];
    commentator: DispatchEvalPromptVersionAgg[];
    banner: DispatchEvalPromptVersionAgg[];
  };
  topBannedPhrases: DispatchEvalBannedPhraseAgg[];
  trend: Array<{
    id: number;
    createdAt: string;
    composite: number | null;
    banned: number | null;
  }>;
};

type DimRow = {
  mean: string | null;
  min: string | null;
  max: string | null;
  n: string | null;
};

const numOrNull = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const roundTo = (v: number | null, places: number): number | null => {
  if (v === null) return null;
  const m = 10 ** places;
  return Math.round(v * m) / m;
};

const toDimStats = (r: DimRow | undefined): DispatchEvalDimensionStats => ({
  mean: roundTo(numOrNull(r?.mean ?? null), 2),
  min: roundTo(numOrNull(r?.min ?? null), 2),
  max: roundTo(numOrNull(r?.max ?? null), 2),
  n: Number(r?.n ?? 0) || 0,
});

export async function getDispatchEvalAggregates(): Promise<DispatchEvalAggregates> {
  // Totals + composite + banned-per-dispatch + per-dimension means in ONE
  // query. Postgres can pull all of these from a single sequential scan
  // (or, more usefully, off the cached page set for a small archive).
  const overallRows = await db.execute<{
    archived: string;
    evaluated: string;
    with_feedback: string;
    composite_mean: string | null;
    composite_min: string | null;
    composite_max: string | null;
    banned_mean: string | null;
    banned_min: string | null;
    banned_max: string | null;
    intro_mean: string | null;
    intro_min: string | null;
    intro_max: string | null;
    lens_mean: string | null;
    lens_min: string | null;
    lens_max: string | null;
    cadence_mean: string | null;
    cadence_min: string | null;
    cadence_max: string | null;
    source_mean: string | null;
    source_min: string | null;
    source_max: string | null;
    concrete_mean: string | null;
    concrete_min: string | null;
    concrete_max: string | null;
  }>(sql`
    SELECT
      count(*)::text AS archived,
      count(*) FILTER (WHERE eval_run_at IS NOT NULL)::text AS evaluated,
      count(*) FILTER (WHERE feedback IS NOT NULL AND length(feedback) > 0)::text AS with_feedback,
      avg(eval_composite_score)::text AS composite_mean,
      min(eval_composite_score)::text AS composite_min,
      max(eval_composite_score)::text AS composite_max,
      avg(eval_banned_phrases_count)::text AS banned_mean,
      min(eval_banned_phrases_count)::text AS banned_min,
      max(eval_banned_phrases_count)::text AS banned_max,
      avg((eval_scores->'introSpecificity'->>'score')::numeric)::text AS intro_mean,
      min((eval_scores->'introSpecificity'->>'score')::numeric)::text AS intro_min,
      max((eval_scores->'introSpecificity'->>'score')::numeric)::text AS intro_max,
      avg((eval_scores->'lensDiversity'->>'score')::numeric)::text AS lens_mean,
      min((eval_scores->'lensDiversity'->>'score')::numeric)::text AS lens_min,
      max((eval_scores->'lensDiversity'->>'score')::numeric)::text AS lens_max,
      avg((eval_scores->'cadenceVariety'->>'score')::numeric)::text AS cadence_mean,
      min((eval_scores->'cadenceVariety'->>'score')::numeric)::text AS cadence_min,
      max((eval_scores->'cadenceVariety'->>'score')::numeric)::text AS cadence_max,
      avg((eval_scores->'sourceTiering'->>'score')::numeric)::text AS source_mean,
      min((eval_scores->'sourceTiering'->>'score')::numeric)::text AS source_min,
      max((eval_scores->'sourceTiering'->>'score')::numeric)::text AS source_max,
      avg((eval_scores->'concreteness'->>'score')::numeric)::text AS concrete_mean,
      min((eval_scores->'concreteness'->>'score')::numeric)::text AS concrete_min,
      max((eval_scores->'concreteness'->>'score')::numeric)::text AS concrete_max
    FROM dispatch_archive
  `);
  const o = overallRows.rows[0];

  const evaluatedN = Number(o?.evaluated ?? 0) || 0;

  const composite: DispatchEvalDimensionStats = {
    mean: roundTo(numOrNull(o?.composite_mean ?? null), 2),
    min: roundTo(numOrNull(o?.composite_min ?? null), 2),
    max: roundTo(numOrNull(o?.composite_max ?? null), 2),
    n: evaluatedN,
  };
  const bannedPerDispatch: DispatchEvalDimensionStats = {
    mean: roundTo(numOrNull(o?.banned_mean ?? null), 2),
    min: roundTo(numOrNull(o?.banned_min ?? null), 2),
    max: roundTo(numOrNull(o?.banned_max ?? null), 2),
    n: evaluatedN,
  };
  const dimensions: Record<DispatchEvalDimensionKey, DispatchEvalDimensionStats> = {
    introSpecificity: toDimStats({
      mean: o?.intro_mean ?? null,
      min: o?.intro_min ?? null,
      max: o?.intro_max ?? null,
      n: String(evaluatedN),
    }),
    lensDiversity: toDimStats({
      mean: o?.lens_mean ?? null,
      min: o?.lens_min ?? null,
      max: o?.lens_max ?? null,
      n: String(evaluatedN),
    }),
    cadenceVariety: toDimStats({
      mean: o?.cadence_mean ?? null,
      min: o?.cadence_min ?? null,
      max: o?.cadence_max ?? null,
      n: String(evaluatedN),
    }),
    sourceTiering: toDimStats({
      mean: o?.source_mean ?? null,
      min: o?.source_min ?? null,
      max: o?.source_max ?? null,
      n: String(evaluatedN),
    }),
    concreteness: toDimStats({
      mean: o?.concrete_mean ?? null,
      min: o?.concrete_min ?? null,
      max: o?.concrete_max ?? null,
      n: String(evaluatedN),
    }),
  };

  // Per-prompt-version aggregates. One query unioned across the four slots
  // so the route doesn't fire 4 round trips.
  const promptRows = await db.execute<{
    slot: "polish" | "fallback" | "commentator" | "banner";
    hash: string;
    n: string;
    composite_mean: string | null;
    banned_mean: string | null;
  }>(sql`
    WITH slots AS (
      SELECT 'polish'::text AS slot, prompt_versions->>'polish' AS hash,
             eval_composite_score, eval_banned_phrases_count
        FROM dispatch_archive WHERE prompt_versions ? 'polish'
      UNION ALL
      SELECT 'fallback', prompt_versions->>'fallback',
             eval_composite_score, eval_banned_phrases_count
        FROM dispatch_archive WHERE prompt_versions ? 'fallback'
      UNION ALL
      SELECT 'commentator', prompt_versions->>'commentator',
             eval_composite_score, eval_banned_phrases_count
        FROM dispatch_archive WHERE prompt_versions ? 'commentator'
      UNION ALL
      SELECT 'banner', prompt_versions->>'banner',
             eval_composite_score, eval_banned_phrases_count
        FROM dispatch_archive WHERE prompt_versions ? 'banner'
    )
    SELECT
      slot,
      hash,
      count(*)::text AS n,
      avg(eval_composite_score)::text AS composite_mean,
      avg(eval_banned_phrases_count)::text AS banned_mean
    FROM slots
    WHERE hash IS NOT NULL
    GROUP BY slot, hash
    ORDER BY slot ASC, composite_mean DESC NULLS LAST, n DESC
  `);

  const byPromptVersion: DispatchEvalAggregates["byPromptVersion"] = {
    polish: [],
    fallback: [],
    commentator: [],
    banner: [],
  };
  for (const r of promptRows.rows) {
    const agg: DispatchEvalPromptVersionAgg = {
      hash: r.hash,
      n: Number(r.n) || 0,
      compositeMean: roundTo(numOrNull(r.composite_mean), 2),
      bannedMean: roundTo(numOrNull(r.banned_mean), 2),
    };
    byPromptVersion[r.slot].push(agg);
  }

  // Top banned phrases — unnest the per-row jsonb hit list and group across
  // the archive. Limited to 25; severity preserved for the warning vs.
  // violation split the UI cares about.
  const phraseRows = await db.execute<{
    phrase: string;
    severity: string | null;
    total_count: string;
    dispatch_count: string;
  }>(sql`
    SELECT
      (hit->>'phrase')::text AS phrase,
      coalesce(hit->>'severity', 'violation') AS severity,
      sum((hit->>'count')::int)::text AS total_count,
      count(DISTINCT id)::text AS dispatch_count
    FROM dispatch_archive,
         jsonb_array_elements(coalesce(eval_banned_phrases, '[]'::jsonb)) AS hit
    GROUP BY phrase, severity
    ORDER BY total_count DESC
    LIMIT 25
  `);
  const topBannedPhrases: DispatchEvalBannedPhraseAgg[] = phraseRows.rows.map(
    (r) => ({
      phrase: r.phrase,
      severity: r.severity === "warning" ? "warning" : "violation",
      totalCount: Number(r.total_count) || 0,
      dispatchCount: Number(r.dispatch_count) || 0,
    }),
  );

  // Full-archive trend. Just the two scalar columns and an id; cheap to
  // pull even for thousands of rows. Ordered oldest → newest so the UI
  // can draw left-to-right without an extra reverse.
  const trendRows = await db
    .select({
      id: dispatchArchiveTable.id,
      createdAt: dispatchArchiveTable.createdAt,
      composite: dispatchArchiveTable.evalCompositeScore,
      banned: dispatchArchiveTable.evalBannedPhrasesCount,
    })
    .from(dispatchArchiveTable)
    .orderBy(dispatchArchiveTable.createdAt);
  const trend = trendRows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    composite: numOrNull(r.composite),
    banned: r.banned ?? null,
  }));

  return {
    totals: {
      archived: Number(o?.archived ?? 0) || 0,
      evaluated: evaluatedN,
      withFeedback: Number(o?.with_feedback ?? 0) || 0,
    },
    composite,
    bannedPerDispatch,
    dimensions,
    byPromptVersion,
    topBannedPhrases,
    trend,
  };
}

// Fine-tune dataset export -------------------------------------------------
//
// Joins captured LLM calls back to their (a) prompt text and (b) the eval
// scores + operator feedback on the parent dispatch. Each row becomes one
// supervised training example in the OpenAI/Anthropic chat-completion
// fine-tune JSONL shape:
//
//   {"messages": [
//     {"role": "system",    "content": <prompt text>},
//     {"role": "user",      "content": <user message>},
//     {"role": "assistant", "content": <model response>}
//   ]}
//
// The caller can attach `withMeta=true` to include a `metadata` block with
// eval scores + feedback so they can post-filter / weight examples in their
// fine-tune pipeline. OpenAI and Anthropic both ignore unknown top-level
// JSONL keys during validation.

export type FineTuneFilters = {
  /** Drop calls from dispatches with composite below this score. */
  minComposite?: number | null;
  /** Restrict to one call kind. */
  kind?: "polish" | "fallback" | "commentator" | null;
  /** Only include dispatches that have operator feedback recorded. */
  feedbackOnly?: boolean;
  /** Attach per-row eval metadata in a `metadata` field. */
  withMeta?: boolean;
};

export type FineTuneDatasetRow = {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  metadata?: {
    archiveId: number | null;
    callKind: string;
    promptHash: string;
    composite: number | null;
    bannedCount: number | null;
    dimensions: unknown;
    feedback: string | null;
    createdAt: string;
  };
};

export type FineTuneSkipReason =
  | "status"
  | "missingPrompt"
  | "emptyMessage"
  | "kindFilter"
  | "feedbackFilter"
  | "compositeFilter";

export async function buildFineTuneDataset(
  filters: FineTuneFilters,
): Promise<{
  rows: FineTuneDatasetRow[];
  total: number;
  skipped: number;
  skippedBy: Record<FineTuneSkipReason, number>;
}> {
  // Pull every successful LLM call joined with its prompt text and the
  // parent dispatch's eval row. Skipping rows without a resolvable prompt
  // (i.e. the prompt registry insert failed and we only have the hash) —
  // those can't form a complete (system, user, assistant) triple.
  const joined = await db
    .select({
      callId: dispatchLlmCallsTable.id,
      archiveId: dispatchLlmCallsTable.dispatchArchiveId,
      kind: dispatchLlmCallsTable.kind,
      promptHash: dispatchLlmCallsTable.promptHash,
      userMessage: dispatchLlmCallsTable.userMessage,
      responseText: dispatchLlmCallsTable.responseText,
      status: dispatchLlmCallsTable.status,
      callCreatedAt: dispatchLlmCallsTable.createdAt,
      promptContent: dispatchPromptsTable.content,
      composite: dispatchArchiveTable.evalCompositeScore,
      bannedCount: dispatchArchiveTable.evalBannedPhrasesCount,
      evalScores: dispatchArchiveTable.evalScores,
      feedback: dispatchArchiveTable.feedback,
    })
    .from(dispatchLlmCallsTable)
    .leftJoin(
      dispatchPromptsTable,
      eq(dispatchLlmCallsTable.promptHash, dispatchPromptsTable.hash),
    )
    .leftJoin(
      dispatchArchiveTable,
      eq(dispatchLlmCallsTable.dispatchArchiveId, dispatchArchiveTable.id),
    )
    .orderBy(dispatchLlmCallsTable.createdAt);

  const rows: FineTuneDatasetRow[] = [];
  const skippedBy: Record<FineTuneSkipReason, number> = {
    status: 0,
    missingPrompt: 0,
    emptyMessage: 0,
    kindFilter: 0,
    feedbackFilter: 0,
    compositeFilter: 0,
  };
  let skipped = 0;
  for (const r of joined) {
    if (r.status !== "ok") {
      skippedBy.status++;
      skipped++;
      continue;
    }
    if (!r.promptContent) {
      skippedBy.missingPrompt++;
      skipped++;
      continue;
    }
    if (r.userMessage.length === 0 || r.responseText.length === 0) {
      skippedBy.emptyMessage++;
      skipped++;
      continue;
    }
    if (filters.kind && r.kind !== filters.kind) {
      skippedBy.kindFilter++;
      skipped++;
      continue;
    }
    if (filters.feedbackOnly && (r.feedback === null || r.feedback.length === 0)) {
      skippedBy.feedbackFilter++;
      skipped++;
      continue;
    }
    const compositeNum =
      r.composite === null
        ? null
        : Number.isFinite(Number(r.composite))
          ? Number(r.composite)
          : null;
    if (
      filters.minComposite !== undefined &&
      filters.minComposite !== null &&
      (compositeNum === null || compositeNum < filters.minComposite)
    ) {
      skippedBy.compositeFilter++;
      skipped++;
      continue;
    }
    const row: FineTuneDatasetRow = {
      messages: [
        { role: "system", content: r.promptContent },
        { role: "user", content: r.userMessage },
        { role: "assistant", content: r.responseText },
      ],
    };
    if (filters.withMeta) {
      row.metadata = {
        archiveId: r.archiveId,
        callKind: r.kind,
        promptHash: r.promptHash,
        composite: compositeNum,
        bannedCount: r.bannedCount,
        dimensions: r.evalScores,
        feedback: r.feedback,
        createdAt: r.callCreatedAt.toISOString(),
      };
    }
    rows.push(row);
  }

  return { rows, total: rows.length, skipped, skippedBy };
}
