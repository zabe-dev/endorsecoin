CREATE TABLE IF NOT EXISTS "coin_claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "coin_id" integer NOT NULL,
  "user_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "coin_claims_coin_id_coins_id_fk" FOREIGN KEY ("coin_id") REFERENCES "public"."coins"("id") ON DELETE cascade,
  CONSTRAINT "coin_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "coin_claims_coin_unique" ON "coin_claims" USING btree ("coin_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coin_claims_user_idx" ON "coin_claims" USING btree ("user_id");
