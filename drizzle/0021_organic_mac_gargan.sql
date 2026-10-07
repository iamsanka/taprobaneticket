CREATE TABLE "discount_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"code" varchar(32) NOT NULL,
	"percentage" integer NOT NULL,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_discount_codes_code" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "discount_code_uses" (
	"id" serial PRIMARY KEY NOT NULL,
	"discount_code_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"code" varchar(32) NOT NULL,
	"customer_email" varchar(255) NOT NULL,
	"percentage" integer NOT NULL,
	"discount_amount" integer NOT NULL,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_discount_code_order" UNIQUE("order_id")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_code" varchar(32);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_amount" bigint;--> statement-breakpoint
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_code_uses" ADD CONSTRAINT "discount_code_uses_discount_code_id_discount_codes_id_fk" FOREIGN KEY ("discount_code_id") REFERENCES "public"."discount_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_code_uses" ADD CONSTRAINT "discount_code_uses_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_discount_codes_event" ON "discount_codes" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_discount_code_uses_code" ON "discount_code_uses" USING btree ("discount_code_id");