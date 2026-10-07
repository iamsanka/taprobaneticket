import {
  pgTable,
  serial,
  integer,
  varchar,
  unique,
} from "drizzle-orm/pg-core";

export const eventSequences = pgTable(
  "event_sequences",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id").notNull(),
    sequenceCode: varchar("sequence_code", { length: 64 }).notNull(),
  },
  (table) => {
    return {
      // Each event gets exactly one sequence code
      uniqueEventId: unique("unique_event_sequences_event").on(table.eventId),
      // Sequence codes must be globally unique
      uniqueSequenceCode: unique("unique_event_sequences_code").on(
        table.sequenceCode
      ),
    };
  }
);