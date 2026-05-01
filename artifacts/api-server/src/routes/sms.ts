import { Router, type IRouter } from "express";
import {
  db,
  smsConversationsTable,
  smsMessagesTable,
  leadsTable,
  type SmsConversation,
} from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import {
  generateSmsReply,
  isStopKeyword,
  isHelpKeyword,
  HELP_REPLY,
  STOP_REPLY,
  FALLBACK_REPLY,
} from "../lib/sms-bot";
import {
  verifyTwilioSignature,
  twimlMessage,
  isE164,
  sendTwilioSms,
} from "../lib/twilio";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/** Reconstruct the exact URL Twilio used to call us, for signature verification. */
function externalUrl(req: import("express").Request): string {
  // Trust proxy headers from Fly / Vercel / Cloudflare so we sign against
  // the public URL Twilio actually hit, not the localhost the app sees.
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0] ??
    req.protocol;
  const host =
    (req.headers["x-forwarded-host"] as string | undefined) ??
    req.headers.host ??
    "";
  return `${proto}://${host}${req.originalUrl}`;
}

/**
 * POST /api/sms/inbound
 *
 * Twilio webhook for incoming SMS.
 *
 * Reply pattern: ASYNCHRONOUS. Twilio's webhook deadline is 15s, but
 * a Sonnet call with a multi-turn history can run 30–60s on a cold cache.
 * To stay inside the deadline we:
 *   1. Verify signature, dedupe, store the inbound, return 200 with
 *      empty TwiML — all under ~200ms.
 *   2. Fire-and-forget the LLM call; on completion, push the reply via
 *      Twilio's REST API.
 *
 * Requirements for outbound delivery:
 *   - TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER set.
 *   - If TWILIO_FROM_NUMBER is unset, we still log the bot reply but
 *     don't ship it (development mode).
 */
router.post("/sms/inbound", async (req, res) => {
  res.type("application/xml");

  const params = req.body as Record<string, string>;
  const messageSid = params.MessageSid;
  const fromRaw = params.From;
  const body = (params.Body ?? "").trim();

  // ── 1. Signature verification ──────────────────────────────────────────
  const skipVerify = process.env["TWILIO_SKIP_VERIFY"] === "1";
  const authToken = process.env["TWILIO_AUTH_TOKEN"];
  if (!skipVerify) {
    if (!authToken) {
      req.log.error("sms: TWILIO_AUTH_TOKEN unset and TWILIO_SKIP_VERIFY!=1");
      res.status(503).send(twimlMessage(null));
      return;
    }
    const reconstructedUrl = externalUrl(req);
    const ok = verifyTwilioSignature({
      authToken,
      signatureHeader: req.headers["x-twilio-signature"] as string | undefined,
      fullUrl: reconstructedUrl,
      params,
    });
    if (!ok) {
      req.log.warn(
        {
          messageSid,
          reconstructedUrl,
          xfProto: req.headers["x-forwarded-proto"],
          xfHost: req.headers["x-forwarded-host"],
          host: req.headers.host,
          originalUrl: req.originalUrl,
          paramKeys: Object.keys(params).sort(),
          sigPresent: Boolean(req.headers["x-twilio-signature"]),
        },
        "sms: signature verification failed",
      );
      res.status(403).send(twimlMessage(null));
      return;
    }
  }

  // ── 2. Validation ──────────────────────────────────────────────────────
  if (!fromRaw || !isE164(fromRaw)) {
    req.log.warn({ fromRaw, messageSid }, "sms: invalid From");
    res.status(200).send(twimlMessage(null));
    return;
  }
  if (!body) {
    res.status(200).send(twimlMessage(null));
    return;
  }
  const phone = fromRaw;

  // ── 3. Dedupe on MessageSid ────────────────────────────────────────────
  if (messageSid) {
    const existing = await db
      .select({ id: smsMessagesTable.id })
      .from(smsMessagesTable)
      .where(eq(smsMessagesTable.twilioSid, messageSid))
      .limit(1);
    if (existing.length > 0) {
      req.log.info({ messageSid }, "sms: duplicate webhook, ignoring");
      res.status(200).send(twimlMessage(null));
      return;
    }
  }

  // ── 4. Get/create conversation, store inbound ──────────────────────────
  const conversation = await getOrCreateConversation(phone);
  await db.insert(smsMessagesTable).values({
    conversationId: conversation.id,
    phoneE164: phone,
    direction: "inbound",
    body,
    twilioSid: messageSid ?? null,
    sent: true,
  });
  await db
    .update(smsConversationsTable)
    .set({ lastInboundAt: new Date(), updatedAt: new Date() })
    .where(eq(smsConversationsTable.id, conversation.id));

  // ── 5. STOP / HELP / muted — synchronous, no LLM call ──────────────────
  if (isStopKeyword(body)) {
    await db
      .update(smsConversationsTable)
      .set({ muted: true, updatedAt: new Date() })
      .where(eq(smsConversationsTable.id, conversation.id));
    await recordOutbound(conversation.id, phone, STOP_REPLY, { sent: true });
    res.status(200).send(twimlMessage(STOP_REPLY));
    return;
  }
  if (isHelpKeyword(body)) {
    await recordOutbound(conversation.id, phone, HELP_REPLY, { sent: true });
    res.status(200).send(twimlMessage(HELP_REPLY));
    return;
  }
  if (conversation.muted) {
    res.status(200).send(twimlMessage(null));
    return;
  }

  // ── 6. ACK Twilio immediately, kick off async reply ────────────────────
  // Empty <Response/> tells Twilio "I got your message, no inline reply
  // needed." We then run the LLM call after returning, and ship the reply
  // via the REST API. Twilio's 15s deadline only covers steps 1-5.
  res.status(200).send(twimlMessage(null));

  // Fire-and-forget. We attach a .catch so an unhandled rejection doesn't
  // crash the process — every error path inside `handleAsyncReply` already
  // records the failure to sms_messages, so the catch is just belt-and-
  // suspenders for anything we forgot to wrap.
  void handleAsyncReply({ conversation, phone, body, requestLogger: req.log }).catch(
    (err) => {
      logger.error({ err, phone }, "sms: async reply task crashed");
    },
  );
});

