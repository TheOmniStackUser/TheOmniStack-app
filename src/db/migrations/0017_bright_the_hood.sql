ALTER TABLE "companies" ADD COLUMN "sync_notification_email" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "brand" text;--> statement-breakpoint
ALTER TABLE "unmapped_marketplace_products" ADD COLUMN "brand" text;