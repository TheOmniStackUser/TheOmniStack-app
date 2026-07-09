ALTER TABLE "companies" ADD COLUMN "canceled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "cancel_effective_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "cancel_reason" jsonb;