CREATE TABLE IF NOT EXISTS "mailing_list_subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"source" text DEFAULT 'homepage' NOT NULL,
	"status" text DEFAULT 'subscribed' NOT NULL,
	"subscribed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mailing_list_subscribers_email_unique" ON "mailing_list_subscribers" USING btree ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mailing_list_subscribers_status_idx" ON "mailing_list_subscribers" USING btree ("status");
