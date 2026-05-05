import app from "./app";
import { logger } from "./lib/logger";
import { startHeadlineScheduler } from "./lib/ingest-headlines";
import { startWriterScheduler } from "./lib/writer-agent";
import { startDailyDigestScheduler } from "./lib/daily-digest";
import { ensureLeadsSchema } from "./routes/leads";
import { runDataMigrations } from "./lib/migrate";

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

  if (process.env["DISABLE_HEADLINE_SCHEDULER"] !== "1") {
    const intervalMinutes = Number(process.env["HEADLINE_INGEST_INTERVAL_MIN"] ?? "15");
    startHeadlineScheduler(intervalMinutes * 60 * 1000);
    logger.info({ intervalMinutes }, "Headline scheduler started");
  }

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
          hourUtc: process.env["DAILY_DIGEST_HOUR_UTC"] ?? "13",
          minuteUtc: process.env["DAILY_DIGEST_MINUTE_UTC"] ?? "0",
        },
        "Daily digest scheduler started (daily, sends best post directly to subscribers)",
      );
    } else {
      logger.warn(
        "Daily digest disabled — set DAILY_DIGEST_FROM_EMAIL and RESEND_API_KEY to enable",
      );
    }
  }
});
