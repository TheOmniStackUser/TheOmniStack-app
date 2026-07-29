CREATE TYPE "public"."sync_log_status" AS ENUM('success', 'error', 'partial');--> statement-breakpoint
CREATE TABLE "product_sync_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"marketplace" text NOT NULL,
	"status" "sync_log_status" NOT NULL,
	"total_updates" numeric NOT NULL,
	"synced_skus" jsonb NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "product_sync_logs" ADD CONSTRAINT "product_sync_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_sync_logs" ADD CONSTRAINT "product_sync_logs_integration_id_marketplace_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."marketplace_integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_sync_logs_company_idx" ON "product_sync_logs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "product_sync_logs_integration_idx" ON "product_sync_logs" USING btree ("integration_id");--> statement-breakpoint
CREATE INDEX "product_sync_logs_created_at_idx" ON "product_sync_logs" USING btree ("started_at");