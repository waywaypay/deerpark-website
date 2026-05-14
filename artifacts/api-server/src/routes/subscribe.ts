import { Router, type IRouter } from "express";
import { db, subscribersTable, insertSubscriberSchema } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * Self-healing schema migration. PR #110 added `source` and PR #123 added
 * `first_name`/`last_name` to subscribers, but `drizzle-kit push` was never
 * run on prod — so `db.select().from(subscribersTable)` (used by
 * GET /admin/leads and POST /subscribe) 500s on column-doesn't-exist.
 * (`unsubscribe_token`/`unsubscribed_at` are also self-healed inside the
 * daily-digest scheduler, but that scheduler is env-gated, so cover them
 * here too for a fresh DB where digest config is absent.) Idempotent.
 */
export async function ensureSubscribersSchema(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS first_name text
  `);
  await db.execute(sql`
    ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS last_name text
  `);
  await db.execute(sql`
    ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS source text
  `);
  await db.execute(sql`
    ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS unsubscribe_token text UNIQUE
  `);
  await db.execute(sql`
    ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS unsubscribed_at timestamptz
  `);
  logger.info("Subscribers: ensureSchema ok");
}

router.post("/subscribe", async (req, res) => {
  const parsed = insertSubscriberSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Valid email required",
      issues: parsed.error.issues,
    });
  }

  try {
    await db
      .insert(subscribersTable)
      .values(parsed.data)
      .onConflictDoNothing({ target: subscribersTable.email });
  } catch (err) {
    req.log.error({ err }, "Failed to insert subscriber");
    return res.status(500).json({ error: "Internal server error" });
  }

  req.log.info({ email: parsed.data.email }, "Subscriber captured");
  return res.status(200).json({ ok: true });
});

export default router;
