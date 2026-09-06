CREATE INDEX IF NOT EXISTS "market_snapshots_coin_recorded_lookup_idx"
  ON "market_snapshots" USING btree ("coin_id", "recorded_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coin_votes_week_coin_idx"
  ON "coin_votes" USING btree ("week_starts_at", "coin_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coin_watchlists_user_created_coin_idx"
  ON "coin_watchlists" USING btree ("user_id", "created_at" DESC, "coin_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coin_submissions_requester_type_created_idx"
  ON "coin_submissions" USING btree ("requester_email", "submission_type", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coin_submissions_coin_type_created_idx"
  ON "coin_submissions" USING btree ("coin_id", "submission_type", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coin_boosts_coin_schedule_idx"
  ON "coin_boosts" USING btree ("coin_id", "status", "starts_at", "expires_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coin_promotions_rank_schedule_idx"
  ON "coin_promotions" USING btree ("status", "starts_at", "expires_at", "priority", "coin_id");
