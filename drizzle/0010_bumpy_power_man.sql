CREATE TABLE "order_sequence" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"next_order_no" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_sequence" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"next_ticket_no" integer DEFAULT 1 NOT NULL
);
