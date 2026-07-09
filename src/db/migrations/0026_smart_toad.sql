ALTER TABLE "users" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_login_app" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "registered_app" text DEFAULT 'TheOmniStack' NOT NULL;