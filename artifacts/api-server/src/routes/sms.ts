import { Router, type IRouter } from "express";
import {
  db,
  smsConversationsTable,
  smsMessagesTable,
  leadsTable,
  type SmsConversation,
  type SmsMessage,
} from "@workspace/db";
import { and, asc, desc, eq } from "drizzle-orm";
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
} from "../lib/twilio";

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
 * Twilio webhook for incoming SMS. Returns TwiML that Twilio uses to send
 * the reply — keeping the round-trip in-band avoids needing outbound
 * Twilio API credentials at all for the MVP.
 *
 * Critical correctness requirements:
 *   - Verify signature in production. Without this anyone can post messages
 *     into our DB and trigger LLM calls on our dime.
 *   - Dedupe on MessageSid. Twilio retries on 5xx; without dedupe we'd
 *     double-bill ourselves and confuse the conversation.
 *   - Always return 200 with TwiML, even on internal errors. A 5xx triggers
 *     Twilio's retry storm.
 */
router.post("/sms/inbound", async (req, res) => {
  // Force the response shape — Twilio expects XML, not JSON.
  res.type("application/xml");

  const params = req.body as Record<string, string>;
  const messageSid = params.MessageSid;
  const fromRaw = params.From;
  const body = (params.Body ?? "").trim();

  // Signature verification. Skipped only when explicitly disabled (dev/local).
  // We intentionally fail-closed: if TWILIO_AUTH_TOKEN is unset and skip is
  // not enabled, we 403 rather than accept unsigned traffic.
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

  // Dedupe: if we've already stored this MessageSid, do nothing.
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

  // Upsert conversation row.
  let conversation = await getOrCreateConversation(phone);

  // Record the inbound first — even if everything downstream blows up, we
  // still have the message in the DB for evals.
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

  // STOP / HELP short-circuits. STOP mutes the conversation forever.
  if (isStopKeyword(body)) {
    await db
      .update(smsConversationsTable)
      .set({ muted: true, updatedAt: new Date() })
      .where(eq(smsConversationsTable.id, conversation.id));
    await recordOutbound(conversation.id, phone, STOP_REPLY, {
      sent: true,
    });
    res.status(200).send(twimlMessage(STOP_REPLY));
    return;
  }
  if (isHelpKeyword(body)) {
    await recordOutbound(conversation.id, phone, HELP_REPLY, { sent: true });
    res.status(200).send(twimlMessage(HELP_REPLY));
    return;
  }

  // If muted, silently drop — no reply, no LLM call.
  if (conversation.muted) {
    res.status(200).send(twimlMessage(null));
    return;
  }

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

  // We pulled DESC; flip to chronological and drop the just-inserted inbound
  // (the bot gets it as the explicit `inbound` argument). The DB column is
  // typed as `string` from drizzle's enum, so narrow it here to the literal
  // union the bot expects.
  type Turn = { direction: "inbound" | "outbound"; body: string };
  const trimmedHistory: Turn[] = historyRows
    .reverse()
    .slice(0, -1)
    .filter(
      (m): m is Turn =>
        m.direction === "inbound" || m.direction === "outbound",
    );

  let replyText: string;
  let qualifiedThisTurn: boolean | null = null;
  try {
    const out = await generateSmsReply({
      history: trimmedHistory,
      inbound: body,
      priorSummary: conversation.summary,
    });
    replyText = out.reply;
    qualifiedThisTurn = out.qualified;

    await recordOutbound(conversation.id, phone, out.reply, {
      sent: true,
      model: out.model,
      rawModelResponse: out.raw,
      promptTokens: out.promptTokens,
      completionTokens: out.completionTokens,
      costUsd: out.costUsd,
      latencyMs: out.latencyMs,
      qualifiedThisTurn,
    });

    // Update conversation summary + qualification + push lead if qualified.
    const updates: Partial<typeof smsConversationsTable.$inferInsert> = {
      lastOutboundAt: new Date(),
      updatedAt: new Date(),
    };
    if (out.summary) updates.summary = out.summary;
    if (out.qualified && !conversation.qualified) {
      updates.qualified = true;
      // Push to leads table so the existing lead pipeline picks it up.
      // We use null email because SMS leads don't have one yet — the
      // leads schema requires it though, so we synthesize a placeholder
      // and stash the phone+workflow in `challenge`. The bot prompt asks
      // for email at the qualified turn, and the next inbound that
      // contains an email will be re-pushed by the eval/admin reviewer.
      const name = out.name?.slice(0, 200) || "(SMS lead, name unknown)";
      const company = out.company?.slice(0, 200) || "(unknown)";
      const challenge =
        (out.workflow ? `Workflow: ${out.workflow}\n\n` : "") +
        `Phone: ${phone}\n` +
        `Summary: ${out.summary ?? "(no summary)"}`;
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
        req.log.info(
          { phone, leadId: lead.id },
          "sms: qualified, lead captured",
        );
      } catch (err) {
        req.log.error({ err, phone }, "sms: failed to insert qualified lead");
      }
    }
    await db
      .update(smsConversationsTable)
      .set(updates)
      .where(eq(smsConversationsTable.id, conversation.id));
  } catch (err) {
    req.log.error({ err, phone }, "sms: bot reply failed, sending fallback");
    replyText = FALLBACK_REPLY;
    await recordOutbound(conversation.id, phone, FALLBACK_REPLY, {
      sent: true,
      sendError: err instanceof Error ? err.message.slice(0, 500) : String(err),
    });
  }

  res.status(200).send(twimlMessage(replyText));
});

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
