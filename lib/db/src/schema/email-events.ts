import { pgTable, serial, text, timestamp, index, integer } from "drizzle-orm/pg-core";

// Email-engagement events ingested from the Resend webhook. One row per
// provider-emitted event (sent/delivered/opened/clicked/bounced/complained).
// `providerEventId` is the Svix message id, used as the idempotency key — a
// retried webhook delivery becomes a no-op insert.
export const emailEventsTable = pgTable(
  "email_events",
  {
    id: serial("id").primaryKey(),
    providerEventId: text("provider_event_id").notNull().unique(),
    email: text("email").notNull(),
    eventType: text("event_type").notNull(),
    /** Resend message id — groups events that belong to the same send. */
    messageId: text("message_id"),
    /** For click events: the destination URL the user clicked. */
    link: text("link"),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    /** Bounce/complaint subtype, e.g. "hard_bounce", "soft_bounce". */
    reason: text("reason"),
    /** Delay between this event and the matching `email.sent` for the same message_id. */
    deltaSecondsFromSend: integer("delta_seconds_from_send"),
    /** Event timestamp from the provider payload. */
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    /** Insert time on our side. */
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("email_events_email_idx").on(t.email),
    index("email_events_event_type_idx").on(t.eventType),
    index("email_events_message_id_idx").on(t.messageId),
    index("email_events_occurred_at_idx").on(t.occurredAt),
  ],
);

export type EmailEvent = typeof emailEventsTable.$inferSelect;
export type InsertEmailEvent = typeof emailEventsTable.$inferInsert;
