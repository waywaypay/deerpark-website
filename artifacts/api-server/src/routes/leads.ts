import { Router, type IRouter } from "express";
import { db, leadsTable, insertLeadSchema } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * Self-healing schema migration. Commit e63017f renamed `email` → `contact`
 * and added `contact_type`, but `drizzle-kit push` was never run on prod, so
 * every POST /leads has been 500'ing on column-doesn't-exist. Idempotent:
 * the rename + ADD COLUMN are both no-ops on subsequent boots.
 */
export async function ensureLeadsSchema(): Promise<void> {
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leads' AND column_name = 'email'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leads' AND column_name = 'contact'
      ) THEN
        ALTER TABLE leads RENAME COLUMN email TO contact;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leads' AND column_name = 'contact_type'
      ) THEN
        ALTER TABLE leads ADD COLUMN contact_type text NOT NULL DEFAULT 'email';
      END IF;
    END $$
  `);
  logger.info("Leads: ensureSchema ok");
}

router.post("/leads", async (req, res) => {
  const parsed = insertLeadSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid input",
      issues: parsed.error.issues,
    });
  }

  try {
    const [lead] = await db
      .insert(leadsTable)
      .values(parsed.data)
      .returning({ id: leadsTable.id });

    req.log.info({ leadId: lead.id }, "Lead captured");
    return res.status(201).json({ id: lead.id });
  } catch (err) {
    req.log.error({ err }, "Failed to insert lead");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
