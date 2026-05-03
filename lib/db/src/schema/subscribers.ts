import { pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const subscribersTable = pgTable(
  "subscribers",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull().unique(),
    source: text("source"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    /** Random per-subscriber token for one-click unsubscribe. */
    unsubscribeToken: text("unsubscribe_token").unique(),
    /** NULL = subscribed; set = unsubscribed. */
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
  },
  (t) => [index("subscribers_unsubscribed_at_idx").on(t.unsubscribedAt)],
);

export const insertSubscriberSchema = createInsertSchema(subscribersTable, {
  email: (schema) => schema.email().max(320),
  source: (schema) => schema.max(100).optional(),
}).omit({ id: true, createdAt: true, unsubscribeToken: true, unsubscribedAt: true });

export type InsertSubscriber = z.infer<typeof insertSubscriberSchema>;
export type Subscriber = typeof subscribersTable.$inferSelect;
