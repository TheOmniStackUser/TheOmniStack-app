ALTER TABLE "company_members" ADD COLUMN "api_key" text;--> statement-breakpoint
ALTER TABLE "dunning_rules" ADD COLUMN "respect_exclusions" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "dunning_rules" ADD COLUMN "sender_email" text;--> statement-breakpoint
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_api_key_unique" UNIQUE("api_key");