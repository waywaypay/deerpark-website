import app from "./app";
import { logger } from "./lib/logger";
import { startHeadlineScheduler } from "./lib/ingest-headlines";
import { startWriterScheduler } from "./lib/writer-agent";
import { startDailyDigestScheduler } from "./lib/daily-digest";
import { ensureLeadsSchema } from "./routes/leads";
import { runDataMigrations } from "./lib/migrate";
import { ensureJudgeSchema } from "./lib/headline-judge";
import { ensureCommentatorSchema } from "./lib/headline-commentator";

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
  ]).finally(() => {
    if (process.env["DISABLE_HEADLINE_SCHEDULER"] !== "1") {
      const intervalMinutes = Number(process.env["HEADLINE_INGEST_INTERVAL_MIN"] ?? "15");
      startHeadlineScheduler(intervalMinutes * 60 * 1000);
      logger.info({ intervalMinutes }, "Headline scheduler started");
    }
  });

  if (process.env["DISABLE_WRITER_SCHEDULER"] !== "1") {
    if (process.env["LLM_API_KEY"]) {
      startWriterScheduler();
      logger.info("Writer scheduler started (12h tick, 36h floor — ~2-3 posts/week when corpus supports)");
    } else {
      logger.warn("LLM_API_KEY not set — writer scheduler disabled");
    }
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
          timezone: "America/Los_Angeles",
        },
        "Daily digest scheduler started (daily 3:30 PM PT, sends best post directly to subscribers)",
      );
    } else {
      logger.warn(
        "Daily digest disabled — set DAILY_DIGEST_FROM_EMAIL and RESEND_API_KEY to enable",
      );
    }
  }
});
