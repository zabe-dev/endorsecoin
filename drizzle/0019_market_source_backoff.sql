ALTER TABLE "market_sources" ADD COLUMN IF NOT EXISTS "failure_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "market_sources" ADD COLUMN IF NOT EXISTS "next_attempt_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_sources_next_attempt_idx"
  ON "market_sources" USING btree ("provider", "next_attempt_at");
