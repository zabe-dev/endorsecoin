CREATE INDEX IF NOT EXISTS "market_snapshots_coin_recorded_lookup_idx"
  ON "market_snapshots" USING btree ("coin_id", "recorded_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coins_status_normalized_name_idx"
  ON "coins" USING btree ("listing_status", lower(regexp_replace(trim("name"), '[[:space:]]+', ' ', 'g')));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coins_status_normalized_symbol_idx"
  ON "coins" USING btree ("listing_status", lower(regexp_replace(trim("symbol"), '[[:space:]]+', ' ', 'g')));
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.airdrop_submissions') IS NOT NULL
    AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'airdrop_submissions_winners_count_check'
      AND conrelid = to_regclass('public.airdrop_submissions')
  ) THEN
    ALTER TABLE "airdrop_submissions"
      ADD CONSTRAINT "airdrop_submissions_winners_count_check"
      CHECK ("winners_count" > 0)
      NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.airdrop_submissions') IS NOT NULL
    AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'airdrop_submissions_date_order_check'
      AND conrelid = to_regclass('public.airdrop_submissions')
  ) THEN
    ALTER TABLE "airdrop_submissions"
      ADD CONSTRAINT "airdrop_submissions_date_order_check"
      CHECK ("ends_at" > "starts_at")
      NOT VALID;
  END IF;
END $$;
