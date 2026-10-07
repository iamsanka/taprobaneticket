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
import { incomes } from "./incomes";
import { users } from "./users";

/* ============================
   RECEIPT METHOD ENUM
============================ */

export const receiptMethodEnum = pgEnum("receipt_method", [
  "bank_transfer",
  "cash",
  "card",
  "mobilepay",
  "other",
]);

/* ============================
   INCOME RECEIPTS TABLE
============================ */

export const incomeReceipts = pgTable("income_receipts", {
  id: serial("id").primaryKey(),

  incomeId: integer("income_id")
    .notNull()
    .references(() => incomes.id, { onDelete: "cascade" }),

  // Amount received in this specific payment (cents)
  amount: bigint("amount", { mode: "number" }).notNull(),

  // When the money actually arrived
  receivedAt: timestamp("received_at", { withTimezone: true })
    .defaultNow()
    .notNull(),

  // How it came in
  method: receiptMethodEnum("method").notNull().default("bank_transfer"),

  // Bank reference / receipt number / invoice ref
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