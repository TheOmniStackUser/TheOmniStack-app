CREATE TABLE "unmapped_marketplace_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"marketplace" "marketplace" NOT NULL,
	"marketplace_sku" text NOT NULL,
	"marketplace_product_id" text,
	"title" text NOT NULL,
	"price" numeric(12, 2),
	"stock" numeric(10, 0),
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unq_company_marketplace_unmapped_sku" UNIQUE("company_id","marketplace","marketplace_sku")
);
--> statement-breakpoint
ALTER TABLE "unmapped_marketplace_products" ADD CONSTRAINT "unmapped_marketplace_products_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "unmapped_company_idx" ON "unmapped_marketplace_products" USING btree ("company_id");