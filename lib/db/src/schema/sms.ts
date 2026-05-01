import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  boolean,
  doublePrecision,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * One row per phone number that has ever texted us. Holds the rolling state
 * the bot needs to keep replying coherently, plus the qualification verdict
 * once it lands. Conversation history itself lives in `sms_messages`.
 */
export const smsConversationsTable = pgTable(
  "sms_conversations",
  {
    id: serial("id").primaryKey(),
    phoneE164: text("phone_e164").notNull().unique(),
    /**
     * Bot-summarized state of the conversation — who they are, what workflow
     * they described, what they asked for. Updated each turn so we don't
     * resend it as full transcript every time. Optional: null until the
     * model has enough to summarize.
     */
    summary: text("summary"),
    qualified: boolean("qualified").default(false).notNull(),
    /**
     * Set when the bot decides this is a real lead and we've pushed it into
     * the leads table. Null until then.
     */
    leadId: integer("lead_id"),
    /**
     * If true, this number is permanently muted (STOP keyword, abuse, manual
     * intervention). Webhook short-circuits without an LLM call.
     */
    muted: boolean("muted").default(false).notNull(),
    lastInboundAt: timestamp("last_inbound_at"),
    lastOutboundAt: timestamp("last_outbound_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("sms_conversations_updated_at_idx").on(t.updatedAt)],
);

/**
 * Every inbound and outbound message. This is the eval substrate — keep it
 * append-only, capture model + token + latency metadata on every outbound,
 * and never mutate rows after insert.
 */
export const smsMessagesTable = pgTable(
  "sms_messages",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id").notNull(),
    phoneE164: text("phone_e164").notNull(),
    direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),
    body: text("body").notNull(),
    /** Twilio's MessageSid — used to dedupe webhook retries. */
    twilioSid: text("twilio_sid"),
    /** For outbound: model id used. For inbound: null. */
    model: text("model"),
    /** Raw JSON of the model response (for evals). Strings, not objects. */
    rawModelResponse: text("raw_model_response"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    costUsd: doublePrecision("cost_usd"),
    latencyMs: integer("latency_ms"),
    /**
     * For outbound messages, captures whether the model marked this turn as
     * qualifying. Null for inbound and for outbound turns where the model
     * didn't emit qualification metadata.
     */
    qualifiedThisTurn: boolean("qualified_this_turn"),
    /** True once Twilio confirms send (or we mark it failed). */
    sent: boolean("sent").default(false).notNull(),
    sendError: text("send_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("sms_messages_conversation_idx").on(t.conversationId, t.createdAt),
    uniqueIndex("sms_messages_twilio_sid_idx").on(t.twilioSid),
    index("sms_messages_phone_idx").on(t.phoneE164, t.createdAt),
  ],
);

export const insertSmsConversationSchema = createInsertSchema(
  smsConversationsTable,
  {
    phoneE164: (schema) => schema.regex(/^\+[1-9]\d{6,14}$/),
  },
).omit({ id: true, createdAt: true, updatedAt: true });

export const insertSmsMessageSchema = createInsertSchema(smsMessagesTable, {
  body: (schema) => schema.min(1).max(10000),
  direction: z.enum(["inbound", "outbound"]),
  phoneE164: (schema) => schema.regex(/^\+[1-9]\d{6,14}$/),
}).omit({ id: true, createdAt: true });

export type InsertSmsConversation = z.infer<typeof insertSmsConversationSchema>;
export type SmsConversation = typeof smsConversationsTable.$inferSelect;
export type InsertSmsMessage = z.infer<typeof insertSmsMessageSchema>;
export type SmsMessage = typeof smsMessagesTable.$inferSelect;
