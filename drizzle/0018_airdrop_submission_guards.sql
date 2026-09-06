DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'airdrop_submissions_winners_count_check'
      AND conrelid = 'airdrop_submissions'::regclass
  ) THEN
    ALTER TABLE "airdrop_submissions"
      ADD CONSTRAINT "airdrop_submissions_winners_count_check"
      CHECK ("winners_count" > 0) NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'airdrop_submissions_date_order_check'
      AND conrelid = 'airdrop_submissions'::regclass
  ) THEN
    ALTER TABLE "airdrop_submissions"
      ADD CONSTRAINT "airdrop_submissions_date_order_check"
      CHECK ("ends_at" > "starts_at") NOT VALID;
  END IF;
END $$;
