CREATE TYPE "public"."price_modifier_type" AS ENUM('none', 'percentage', 'fixed');--> statement-breakpoint
CREATE TABLE "product_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"marketplace" "marketplace" NOT NULL,
	"marketplace_sku" text NOT NULL,
	"marketplace_product_id" text,
	"sync_stock" boolean DEFAULT true NOT NULL,
	"sync_price" boolean DEFAULT false NOT NULL,
	"price_modifier_type" "price_modifier_type" DEFAULT 'none' NOT NULL,
	"price_modifier_value" numeric(12, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unq_company_marketplace_listing" UNIQUE("company_id","marketplace","marketplace_sku")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"parent_id" uuid,
	"sku" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"ean" text,
	"current_stock" numeric(10, 0) DEFAULT '0' NOT NULL,
	"price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"purchase_price" numeric(12, 2),
	"weight" numeric(8, 3),
	"storage_location" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unq_company_sku" UNIQUE("company_id","sku")
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "recipient_company" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "recipient_address_addition" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "recipient_phone" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "buyer_phone" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_company" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_address_addition" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_phone" text;--> statement-breakpoint
ALTER TABLE "product_mappings" ADD CONSTRAINT "product_mappings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_mappings" ADD CONSTRAINT "product_mappings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_parent_id_products_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_mappings_product_idx" ON "product_mappings" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "products_company_idx" ON "products" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "products_parent_idx" ON "products" USING btree ("parent_id");