CREATE TABLE "event_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	"type_id" integer NOT NULL,
	"price" integer NOT NULL,
	"limit" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_categories" DROP CONSTRAINT "ticket_categories_event_id_events_id_fk";
--> statement-breakpoint
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_category_id_ticket_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."ticket_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_type_id_ticket_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."ticket_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_categories" DROP COLUMN "event_id";