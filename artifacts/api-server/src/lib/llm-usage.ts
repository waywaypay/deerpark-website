// Shared LLM-usage logger. Every Venice caller (writer-agent, judge,
// commentator, email polish/fallback, image-gen, sms-bot) appends a row
// here per call so /admin/usage/venice can show a single, complete spend
// number — including banner previews and digest previews, which previously
// vanished from the tracker because they didn't write to posts/sms_messages.
//
// `logUsage` swallows errors: a failed insert here must never break the
// originating call (e.g. a failed banner preview because the metrics DB is
// down would be worse than missing a usage row).

import { db, llmUsageTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

// USD per 1M tokens. Centralized so writer-agent, sms-bot, judge,
// commentator, and email polish all price calls consistently. Update as
// model pricing changes; historical rows keep the cost computed at write
// time.
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic Claude (passthrough rates)
  "claude-opus-4-7": { input: 15, output: 75 },
  "claude-opus-4-6": { input: 15, output: 75 },
  "claude-opus-4-6-fast": { input: 15, output: 75 },
  "claude-opus-4-5": { input: 15, output: 75 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  // OpenAI
  "openai-gpt-55": { input: 5, output: 20 },
  "openai-gpt-55-pro": { input: 15, output: 60 },
  "openai-gpt-54": { input: 2.5, output: 10 },
  "openai-gpt-54-mini": { input: 0.15, output: 0.6 },
  "openai-gpt-4o-mini-2024-07-18": { input: 0.15, output: 0.6 },
  // Google
  "gemini-3-1-pro-preview": { input: 2.5, output: 10 },
  "gemini-3-flash-preview": { input: 0.3, output: 1.2 },
  // Open / smaller models — Venice rates approximate
  "deepseek-v4-pro": { input: 0.6, output: 2.4 },
  "deepseek-v4-flash": { input: 0.15, output: 0.6 },
  "kimi-k2-6": { input: 0.5, output: 2 },
  "qwen3-235b-a22b-instruct-2507": { input: 0.4, output: 1.5 },
  "qwen3-coder-480b-a35b-instruct": { input: 0.8, output: 3 },
  "qwen3-5-9b": { input: 0.05, output: 0.15 },
  "llama-3.3-70b": { input: 0.4, output: 1.2 },
  "llama-3.2-3b": { input: 0.04, output: 0.06 },
  "mistral-small-2603": { input: 0.2, output: 0.6 },
  "zai-org-glm-4.7": { input: 0.5, output: 1.5 },
  "zai-org-glm-5": { input: 0.6, output: 2 },
};

const FALLBACK_PRICING = { input: 1, output: 3 };

export function priceForModel(model: string): { input: number; output: number } {
  return MODEL_PRICING[model] ?? FALLBACK_PRICING;
}

/** USD cost as an 8-decimal string for `numeric` columns. */
export function computeCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): string {
  const { input, output } = priceForModel(model);
  const cost = (promptTokens * input + completionTokens * output) / 1_000_000;
  return cost.toFixed(8);
}

/**
 * Per-image cost estimate for the banner generator. Venice doesn't return
 * usage on /image/generate, so we log a flat estimate per call. SD35 at the
 * default 1200×400 PNG is ~$0.01 in observed Venice pricing; tune via env
 * if the actual rate diverges.
 */
function imageCostUsd(): string {
  const raw = process.env["IMAGE_GEN_COST_USD"];
  const parsed = raw ? Number(raw) : NaN;
  const cost = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0.01;
  return cost.toFixed(8);
}

export type UsageCaller =
  | "writer"
  | "judge"
  | "commentator"
  | "email_polish"
  | "email_fallback"
  | "image_gen"
  | "sms_bot"
  | "dispatch_eval";

type LogUsageInput = {
  caller: UsageCaller;
  model: string;
} & (
  | {
      callKind: "chat";
      promptTokens: number;
      completionTokens: number;
      /** Pre-computed cost (already-priced caller). Otherwise we compute it. */
      costUsd?: string;
    }
  | {
      callKind: "image";
      /** Optional override — defaults to IMAGE_GEN_COST_USD. */
      costUsd?: string;
    }
);

/**
 * Append one usage row. Never throws — a failed metrics insert mustn't
 * fail the originating LLM call.
 */
export async function logUsage(input: LogUsageInput): Promise<void> {
  try {
    if (input.callKind === "chat") {
      const promptTokens = Math.max(0, Math.round(input.promptTokens));
      const completionTokens = Math.max(0, Math.round(input.completionTokens));
      const totalTokens = promptTokens + completionTokens;
      const costUsd =
        input.costUsd ?? computeCostUsd(input.model, promptTokens, completionTokens);
      await db.insert(llmUsageTable).values({
        caller: input.caller,
        callKind: "chat",
        model: input.model,
        promptTokens,
        completionTokens,
        totalTokens,
        costUsd,
      });
    } else {
      const costUsd = input.costUsd ?? imageCostUsd();
      await db.insert(llmUsageTable).values({
        caller: input.caller,
        callKind: "image",
        model: input.model,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costUsd,
      });
    }
  } catch (err) {
    logger.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        caller: input.caller,
        callKind: input.callKind,
        model: input.model,
      },
      "llm-usage: insert failed (non-fatal)",
    );
  }
}

/**
 * Self-healing schema. Mirrors the pattern used by ensureJudgeSchema /
 * ensureCommentatorSchema — safe on every boot. The data-migrations runner
 * also creates this table; this is the second-line defense in case an
 * older container starts before the migration runs.
 */
export async function ensureLlmUsageSchema(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS llm_usage (
      id SERIAL PRIMARY KEY,
      caller TEXT NOT NULL,
      call_kind TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd NUMERIC(14, 8) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS llm_usage_created_at_idx ON llm_usage (created_at)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS llm_usage_caller_idx ON llm_usage (caller)
  `);
}
