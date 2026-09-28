ALTER TABLE "companies" ADD COLUMN "gpsr_details" jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "sale_start_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "sale_end_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "gpsr_details" jsonb;