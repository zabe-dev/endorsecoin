CREATE TABLE IF NOT EXISTS "airdrop_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "coin_id" integer NOT NULL,
  "submitted_by_user_id" text,
  "requester_email" text NOT NULL,
  "name" text NOT NULL,
  "claim_rewards_url" text NOT NULL,
  "description" text NOT NULL,
  "rewards" text NOT NULL,
  "winners_count" integer NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "website" text NOT NULL,
  "social_links" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "airdrop_submissions" ADD CONSTRAINT "airdrop_submissions_coin_id_coins_id_fk" FOREIGN KEY ("coin_id") REFERENCES "public"."coins"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "airdrop_submissions" ADD CONSTRAINT "airdrop_submissions_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "airdrop_submissions_status_created_idx" ON "airdrop_submissions" USING btree ("status", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "airdrop_submissions_coin_status_idx" ON "airdrop_submissions" USING btree ("coin_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "airdrop_submissions_schedule_idx" ON "airdrop_submissions" USING btree ("starts_at", "ends_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "airdrop_submissions_user_idx" ON "airdrop_submissions" USING btree ("submitted_by_user_id");
