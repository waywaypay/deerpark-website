import { Router, type IRouter } from "express";
import { db, subscribersTable, insertSubscriberSchema } from "@workspace/db";

const router: IRouter = Router();

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

    req.log.info({ email: parsed.data.email }, "Subscriber captured");
    return res.status(200).json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to insert subscriber");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
