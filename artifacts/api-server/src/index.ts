import app from "./app";
import { logger } from "./lib/logger";
import { startHeadlineScheduler } from "./lib/ingest-headlines";
import { ensureLeadsSchema } from "./routes/leads";
import { runDataMigrations } from "./lib/migrate";
import { ensureJudgeSchema } from "./lib/headline-judge";
import { ensureLlmUsageSchema } from "./lib/llm-usage";

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
    ensureLlmUsageSchema().catch((err) => {
      logger.error({ err }, "LLM usage: ensureSchema failed");
    }),
  ]).finally(() => {
    if (process.env["DISABLE_HEADLINE_SCHEDULER"] !== "1") {
      const intervalMinutes = Number(process.env["HEADLINE_INGEST_INTERVAL_MIN"] ?? "15");
      startHeadlineScheduler(intervalMinutes * 60 * 1000);
      logger.info({ intervalMinutes }, "Headline scheduler started");
    }
  });
});
