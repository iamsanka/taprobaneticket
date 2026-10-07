CREATE TABLE "event_sequences" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"sequence_code" varchar(64) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"sequence_code" varchar(64) NOT NULL,
	"order_number" varchar(64) NOT NULL,
	"customer_name" varchar(255) NOT NULL,
	"customer_email" varchar(255) NOT NULL,
	"customer_phone" varchar(64) NOT NULL,
	"total_price" bigint NOT NULL,
	"stripe_payment_intent_id" varchar(255) NOT NULL,
	"status" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"event_id" integer NOT NULL,
	"ticket_type_id" integer NOT NULL,
	"ticket_number" varchar(64) NOT NULL,
	"qr_code_data" varchar(1024) NOT NULL,
	"is_scanned" boolean DEFAULT false NOT NULL
);
