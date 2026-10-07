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
   EXPENSE STATUS ENUM
============================ */

export const expenseStatusEnum = pgEnum("expense_status", [
  "quote",     // quoted, not yet committed
  "booked",    // committed but not yet paid
  "partial",   // some paid, more owed
  "paid",      // fully paid
  "cancelled", // called off
]);

/* ============================
   EXPENSE CATEGORY ENUM
============================ */

export const expenseCategoryEnum = pgEnum("expense_category", [
  "artists_crew",           // performers, directors, creative team
  "production_equipment",   // gear, rentals, technical
  "event_venue",            // hall rent, utilities
  "marketing",              // ads, design, print
  "operations",             // bank charges, telecom, software
  "admin",                  // accounting, legal
  "travel",                 // transport, accommodation
  "catering",               // food, hospitality
  "other",
]);

/* ============================
   EXPENSES TABLE
============================ */

export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),

  // Optional event tie — null = company-wide / operating expense
  eventId: integer("event_id").references(() => events.id, {
    onDelete: "set null",
  }),

  // Category + free-text
  category: expenseCategoryEnum("category").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),

  // Supplier / vendor name
  supplier: varchar("supplier", { length: 255 }),

  // Free-text sub-category (e.g. "Mobile / telecom" or "Backline")
  subCategory: varchar("sub_category", { length: 128 }),

  // Money — in cents
  grossAmount: bigint("gross_amount", { mode: "number" }).notNull(),

  // Status
  status: expenseStatusEnum("status").notNull().default("quote"),

  // Dates
  issueDate: timestamp("issue_date", { withTimezone: true }),
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