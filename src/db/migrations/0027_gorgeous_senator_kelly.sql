CREATE TYPE "public"."incident_status" AS ENUM('investigating', 'identified', 'monitoring', 'resolved', 'maintenance');--> statement-breakpoint
CREATE TYPE "public"."system_service" AS ENUM('core_api', 'amazon', 'otto', 'shopify', 'aboutyou', 'dhl', 'hermes', 'limango', 'mirakl_decathlon', 'mirakl_decathlon_eu', 'mirakl_mediamarkt', 'mirakl_custom', 'kaufland', 'ebay', 'woocommerce', 'shopware');--> statement-breakpoint
CREATE TABLE "system_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service" "system_service" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "incident_status" DEFAULT 'investigating' NOT NULL,
	"start_time" timestamp with time zone DEFAULT now() NOT NULL,
	"end_time" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_status_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service" "system_service" NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"uptime_data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
