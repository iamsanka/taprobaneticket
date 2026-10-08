CREATE TABLE "raffles" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"name" varchar(128) NOT NULL,
	"winner_count" integer NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"drawn_at" timestamp with time zone,
	"drawn_by" integer,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raffle_winners" (
	"id" serial PRIMARY KEY NOT NULL,
	"raffle_id" integer NOT NULL,
	"position" integer NOT NULL,
	"customer_email" varchar(255) NOT NULL,
	"customer_name" varchar(255),
	"order_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_raffle_winners_raffle_position" UNIQUE("raffle_id","position")
);
--> statement-breakpoint
ALTER TABLE "raffles" ADD CONSTRAINT "raffles_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raffles" ADD CONSTRAINT "raffles_drawn_by_users_id_fk" FOREIGN KEY ("drawn_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raffles" ADD CONSTRAINT "raffles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raffle_winners" ADD CONSTRAINT "raffle_winners_raffle_id_raffles_id_fk" FOREIGN KEY ("raffle_id") REFERENCES "public"."raffles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_raffles_event" ON "raffles" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_raffle_winners_raffle" ON "raffle_winners" USING btree ("raffle_id");