import app from "./app";
import { logger } from "./lib/logger";
import { startHeadlineScheduler } from "./lib/ingest-headlines";
import {
  startWeeklyDeepDiveScheduler,
  startWeeklyRecapScheduler,
} from "./lib/writer-agent";
import { startDailyDigestScheduler } from "./lib/daily-digest";
import { ensureLeadsSchema } from "./routes/leads";
import { ensureSubscribersSchema } from "./routes/subscribe";
import { runDataMigrations } from "./lib/migrate";
import { ensureJudgeSchema } from "./lib/headline-judge";
import { ensureCommentatorSchema } from "./lib/headline-commentator";
import { ensureLlmUsageSchema } from "./lib/llm-usage";
import {
  ensureDispatchEvalSchema,
  startDispatchEngagementScheduler,
} from "./lib/dispatch-eval";
import {
  reloadDynamicBannedPatterns,
  startDynamicBannedPatternsReload,
} from "./lib/banned-phrases";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  ensureLeadsSchema().catch((schemaErr) => {
    logger.error({ err: schemaErr }, "Leads: ensureSchema failed");
  });

  ensureSubscribersSchema().catch((schemaErr) => {
    logger.error({ err: schemaErr }, "Subscribers: ensureSchema failed");
  });

  runDataMigrations().catch((err) => {
    logger.error({ err }, "Data migrations: failed");
  });

  // Await judge schema before starting the headline scheduler — the immediate
  // ingest-tick fires scoreUnscoredHeadlines, which queries relevance_score.
  // If the column doesn't exist yet, the first scoring pass throws and those
  // rows stay NULL until the next tick. ALTER TABLE IF NOT EXISTS is a few
  // ms; not worth racing.
  Promise.all([
    ensureJudgeSchema().catch((err) => {
      logger.error({ err }, "Headline judge: ensureSchema failed");
    }),
    ensureCommentatorSchema().catch((err) => {
      logger.error({ err }, "Headline commentator: ensureSchema failed");
    }),
    ensureLlmUsageSchema().catch((err) => {
      logger.error({ err }, "LLM usage: ensureSchema failed");
    }),
    ensureDispatchEvalSchema().catch((err) => {
      logger.error({ err }, "Dispatch eval: ensureSchema failed");
    }),
  ]).finally(async () => {
    // Hydrate the dynamic banned-phrase cache once the dispatch_eval
    // tables (including dispatch_phrase_proposals) are guaranteed to
    // exist. Await the first reload so the headline scheduler's
    // immediate ingest tick — and any commentator / writer call queued
    // in parallel — sees the full catalogue. Without the await, the
    // first tick can run while the dynamic cache is still empty and
    // ship phrases the gate would otherwise have blocked.
    try {
      await reloadDynamicBannedPatterns();
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "Banned phrases: initial cache hydration failed (continuing with static-only gate)",
      );
    }
    startDynamicBannedPatternsReload();
    if (process.env["DISABLE_HEADLINE_SCHEDULER"] !== "1") {
      const intervalMinutes = Number(process.env["HEADLINE_INGEST_INTERVAL_MIN"] ?? "15");
      startHeadlineScheduler(intervalMinutes * 60 * 1000);
      logger.info({ intervalMinutes }, "Headline scheduler started");
    }
  });

  if (process.env["DISABLE_WEEKLY_DEEP_DIVE_SCHEDULER"] !== "1") {
    if (process.env["LLM_API_KEY"]) {
      startWeeklyDeepDiveScheduler();
      logger.info(
        {
          dowPt: process.env["WEEKLY_DEEP_DIVE_DOW_PT"] ?? "1",
          hourPt: process.env["WEEKLY_DEEP_DIVE_HOUR_PT"] ?? "9",
          minutePt: process.env["WEEKLY_DEEP_DIVE_MINUTE_PT"] ?? "0",
          timezone: "America/Los_Angeles",
        },
        "Weekly deep_dive scheduler started (Monday 9:00 PT — once per ISO week)",
      );
    } else {
      logger.warn("LLM_API_KEY not set — weekly deep_dive scheduler disabled");
    }
  }

  if (process.env["DISABLE_WEEKLY_RECAP_SCHEDULER"] !== "1") {
    if (process.env["LLM_API_KEY"]) {
      startWeeklyRecapScheduler();
      logger.info(
        {
          dowPt: process.env["WEEKLY_RECAP_DOW_PT"] ?? "5",
          hourPt: process.env["WEEKLY_RECAP_HOUR_PT"] ?? "9",
          minutePt: process.env["WEEKLY_RECAP_MINUTE_PT"] ?? "0",
          timezone: "America/Los_Angeles",
        },
        "Weekly recap scheduler started (Friday 9:00 PT — once per ISO week)",
      );
    } else {
      logger.warn("LLM_API_KEY not set — weekly recap scheduler disabled");
    }
  }

  if (process.env["DISABLE_DISPATCH_ENGAGEMENT_TICK"] !== "1") {
    const intervalMin = Number(process.env["DISPATCH_ENGAGEMENT_TICK_MIN"] ?? "60");
    startDispatchEngagementScheduler(intervalMin * 60 * 1000);
    logger.info({ intervalMin }, "Dispatch engagement scheduler started");
  }

  if (process.env["DISABLE_DAILY_DIGEST"] !== "1") {
    const haveAll =
      process.env["DAILY_DIGEST_FROM_EMAIL"] && process.env["RESEND_API_KEY"];
    if (haveAll) {
      startDailyDigestScheduler();
      logger.info(
        {
          hourPt: process.env["DAILY_DIGEST_HOUR_PT"] ?? "15",
          minutePt: process.env["DAILY_DIGEST_MINUTE_PT"] ?? "30",
          daysOfWeekPt: process.env["DAILY_DIGEST_DAYS_PT"] ?? "2,4",
          timezone: "America/Los_Angeles",
        },
        "Dispatch scheduler started (Tue + Thu 3:30 PM PT by default, sends best post directly to subscribers)",
      );
    } else {
      logger.warn(
        "Daily digest disabled — set DAILY_DIGEST_FROM_EMAIL and RESEND_API_KEY to enable",
      );
    }
  }
});
