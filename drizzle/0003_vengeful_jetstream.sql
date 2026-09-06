CREATE TABLE "coin_submission_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"category" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coin_submission_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"chain" text NOT NULL,
	"contract_address" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coin_submission_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"provider" text,
	"label" text,
	"url" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coin_submissions" ADD COLUMN "submitted_by_user_id" text;--> statement-breakpoint
ALTER TABLE "coin_submission_categories" ADD CONSTRAINT "coin_submission_categories_submission_id_coin_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."coin_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coin_submission_contracts" ADD CONSTRAINT "coin_submission_contracts_submission_id_coin_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."coin_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coin_submission_links" ADD CONSTRAINT "coin_submission_links_submission_id_coin_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."coin_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coin_submission_categories_submission_category_unique" ON "coin_submission_categories" USING btree ("submission_id","category");--> statement-breakpoint
CREATE INDEX "coin_submission_categories_submission_idx" ON "coin_submission_categories" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "coin_submission_contracts_submission_idx" ON "coin_submission_contracts" USING btree ("submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coin_submission_contracts_submission_sort_unique" ON "coin_submission_contracts" USING btree ("submission_id","sort_order");--> statement-breakpoint
CREATE INDEX "coin_submission_links_submission_idx" ON "coin_submission_links" USING btree ("submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coin_submission_links_submission_kind_unique" ON "coin_submission_links" USING btree ("submission_id","kind");--> statement-breakpoint
ALTER TABLE "coin_submissions" ADD CONSTRAINT "coin_submissions_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;