/**
 * The slow path: build history, call the LLM, send the reply via Twilio's
 * REST API. Runs after the webhook has already returned 200.
 */
async function handleAsyncReply(args: {
  conversation: SmsConversation;
  phone: string;
  body: string;
  requestLogger: typeof logger;
}) {
  const { phone, body } = args;
  // Re-fetch conversation in case it changed between webhook and async run.
  const conversation = args.conversation;

  // Build history from the DB (chronological, last 20 turns).
  const historyRows = await db
    .select({
      direction: smsMessagesTable.direction,
      body: smsMessagesTable.body,
    })
    .from(smsMessagesTable)
    .where(eq(smsMessagesTable.conversationId, conversation.id))
    .orderBy(desc(smsMessagesTable.createdAt))
    .limit(20);

  type Turn = { direction: "inbound" | "outbound"; body: string };
  const trimmedHistory: Turn[] = historyRows
    .reverse()
    .slice(0, -1)
    .filter(
      (m): m is Turn =>
        m.direction === "inbound" || m.direction === "outbound",
    );

  let replyText: string;
  let llmMeta: {
    model?: string;
    rawModelResponse?: string;
    promptTokens?: number;
    completionTokens?: number;
    costUsd?: number;
    latencyMs?: number;
    qualifiedThisTurn?: boolean | null;
  } = {};
  let summaryUpdate: string | null = null;
  let qualifiedThisTurn = false;
  let leadFields: { name?: string; company?: string; workflow?: string } = {};

  try {
    const out = await generateSmsReply({
      history: trimmedHistory,
      inbound: body,
      priorSummary: conversation.summary,
    });
    replyText = out.reply;
    summaryUpdate = out.summary;
    qualifiedThisTurn = out.qualified;
    llmMeta = {
      model: out.model,
      rawModelResponse: out.raw,
      promptTokens: out.promptTokens,
      completionTokens: out.completionTokens,
      costUsd: out.costUsd,
      latencyMs: out.latencyMs,
      qualifiedThisTurn: out.qualified,
    };
    leadFields = {
      name: out.name ?? undefined,
      company: out.company ?? undefined,
      workflow: out.workflow ?? undefined,
    };
  } catch (err) {
    logger.error({ err, phone }, "sms: bot reply failed, sending fallback");
    replyText = FALLBACK_REPLY;
    llmMeta = {
      rawModelResponse:
        err instanceof Error ? err.message.slice(0, 500) : String(err),
    };
  }

  // Send via Twilio REST API. If outbound credentials are missing, we still
  // record the reply for evals but mark it unsent.
  const accountSid = process.env["TWILIO_ACCOUNT_SID"];
  const authToken = process.env["TWILIO_AUTH_TOKEN"];
  const from = process.env["TWILIO_FROM_NUMBER"];
  let sent = false;
  let sendError: string | null = null;
  let sentSid: string | null = null;
  if (accountSid && authToken && from) {
    try {
      const result = await sendTwilioSms({
        accountSid,
        authToken,
        from,
        to: phone,
        body: replyText,
      });
      sent = true;
      sentSid = result.sid;
    } catch (err) {
      sendError =
        err instanceof Error ? err.message.slice(0, 500) : String(err);
      logger.error({ err, phone }, "sms: outbound send failed");
    }
  } else {
    sendError =
      "Outbound credentials missing (TWILIO_ACCOUNT_SID / TWILIO_FROM_NUMBER)";
    logger.warn(
      { phone, hasSid: Boolean(accountSid), hasFrom: Boolean(from) },
      "sms: skipping outbound — credentials missing",
    );
  }

  await recordOutbound(conversation.id, phone, replyText, {
    ...llmMeta,
    twilioSid: sentSid,
    sent,
    sendError,
  });

  // Update conversation summary + qualification + push lead if qualified.
  const updates: Partial<typeof smsConversationsTable.$inferInsert> = {
    lastOutboundAt: new Date(),
    updatedAt: new Date(),
  };
  if (summaryUpdate) updates.summary = summaryUpdate;
  if (qualifiedThisTurn && !conversation.qualified) {
    updates.qualified = true;
    const name = leadFields.name?.slice(0, 200) || "(SMS lead, name unknown)";
    const company = leadFields.company?.slice(0, 200) || "(unknown)";
    const challenge =
      (leadFields.workflow ? `Workflow: ${leadFields.workflow}\n\n` : "") +
      `Phone: ${phone}\n` +
      `Summary: ${summaryUpdate ?? "(no summary)"}`;
    try {
      const [lead] = await db
        .insert(leadsTable)
        .values({
          name,
          email: `${phone.replace(/\D/g, "")}@sms.deerpark.io`,
          company,
          challenge: challenge.slice(0, 5000),
        })
        .returning({ id: leadsTable.id });
      updates.leadId = lead.id;
      logger.info({ phone, leadId: lead.id }, "sms: qualified, lead captured");
    } catch (err) {
      logger.error({ err, phone }, "sms: failed to insert qualified lead");
    }
  }
  await db
    .update(smsConversationsTable)
    .set(updates)
    .where(eq(smsConversationsTable.id, conversation.id));
}

async function getOrCreateConversation(
  phone: string,
): Promise<SmsConversation> {
  const existing = await db
    .select()
    .from(smsConversationsTable)
    .where(eq(smsConversationsTable.phoneE164, phone))
    .limit(1);
  if (existing.length > 0) return existing[0];

  const [created] = await db
    .insert(smsConversationsTable)
    .values({ phoneE164: phone })
    .returning();
  return created;
}

async function recordOutbound(
  conversationId: number,
  phone: string,
  body: string,
  extras: Partial<Omit<typeof smsMessagesTable.$inferInsert, "id">> = {},
) {
  await db.insert(smsMessagesTable).values({
    conversationId,
    phoneE164: phone,
    direction: "outbound",
    body,
    ...extras,
  });
}

export default router;
