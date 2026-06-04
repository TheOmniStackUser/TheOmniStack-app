ALTER TABLE "companies" ADD COLUMN "features_returns_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "features_products_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "companies" SET "features_returns_enabled" = true, "features_products_enabled" = true;