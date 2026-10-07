import {
  pgTable,
  serial,
  integer,
  bigint,
  timestamp,
  boolean,
  pgEnum,
  unique,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/* ============================
   PAYMENT METHOD ENUM
============================ */

export const paymentCostMethodEnum = pgEnum("payment_cost_method", [
  "card",     // Stripe / card
  "epassi",
  "edenred",
]);

/* ============================
   CALCULATION MODE ENUM
============================ */

export const paymentCostModeEnum = pgEnum("payment_cost_mode", [
  // fee = (amount × percentage) + fixedAmount
  // e.g. Stripe: 1.5% + €0.25
  "percentage_plus_fixed",

  // fee = MAX(amount × percentage, fixedAmount)
  // e.g. ePassi: 5% or €5, whichever is higher
  "percentage_or_fixed",
]);

/* ============================
   PAYMENT METHOD COSTS TABLE
============================ */

export const paymentMethodCosts = pgTable(
  "payment_method_costs",
  {
    id: serial("id").primaryKey(),

    method: paymentCostMethodEnum("method").notNull(),

    mode: paymentCostModeEnum("mode").notNull(),

    // Percentage expressed in BASIS POINTS (1 bps = 0.01%)
    // 1.5% = 150 bps, 5% = 500 bps
    // Integer math avoids floating-point drift on money.
    percentageBps: integer("percentage_bps").notNull().default(0),

    // Fixed amount in cents. €0.25 = 25, €5.00 = 500
    fixedAmount: bigint("fixed_amount", { mode: "number" })
      .notNull()
      .default(0),

    // Toggle without deleting — useful when a provider is paused
    isActive: boolean("is_active").notNull().default(true),

    // Audit
    updatedBy: integer("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return {
      // Only one row per method
      uniqueMethod: unique("unique_payment_method_cost").on(table.method),
    };
  }
);