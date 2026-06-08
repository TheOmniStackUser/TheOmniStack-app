ALTER TYPE "public"."marketplace" ADD VALUE 'mirakl_custom';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "msrp" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "reduced_price" numeric(12, 2);