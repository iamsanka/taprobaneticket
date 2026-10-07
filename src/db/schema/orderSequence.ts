import { pgTable, serial, integer } from "drizzle-orm/pg-core";

export const orderSequence = pgTable("order_sequence", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull(),
  nextOrderNo: integer("next_order_no").notNull().default(1),
});
