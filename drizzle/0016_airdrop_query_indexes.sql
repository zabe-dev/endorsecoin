CREATE INDEX IF NOT EXISTS "coins_status_name_idx"
  ON "coins" USING btree ("listing_status", "name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "airdrop_submissions_status_start_created_idx"
  ON "airdrop_submissions" USING btree ("status", "starts_at", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "airdrop_submissions_created_idx"
  ON "airdrop_submissions" USING btree ("created_at" DESC);
