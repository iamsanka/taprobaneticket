import {
  pgTable,
  serial,
  integer,
  varchar,
  bigint,
  timestamp,
} from "drizzle-orm/pg-core";

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull(),
  sequenceCode: varchar("sequence_code", { length: 64 }).notNull(),
  orderNumber: varchar("order_number", { length: 64 }).notNull(),
  customerName: varchar("customer_name", { length: 255 }).notNull(),
  customerEmail: varchar("customer_email", { length: 255 }).notNull(),
  customerPhone: varchar("customer_phone", { length: 64 }).notNull(),
  totalPrice: bigint("total_price", { mode: "number" }).notNull(),
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),

  // Set when Stripe webhook confirms payment succeeded
  paidAt: timestamp("paid_at", { withTimezone: true }),

  // Set after ticket delivery email is sent (idempotency guard)
  ticketEmailSentAt: timestamp("ticket_email_sent_at", { withTimezone: true }),

  // ⭐ NEW: discount code snapshot (string) at time of purchase.
  // NULL = no discount was applied.
  // Kept as a snapshot even if the code is later renamed/deleted.
  discountCode: varchar("discount_code", { length: 32 }),

  // ⭐ NEW: how much was discounted on this order, in cents.
  // NULL = no discount. 0 is not used — if no discount, leave NULL.
  discountAmount: bigint("discount_amount", { mode: "number" }),

  // When the order row was first inserted. Reports filter on this.
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),

  // Audit field — updated on any change
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});