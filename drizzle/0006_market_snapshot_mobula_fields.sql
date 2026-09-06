ALTER TABLE "market_snapshots" ADD COLUMN "liquidity_usd" numeric(30, 2);
--> statement-breakpoint
ALTER TABLE "market_snapshots" ADD COLUMN "fdv_usd" numeric(30, 2);
--> statement-breakpoint
ALTER TABLE "market_snapshots" ADD COLUMN "total_supply" numeric(40, 8);
--> statement-breakpoint
ALTER TABLE "market_snapshots" ADD COLUMN "holders_count" integer;
