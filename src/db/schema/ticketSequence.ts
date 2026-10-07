import { pgTable, serial, integer } from "drizzle-orm/pg-core";

export const ticketSequence = pgTable("ticket_sequence", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull(),
  nextTicketNo: integer("next_ticket_no").notNull().default(1),
});
