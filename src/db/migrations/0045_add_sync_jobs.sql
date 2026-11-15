CREATE TABLE IF NOT EXISTS "sync_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"type" text DEFAULT 'price_sync' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"params" jsonb,
	"result" jsonb,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_jobs_company_idx" ON "sync_jobs" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_jobs_created_at_idx" ON "sync_jobs" ("started_at");
