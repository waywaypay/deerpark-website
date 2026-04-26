import app from "./app";
import { logger } from "./lib/logger";
import { startHeadlineScheduler } from "./lib/ingest-headlines";
import { startWriterScheduler } from "./lib/writer-agent";

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

  if (process.env["DISABLE_HEADLINE_SCHEDULER"] !== "1") {
    const intervalMinutes = Number(process.env["HEADLINE_INGEST_INTERVAL_MIN"] ?? "15");
    startHeadlineScheduler(intervalMinutes * 60 * 1000);
    logger.info({ intervalMinutes }, "Headline scheduler started");
  }

  if (process.env["DISABLE_WRITER_SCHEDULER"] !== "1") {
    if (process.env["LLM_API_KEY"]) {
      startWriterScheduler();
      logger.info("Writer scheduler started (24h cadence)");
    } else {
      logger.warn("LLM_API_KEY not set — writer scheduler disabled");
    }
  }
});
