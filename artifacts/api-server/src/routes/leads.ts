import { Router, type IRouter } from "express";
import { db, leadsTable, insertLeadSchema } from "@workspace/db";

const router: IRouter = Router();

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
