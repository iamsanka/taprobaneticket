import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  bigint,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { events } from "./events";
import { users } from "./users";

/* ============================
   INCOME CATEGORY ENUM
============================ */

export const incomeCategoryEnum = pgEnum("income_category", [
  "director_share",
  "sponsorship",
  "donation",
  "bank_transfer",
  "other",
]);

/* ============================
   INCOME STATUS ENUM
============================ */

export const incomeStatusEnum = pgEnum("income_status", [
  "expected",   // recorded but not yet received
  "partial",    // some received, more expected
  "received",   // fully received
  "cancelled",  // no longer expected
]);

/* ============================
   INCOMES TABLE
============================ */

export const incomes = pgTable("incomes", {
  id: serial("id").primaryKey(),

  // Optional event tie — null = company-wide income
  eventId: integer("event_id").references(() => events.id, {
    onDelete: "set null",
  }),

  // Category + free-text for the specifics
  category: incomeCategoryEnum("category").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),

  // Payer / source (e.g. "Tharuka Chamara", "Nordea Bank")
  payer: varchar("payer", { length: 255 }),

  // Money — in cents
  grossAmount: bigint("gross_amount", { mode: "number" }).notNull(),

  // Status
  status: incomeStatusEnum("status").notNull().default("expected"),

  // Optional due date (expected receipt date)
  dueDate: timestamp("due_date", { withTimezone: true }),

  // Free-text notes (internal)
  notes: text("notes"),

  // Audit
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});