import { Router, type IRouter } from "express";
import {
  db,
  smsConversationsTable,
  smsMessagesTable,
} from "@workspace/db";
import { asc, desc, eq, sql } from "drizzle-orm";
import { adminAuth } from "../middlewares/admin-auth";

const router: IRouter = Router();

router.use("/admin/sms", adminAuth);

/**
 * GET /api/admin/sms/conversations
 *
 * List recent conversations with summary + message counts. Pagination via
 * ?limit=N&offset=M. Default 50/0.
 */
router.get("/admin/sms/conversations", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
  const offset = parseInt(String(req.query.offset ?? "0"), 10) || 0;

  const rows = await db
    .select({
      id: smsConversationsTable.id,
      phoneE164: smsConversationsTable.phoneE164,
      summary: smsConversationsTable.summary,
      qualified: smsConversationsTable.qualified,
      muted: smsConversationsTable.muted,
      leadId: smsConversationsTable.leadId,
      lastInboundAt: smsConversationsTable.lastInboundAt,
      lastOutboundAt: smsConversationsTable.lastOutboundAt,
      createdAt: smsConversationsTable.createdAt,
      updatedAt: smsConversationsTable.updatedAt,
      messageCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${smsMessagesTable}
        WHERE ${smsMessagesTable.conversationId} = ${smsConversationsTable.id}
      )`,
      totalCostUsd: sql<number>`COALESCE((
        SELECT SUM(${smsMessagesTable.costUsd}) FROM ${smsMessagesTable}
        WHERE ${smsMessagesTable.conversationId} = ${smsConversationsTable.id}
      ), 0)`,
    })
    .from(smsConversationsTable)
    .orderBy(desc(smsConversationsTable.updatedAt))
    .limit(limit)
    .offset(offset);

  res.json({ conversations: rows, limit, offset });
});

/**
 * GET /api/admin/sms/conversations/:id
 *
 * Full transcript with eval metadata for a single conversation. Includes
 * raw model responses so reviewers can see exactly what the model emitted
 * before our parsing/trimming.
 */
router.get("/admin/sms/conversations/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [conversation] = await db
    .select()
    .from(smsConversationsTable)
    .where(eq(smsConversationsTable.id, id))
    .limit(1);
  if (!conversation) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const messages = await db
    .select()
    .from(smsMessagesTable)
    .where(eq(smsMessagesTable.conversationId, id))
    .orderBy(asc(smsMessagesTable.createdAt));

  res.json({ conversation, messages });
});

/**
 * GET /api/admin/sms/messages?since=ISO8601
 *
 * Bulk export for offline eval pipelines. Returns messages newer than
 * `since`, capped at 1000 per request. Use the last row's createdAt as
 * the next `since`.
 */
router.get("/admin/sms/messages", async (req, res) => {
  const since = req.query.since ? new Date(String(req.query.since)) : null;
  const limit = Math.min(
    parseInt(String(req.query.limit ?? "500"), 10) || 500,
    1000,
  );

  const query = db
    .select()
    .from(smsMessagesTable)
    .orderBy(asc(smsMessagesTable.createdAt))
    .limit(limit);

  const rows = since
    ? await query.where(sql`${smsMessagesTable.createdAt} > ${since}`)
    : await query;

  res.json({ messages: rows, limit });
});

/**
 * POST /api/admin/sms/conversations/:id/mute
 *
 * Manually mute/unmute a conversation (e.g. for abuse).
 */
router.post("/admin/sms/conversations/:id/mute", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const muted = req.body?.muted !== false; // default true
  await db
    .update(smsConversationsTable)
    .set({ muted, updatedAt: new Date() })
    .where(eq(smsConversationsTable.id, id));
  res.json({ id, muted });
});

export default router;
