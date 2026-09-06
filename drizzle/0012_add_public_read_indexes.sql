CREATE INDEX IF NOT EXISTS "admin_audit_logs_created_idx" ON "admin_audit_logs" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "banner_ads_active_lookup_idx" ON "banner_ads" USING btree ("placement","status","starts_at","expires_at","priority");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "change_requests_status_created_idx" ON "change_requests" USING btree ("status","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coin_boosts_status_schedule_idx" ON "coin_boosts" USING btree ("status","starts_at","expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coin_links_coin_idx" ON "coin_links" USING btree ("coin_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coin_promotions_status_schedule_idx" ON "coin_promotions" USING btree ("status","starts_at","expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coin_submissions_status_type_created_idx" ON "coin_submissions" USING btree ("status","submission_type","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coin_submissions_coin_idx" ON "coin_submissions" USING btree ("coin_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coin_submissions_user_idx" ON "coin_submissions" USING btree ("submitted_by_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coin_votes_created_idx" ON "coin_votes" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coin_votes_user_created_idx" ON "coin_votes" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coin_watchlists_coin_created_idx" ON "coin_watchlists" USING btree ("coin_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coin_watchlists_user_created_idx" ON "coin_watchlists" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coins_listing_status_idx" ON "coins" USING btree ("listing_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coins_status_submitted_idx" ON "coins" USING btree ("listing_status","submitted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coins_status_launch_idx" ON "coins" USING btree ("listing_status","launch_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coins_status_presale_idx" ON "coins" USING btree ("listing_status","is_presale");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coins_status_category_idx" ON "coins" USING btree ("listing_status","category");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coins_status_chain_idx" ON "coins" USING btree ("listing_status","chain");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_sources_error_idx" ON "market_sources" USING btree ("provider","last_error_code","external_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_sources_sync_idx" ON "market_sources" USING btree ("provider","last_market_sync_at");
