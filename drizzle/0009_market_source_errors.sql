ALTER TABLE "market_sources" ADD COLUMN IF NOT EXISTS "last_error_code" text;
--> statement-breakpoint
ALTER TABLE "market_sources" ADD COLUMN IF NOT EXISTS "last_error_message" text;
--> statement-breakpoint
ALTER TABLE "market_sources" ADD COLUMN IF NOT EXISTS "last_error_at" timestamp with time zone;
