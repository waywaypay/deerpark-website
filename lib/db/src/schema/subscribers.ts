import { pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const subscribersTable = pgTable(
  "subscribers",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull().unique(),
    /** Nullable in the DB so legacy rows survive; required at the API boundary. */
    firstName: text("first_name"),
    lastName: text("last_name"),
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
  firstName: () => z.string().trim().min(1, "First name required").max(100),
  lastName: () => z.string().trim().min(1, "Last name required").max(100),
  source: (schema) => schema.max(100).optional(),
}).omit({ id: true, createdAt: true, unsubscribeToken: true, unsubscribedAt: true });

export type InsertSubscriber = z.infer<typeof insertSubscriberSchema>;
export type Subscriber = typeof subscribersTable.$inferSelect;
