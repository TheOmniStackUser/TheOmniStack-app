ALTER TABLE "product_mappings" DROP CONSTRAINT "unq_company_marketplace_listing";--> statement-breakpoint
ALTER TABLE "unmapped_marketplace_products" DROP CONSTRAINT "unq_company_marketplace_unmapped_sku";--> statement-breakpoint
ALTER TABLE "product_mappings" ADD COLUMN "integration_id" uuid;--> statement-breakpoint
ALTER TABLE "unmapped_marketplace_products" ADD COLUMN "integration_id" uuid;--> statement-breakpoint
ALTER TABLE "product_mappings" ADD CONSTRAINT "product_mappings_integration_id_marketplace_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."marketplace_integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unmapped_marketplace_products" ADD CONSTRAINT "unmapped_marketplace_products_integration_id_marketplace_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."marketplace_integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_mappings" ADD CONSTRAINT "unq_company_marketplace_listing" UNIQUE("company_id","integration_id","marketplace_sku");--> statement-breakpoint
ALTER TABLE "unmapped_marketplace_products" ADD CONSTRAINT "unq_company_marketplace_unmapped_sku" UNIQUE("company_id","integration_id","marketplace_sku");