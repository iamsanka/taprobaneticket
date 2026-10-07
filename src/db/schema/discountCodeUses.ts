import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { discountCodes } from "./discountCodes";
import { orders } from "./orders";

/* ============================
   DISCOUNT CODE USES
   Audit trail — one row per redemption.
============================ */

export const discountCodeUses = pgTable(
  "discount_code_uses",
  {
    id: serial("id").primaryKey(),

    discountCodeId: integer("discount_code_id")
      .notNull()
      .references(() => discountCodes.id, { onDelete: "cascade" }),

    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),

    // Snapshot of the code string at the time of use, so if the code
    // is later renamed/deleted we still know what was redeemed.
    code: varchar("code", { length: 32 }).notNull(),

    // Snapshot of the customer email (redundant with orders but useful
    // for quick filtering without a join)
    customerEmail: varchar("customer_email", { length: 255 }).notNull(),

    // Snapshot of the percentage at the time of use
    percentage: integer("percentage").notNull(),

    // How much was actually discounted, in cents
    discountAmount: integer("discount_amount").notNull(),

    usedAt: timestamp("used_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return {
      // One use per order — prevents double-redemption on the same order
      uniqueOrderUse: unique("unique_discount_code_order").on(table.orderId),
      // Fast lookup for "how many times was this code used"
      idxCode: index("idx_discount_code_uses_code").on(table.discountCodeId),
    };
  }
);