ALTER TABLE "order_items" ALTER COLUMN "quantity" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "quantity" SET DEFAULT '1';--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "position" numeric(4, 0) DEFAULT '0' NOT NULL;