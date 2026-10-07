ALTER TABLE "event_tickets" ALTER COLUMN "limit" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "event_tickets" ADD CONSTRAINT "unique_event_ticket" UNIQUE("event_id","category_id","type_id");