UPDATE "banner_ads"
SET "placement" = 'basic',
    "updated_at" = now()
WHERE "placement" IN ('premium', 'homepage-top', 'homepage-guide-wide');
--> statement-breakpoint
UPDATE "banner_ads"
SET "placement" = 'premium',
    "updated_at" = now()
WHERE "placement" IN ('wide', 'homepage-wide', 'coin-page-wide');
--> statement-breakpoint
UPDATE "banner_ads"
SET "placement" = 'fixed',
    "updated_at" = now()
WHERE "placement" IN ('site-bottom', 'fixed-bottom', 'fixed-footer');
--> statement-breakpoint
UPDATE "banner_ads"
SET "mobile_image_url" = "desktop_image_url",
    "updated_at" = now()
WHERE "mobile_image_url" IS NULL OR btrim("mobile_image_url") = '';
--> statement-breakpoint
DELETE FROM "banner_ads"
WHERE "placement" IN ('coin-page', 'coin_page', 'coin-page-ad')
   OR "placement" NOT IN ('basic', 'premium', 'fixed');
--> statement-breakpoint
ALTER TABLE "banner_ads" ALTER COLUMN "mobile_image_url" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "banner_ads" DROP CONSTRAINT IF EXISTS "banner_ads_placement_check";
--> statement-breakpoint
ALTER TABLE "banner_ads"
ADD CONSTRAINT "banner_ads_placement_check"
CHECK ("placement" IN ('basic', 'premium', 'fixed'));
