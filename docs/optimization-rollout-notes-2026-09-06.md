# EndorseCoin optimization rollout notes

Updated 6 September 2026.

These notes explain the optimization work that has been committed during this pass and the environment variables you may want to set in Coolify. The goal of the changes is to keep the same site behavior while reducing repeated database/API work, making cache failures recover cleanly, and moving background maintenance away from visitor requests.

## Environment variables

### Required app basics

- `DATABASE_URL` — PostgreSQL connection string used by the app and Drizzle migrations.
- `BETTER_AUTH_SECRET` — secret used by Better Auth. Generate one long random value for production.
- `BETTER_AUTH_URL` — public app URL, for example `https://endorsecoin.com` in production.
- `CLOUDFLARE_TURNSTILE_SECRET_KEY` — server secret for verifying Turnstile submissions.
- `NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY` — public Turnstile site key used by the browser.

### Redis and cache tuning

- `REDIS_URL` — Redis connection string. For your TLS Redis setup this should include the correct username/password if using ACL users.
- `REDIS_RETRY_PAUSE_MS` — how long the app pauses Redis usage after a Redis connection failure. Default: `30000`.
- `COIN_INTERACTION_CACHE_SECONDS` — public vote/watchlist summary cache TTL. Default: `30`.
- `DISCOVERY_CACHE_SECONDS` — homepage/discovery payload cache TTL. Default: `30`.
- `LEADERBOARD_CACHE_SECONDS` — leaderboard ID selection cache TTL. Default: `30`.
- `PROMOTED_COINS_CACHE_SECONDS` — promoted coin cache TTL. Default: `60`.
- `PUBLIC_COIN_LIST_CACHE_SECONDS` — public coin list cache TTL. Default: `60`.
- `PUBLIC_COIN_DETAIL_CACHE_SECONDS` — public coin detail cache TTL. Default: `60`.
- `PUBLIC_WATCHLIST_CACHE_SECONDS` — public watchlist cache TTL. Default: `60`.
- `PUBLIC_AIRDROP_LIST_CACHE_SECONDS` — public airdrop page cache TTL. Default: `60`.
- `BANNER_AD_CACHE_SECONDS` — banner rotation cache TTL. Default: `60`.
- `TOPBAR_SUMMARY_CACHE_SECONDS` — topbar totals cache TTL. Default: `60`.

### Scheduled jobs and protected endpoints

- `MAINTENANCE_SECRET` — bearer token for `/api/maintenance/run`. Use this in a Coolify scheduled request: `Authorization: Bearer <MAINTENANCE_SECRET>`.
- `MARKET_SYNC_SECRET` — bearer token for `/api/market/sync`. Use this if you schedule market sync separately from general maintenance.
- `TOPBAR_PRICE_REFRESH_SECRET` — bearer token for the topbar price refresh endpoint.
- `DIAGNOSTICS_TOKEN` — shared token accepted by diagnostics-style endpoints. You can use this instead of the more specific tokens below.
- `METRICS_TOKEN` — bearer token for `/api/metrics` if you do not want to use `DIAGNOSTICS_TOKEN`.
- `HEALTH_READINESS_TOKEN` — bearer token for `/api/health/readiness` if you do not want to use `DIAGNOSTICS_TOKEN`.

For production, prefer using one long random value for `MAINTENANCE_SECRET`, one for `MARKET_SYNC_SECRET`, and one for `TOPBAR_PRICE_REFRESH_SECRET`. They protect different actions, so keeping them separate limits damage if one token leaks.

### Topbar prices

- `TOPBAR_PRICE_FETCH_ON_MISS` — when `true`, a normal visitor request may fetch prices if Redis has no cached value. When `false`, visitors only read cached or last-good data. For production, use `false` once a scheduled refresh is configured.
- `TOPBAR_PRICE_CACHE_SECONDS` — active topbar price cache TTL. Default: `120`.
- `TOPBAR_PRICE_LAST_GOOD_SECONDS` — how long last-good topbar prices are retained as fallback. Default: `86400`.
- `TOPBAR_PRICE_DAILY_LIMIT` — safety limit for price refresh calls. Default: `480`.
- `TOPBAR_BINANCE_API_BASE_URL` — optional custom Binance API base URL.
- `TOPBAR_BINANCE_FALLBACK_BASE_URLS` — comma-separated Binance fallback URLs.

### Mobula market sync

- `MOBULA_API_KEY` — Mobula API key.
- `MOBULA_API_KEYS` — optional comma-separated list of Mobula API keys. The app rotates through them.
- `MOBULA_API_BASE_URL` — Mobula API base URL. Default: `https://api.mobula.io`.
- `MOBULA_REQUEST_TIMEOUT_MS` — request timeout. Default: `8000`.
- `MOBULA_REQUEST_SPACING_MS` — pacing between Mobula requests. Default: `1050`.
- `MARKET_SYNC_CACHE_SECONDS` — how old a snapshot must be before it is considered stale. Default: `900`.
- `MARKET_SYNC_LIMIT` — default number of coins to refresh per sync run. Default: `7`.
- `MARKET_SYNC_MAX_LIMIT` — hard maximum accepted by the sync worker. Default: `120`.
- `MARKET_SYNC_ON_PAGE` — when `true`, public reads can trigger market refreshes. For production, keep this `false` and use scheduled sync.
- `MARKET_SYNC_LOCK_TTL_MS` — Redis lock TTL for market sync. Default: `120000`.
- `MARKET_SYNC_ERROR_BACKOFF_MS` — first retry delay after a market provider error. Default: `900000`.
- `MARKET_SYNC_MAX_ERROR_BACKOFF_MS` — maximum retry delay after repeated provider errors. Default: `43200000`.

