ALTER TABLE "companies" ADD COLUMN "lexoffice_api_key" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "lexoffice_auto_export" boolean DEFAULT false NOT NULL;