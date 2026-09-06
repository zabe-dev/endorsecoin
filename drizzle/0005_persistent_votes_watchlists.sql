CREATE TABLE "coin_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coin_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"week_starts_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coin_watchlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coin_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coin_votes" ADD CONSTRAINT "coin_votes_coin_id_coins_id_fk" FOREIGN KEY ("coin_id") REFERENCES "public"."coins"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "coin_votes" ADD CONSTRAINT "coin_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "coin_watchlists" ADD CONSTRAINT "coin_watchlists_coin_id_coins_id_fk" FOREIGN KEY ("coin_id") REFERENCES "public"."coins"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "coin_watchlists" ADD CONSTRAINT "coin_watchlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "coin_votes_coin_created_idx" ON "coin_votes" USING btree ("coin_id","created_at");
--> statement-breakpoint
CREATE INDEX "coin_votes_coin_week_idx" ON "coin_votes" USING btree ("coin_id","week_starts_at");
--> statement-breakpoint
CREATE INDEX "coin_votes_user_coin_created_idx" ON "coin_votes" USING btree ("user_id","coin_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "coin_watchlists_user_coin_unique" ON "coin_watchlists" USING btree ("user_id","coin_id");
--> statement-breakpoint
CREATE INDEX "coin_watchlists_coin_idx" ON "coin_watchlists" USING btree ("coin_id");
--> statement-breakpoint
CREATE INDEX "coin_watchlists_user_idx" ON "coin_watchlists" USING btree ("user_id");
