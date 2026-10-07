import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/* ============================
   CAMPAIGN STATUS ENUM
============================ */

export const emailCampaignStatusEnum = pgEnum("email_campaign_status", [
  "sending",  // currently being processed
  "sent",     // all recipients successfully sent
  "partial",  // some sent, some failed
  "failed",   // nothing sent
]);

/* ============================
   RECIPIENT SOURCE ENUM
============================ */

export const emailRecipientTypeEnum = pgEnum("email_recipient_type", [
  "customers",
  "staff",
  "manual",
]);

/* ============================
   PER-RECIPIENT STATUS ENUM
============================ */

export const emailRecipientStatusEnum = pgEnum("email_recipient_status", [
  "sent",
  "failed",
]);

/* ============================
   EMAIL CAMPAIGNS
============================ */

export const emailCampaigns = pgTable("email_campaigns", {
  id: serial("id").primaryKey(),

  // Internal label so you can find the campaign in history
  name: varchar("name", { length: 255 }).notNull(),

  subject: varchar("subject", { length: 255 }).notNull(),

  // HTML body — supports {{name}} placeholder
  body: text("body").notNull(),

  // Where the recipients came from
  recipientType: emailRecipientTypeEnum("recipient_type").notNull(),

  status: emailCampaignStatusEnum("status").notNull().default("sending"),

  totalRecipients: integer("total_recipients").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),

  // Audit
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

/* ============================
   EMAIL CAMPAIGN RECIPIENTS
============================ */

export const emailCampaignRecipients = pgTable("email_campaign_recipients", {
  id: serial("id").primaryKey(),

  campaignId: integer("campaign_id")
    .notNull()
    .references(() => emailCampaigns.id, { onDelete: "cascade" }),

  email: varchar("email", { length: 255 }).notNull(),

  // Optional — used for {{name}} personalization
  name: varchar("name", { length: 255 }),

  status: emailRecipientStatusEnum("status").notNull(),

  // If the send failed, this holds Resend's error message
  errorMessage: text("error_message"),

  sentAt: timestamp("sent_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});