Older aliases `MARKET_DATA_SYNC_LIMIT`, `MARKET_DATA_MAX_SYNC_LIMIT`, `MARKET_DATA_CACHE_SECONDS`, `MARKET_DATA_SYNC_ON_PAGE`, and `MOBULA_SYNC_LOCK_TTL_MS` are still read by the code as fallback names, but the `MARKET_SYNC_*` names are the cleaner ones to use going forward.

### R2 image storage

- `R2_ACCOUNT_ID` or `R2_ENDPOINT` — R2 endpoint configuration. Use one of these.
- `R2_ACCESS_KEY_ID` — R2 API access key.
- `R2_SECRET_ACCESS_KEY` — R2 API secret.
- `R2_BUCKET_NAME` — bucket for submitted project logos.
- `R2_PUBLIC_URL` — public bucket URL or custom domain for serving stored assets.

Submitted logos are uploaded with long immutable cache headers. The cropper now keeps cropped output as PNG consistently, so the MIME type, file extension, and data URL match.

### Optional development helper

- `DEV_RESET_KEEP_USER_EMAIL` — optional email to preserve when running the local dev reset script. If empty, the reset script skips preservation.

## Changes shipped in this optimization pass

### Reliability and cache behavior

- Redis reconnect handling now recovers after a failed connection instead of staying paused until process restart.
- Cache versioning now avoids the first-invalidation collision where a missing key and first increment could both resolve to the same namespace.
- JSON cache rebuilds use in-process in-flight dedupe, so concurrent requests for the same cold key share one loader.
- Cache keys for discovery inputs are normalized so the same logical filters do not create unnecessary duplicate cache entries.
- Redis debug/cache metrics were added so hits, misses, skips, writes, and loader timings can be inspected.

### Scheduled maintenance

- Expired presales, deletion requests, rate-limit cleanup, topbar price refresh, and banner status sync now run through the protected maintenance endpoint instead of being attached to public page reads.
- Rate-limit cleanup is no longer performed on every limited request.
- The in-memory rate-limit fallback is bounded so it cannot grow forever during database trouble.

### Topbar prices

- Topbar price refresh can run as a scheduled job.
- Last-good topbar prices are cached so the UI can keep showing recent data if a provider fails.
- `TOPBAR_PRICE_FETCH_ON_MISS` lets production avoid live provider fetches during visitor requests once scheduling is in place.

### Market sync

- Market sync now honors the requested batch limit and selects only latest snapshots for candidates.
- Failed market provider lookups record retry backoff, so broken or temporarily failing coins do not get hammered every run.
- Stale sync candidate ordering now prioritizes visible coins first: promoted coins, boosted coins, watched coins, then the long tail.
- Invalid address formats are skipped and recorded instead of repeatedly calling the provider.

### Leaderboard and coin ranks

- Leaderboard pagination now has stable tie-breakers and handles out-of-range page requests without losing the real total count.
- Coin detail pages now use EndorseCoin community rank instead of provider market rank. Mobula market rank remains stored as market metadata.
- Vote recording now uses a PostgreSQL transaction advisory lock per user/coin, so concurrent clicks cannot pass the 12-hour cooldown check twice.
- Missing interaction-table fallbacks now use PostgreSQL missing-relation detection instead of loose string matching.

### Airdrops and submissions

- Airdrop submission database guards were added for positive winner counts and end date after start date.
- Airdrop missing-table handling uses SQLSTATE-based relation detection.
- Approved-project lookup uses an exact-match server endpoint instead of sending a large project dropdown to the browser.
- Submission success-only effects and auth modal loading were deferred so the initial form bundle is lighter.

### Admin dashboard

- Admin dashboard tabs now load the selected tab instead of loading all admin data at once.
- Admin tables now use server-side pagination for tab data, reducing large reads for coins, users, submissions, airdrops, promotions, banners, and reports.
- Admin overview was reworked into a cleaner compact summary.

### UI and content updates

- Footer layout was simplified and compacted.
- Airdrops page moved from an awkward wide table into paginated cards.
- Airdrop ad placements use the same banner components and rotation data as the rest of the site.
- `/advertise` copy now describes the new basic and premium banner locations.

## What to do in Coolify

1. Add the env vars you need from the sections above.
2. Generate long random values for `MAINTENANCE_SECRET`, `MARKET_SYNC_SECRET`, and `TOPBAR_PRICE_REFRESH_SECRET`.
3. Add scheduled requests:
   - `POST https://endorsecoin.com/api/maintenance/run` with `Authorization: Bearer <MAINTENANCE_SECRET>`.
   - Optionally `GET or POST https://endorsecoin.com/api/market/sync?limit=7` with `Authorization: Bearer <MARKET_SYNC_SECRET>` if you want separate market-sync pacing.
4. Keep `MARKET_SYNC_ON_PAGE=false` in production.
5. Once scheduled topbar refresh is working, set `TOPBAR_PRICE_FETCH_ON_MISS=false` in production.
6. Run pending migrations after deployment with `npm run db:migrate` if Coolify does not already do this during deploy.
7. After deploy, check `/api/health/readiness` and `/api/metrics` with the correct bearer token.

## Remaining future optimizations

- Add real query-plan benchmarking before creating aggregate tables or removing indexes.
- Consider current-market and weekly aggregate tables when traffic/data volume grows.
- Build server-side image variants for logos and cards after the current R2 flow is stable.
- Split the large admin client file into smaller components for maintainability.
- Add behavioral tests for vote cooldowns, Turnstile retries, airdrop pagination, banner windows, and migration fresh/upgrade paths.
