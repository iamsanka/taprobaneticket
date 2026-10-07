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
import { expenses } from "./expenses";
import { users } from "./users";

/* ============================
   PAYMENT METHOD ENUM (money out)
============================ */

export const expensePaymentMethodEnum = pgEnum("expense_payment_method", [
  "bank_transfer",
  "cash",
  "card",
  "mobilepay",
  "other",
]);

/* ============================
   EXPENSE PAYMENTS TABLE
============================ */

export const expensePayments = pgTable("expense_payments", {
  id: serial("id").primaryKey(),

  expenseId: integer("expense_id")
    .notNull()
    .references(() => expenses.id, { onDelete: "cascade" }),

  // Amount paid in this specific payment (cents)
  amount: bigint("amount", { mode: "number" }).notNull(),

  // When the money left our account
  paidAt: timestamp("paid_at", { withTimezone: true })
    .defaultNow()
    .notNull(),

  // How it was paid
  method: expensePaymentMethodEnum("method")
    .notNull()
    .default("bank_transfer"),

  // Bank reference / receipt number / payment ID
  reference: varchar("reference", { length: 255 }),

  // Free-text notes
  notes: text("notes"),

  // Audit
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});