CREATE TABLE "ticket_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"price" integer NOT NULL,
	"limit" integer NOT NULL,
	"visibility" varchar(20) DEFAULT 'public' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_categories" ADD CONSTRAINT "ticket_categories_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;