CREATE TABLE "banner_ads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"placement" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"desktop_image_url" text NOT NULL,
	"mobile_image_url" text,
	"target_url" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"priority" integer DEFAULT 1 NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"assigned_by_user_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "banner_ads" ADD CONSTRAINT "banner_ads_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "banner_ads_placement_status_idx" ON "banner_ads" USING btree ("placement","status");
--> statement-breakpoint
CREATE INDEX "banner_ads_schedule_idx" ON "banner_ads" USING btree ("starts_at","expires_at");
