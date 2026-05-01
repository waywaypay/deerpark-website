import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contact: text("contact").notNull(),
  contactType: text("contact_type", { enum: ["email", "sms"] })
    .default("email")
    .notNull(),
  company: text("company").notNull(),
  challenge: text("challenge").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

const E164_RE = /^\+[1-9]\d{6,14}$/;

export const insertLeadSchema = createInsertSchema(leadsTable, {
  name: (schema) => schema.min(1).max(200),
  contact: (schema) => schema.min(1).max(320),
  contactType: z.enum(["email", "sms"]),
  company: (schema) => schema.min(1).max(200),
  challenge: (schema) => schema.min(1).max(5000),
})
  .omit({ id: true, createdAt: true })
  .refine(
    (v) =>
      v.contactType === "email"
        ? z.string().email().max(320).safeParse(v.contact).success
        : E164_RE.test(v.contact),
    {
      message:
        "Contact must be a valid email when contactType is 'email', or E.164 phone (+15551234567) when 'sms'.",
      path: ["contact"],
    },
  );

export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;
