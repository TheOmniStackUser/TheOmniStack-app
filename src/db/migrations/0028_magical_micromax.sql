CREATE TYPE "public"."override_status" AS ENUM('auto', 'online', 'offline');--> statement-breakpoint
CREATE TABLE "system_status_override" (
	"service" "system_service" PRIMARY KEY NOT NULL,
	"status" "override_status" DEFAULT 'auto' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
