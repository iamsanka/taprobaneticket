CREATE TABLE "app_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"vat_rate_percent" numeric(5, 2) DEFAULT '13.50' NOT NULL,
	"whatsapp_number" text DEFAULT '358442363616' NOT NULL,
	"whatsapp_display" text DEFAULT '+358 442363616' NOT NULL,
	"brand_name" text DEFAULT 'Taprobane Entertainment' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
