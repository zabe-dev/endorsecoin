CREATE TABLE "rate_limits" (
  "key" text PRIMARY KEY NOT NULL,
  "action" text NOT NULL,
  "subject" text NOT NULL,
  "count" integer DEFAULT 0 NOT NULL,
  "window_start" timestamp with time zone NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "rate_limits_action_subject_idx" ON "rate_limits" USING btree ("action", "subject");
CREATE INDEX "rate_limits_expires_idx" ON "rate_limits" USING btree ("expires_at");
