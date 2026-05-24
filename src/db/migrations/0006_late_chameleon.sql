ALTER TABLE "companies" ADD COLUMN "new_pending_email" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "email_verification_token" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "email_verified_at" timestamp with time zone;