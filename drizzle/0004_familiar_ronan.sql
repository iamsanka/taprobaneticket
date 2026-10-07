CREATE TABLE "ticket_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"price" integer NOT NULL,
	"limit" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_category_id_ticket_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."ticket_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_categories" DROP COLUMN "price";--> statement-breakpoint
ALTER TABLE "ticket_categories" DROP COLUMN "limit";--> statement-breakpoint
ALTER TABLE "ticket_categories" DROP COLUMN "visibility";