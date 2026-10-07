ALTER TABLE "events" ADD COLUMN "event_time" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "location" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "start_date";--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "end_date";