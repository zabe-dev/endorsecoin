# EndorseCoin performance and reliability review

Reviewed 6 September 2026. This is an audit, not an implementation change.

The current stack can support the site's functionality. The highest-value work is reducing repeated database work, repairing cache recovery/invalidation, and making scheduled work independent of visitors. A framework rewrite or a larger database is not justified by the evidence collected.

## Scope and evidence

Reviewed public discovery, coin details, airdrops, submissions, account/watchlists, admin data loading, authentication, Redis helpers, rate limiting, market synchronization, image uploads, schema definitions, SQL migrations, dependency declarations, and optimization notes. Inspected the configured PostgreSQL database using a read-only connection, querying table statistics, index definitions, and migration history only.

Database statistics estimated 679 coins, 663 market snapshots, 17 airdrops, 3 votes, and 2 watchlist entries. These are statistics estimates, not exact business counts. The airdrop table and newer query indexes exist. The migration ledger contains 16 entries; the repository journal contains 17. Migration 0014 has no ledger entry, while the later corrective 0015 and index migration 0016 do.

No application records, credentials, or database contents were changed. No production load test, browser bundle profile, Redis server configuration audit, or VPS benchmark was performed. Performance gains below are expected from the code paths, not measured percentage claims. The configured database is not assumed to be identical to every deployed environment.

## Existing optimizations worth keeping

| Area | Current implementation |
| --- | --- |
| Public caching | Redis JSON caching for discovery, leaderboard selections, coin records, interaction summaries, promoted IDs, banners, topbar, public watchlists, and airdrops. |
| Cache invalidation | Versioned namespaces avoid scanning Redis keys. TTLs bound the lifetime of obsolete entries. |
| Query size | Homepage and airdrops use database pagination. Watchlists and dashboard submissions also paginate in SQL. |
| Homepage hydration | Discovery combines IDs from hotspots, promotions, and the main leaderboard and hydrates shared IDs together. |
| Latest data | Coin hydration selects latest market/submission records in SQL. The stale-sync selector uses a lateral latest-snapshot lookup. |
| Personalization | Anonymous discovery can use a shared payload; signed-in interaction state is attached separately in lower-level helpers. |
| Indexes | Active coins, schedules, vote week/coin, user watchlists, submissions, and latest snapshots have useful indexes, confirmed in the configured database. |
| Market API | Page-triggered Mobula refresh defaults off. Sync has pacing, timeouts, in-process deduplication, a Redis lock, and invalid-address tracking. |
| Rate limiting | Shared PostgreSQL upsert implements atomic counters, with an in-memory fallback. This is not currently a Redis limiter. |
| Images | Submission R2 uploads use unique object keys and one-year immutable cache headers. Ad images use lazy loading; chart iframes do too. |
| Rendering | Topbar has a Suspense fallback. Footer banners are deferred. Initial sessions are passed to navigation. |
| Connections | PostgreSQL uses a bounded five-connection pool per initialized client. |

## Fix first: confirmed reliability problems

### 1. Redis does not recover after a connection error

Evidence: `lib/cache/redis.ts`, `getRedisClient()` and `markRedisUnavailable()`.

On error the client becomes `null`. After the retry pause expires, the guard `redisClient !== undefined && redisClient?.status !== 'end'` is still true for `null`, so it returns `null` instead of creating another connection. Database fallback can persist until the module/process restarts.

Change: make the reconnect state explicit; only return an existing non-null usable client. Share the connection-in-progress promise so concurrent requests do not unnecessarily fall back during connection setup. Test failure, pause, recovery, and simultaneous first requests. Preserve certificate verification and database fallback.

### 2. First cache invalidation can leave existing data valid

Evidence: `lib/cache/cache-version.ts`.

A missing version key reads as version 1. Redis INCR on that missing key also produces 1. The first mutation therefore need not change the namespace used by existing cached values.

Change: use a consistent absent-version convention, for example default 0 with atomic increment to 1. Introduce a new cache-key format during rollout so old namespace collisions cannot leak stale values. Test empty Redis, first mutation, subsequent mutations, and recovery after an outage.

### 3. Migration chronology and schema declarations have drifted

Evidence: `drizzle/meta/_journal.json`, `drizzle/0013_speed_query_indexes.sql`, `lib/db/schema.ts`, and the installed Drizzle PostgreSQL migrator.

Journal entries 0012–0014 have timestamps older than 0011. The installed migrator compares migration timestamps with the newest recorded database timestamp, so a database already at 0011 can skip those later-listed entries. This is consistent with 0014 missing from the inspected ledger; it does not prove the exact historical deployment sequence.

The descending `market_snapshots_coin_recorded_lookup_idx` exists in SQL and the database but is absent from the TypeScript schema. Several indexes declared ascending in TypeScript were created descending in handwritten migrations. Snapshot metadata also stops before the latest migrations.

Change: reconcile schema definitions, snapshot generation, and migration history using forward-only corrective migrations with increasing timestamps. Test both an empty database and upgrade from an older release. Do not rewrite applied migrations or remove 0015 simply because it repeats table creation.

### 4. Airdrop error handling hides unrelated failures

Evidence: `features/airdrops/server/airdrop-list.ts`, `isMissingAirdropSubmissionsTable()`; similar handling exists in admin.

Any error message containing `airdrop_submissions` can be treated as a missing table. Drizzle failed-query messages include the table name for many failure types. A timeout, connection error, or invalid column can therefore become an empty result, which can then be cached.

Change: inspect the nested PostgreSQL SQLSTATE and actual relation before handling a missing table. Log unexpected failures and distinguish unavailable data from an empty list. Use the migration deployment check to prevent missing tables in the first place.

### 5. Approved-project lookup stops at 500 projects

Evidence: `features/airdrops/server/approved-projects.ts`, `app/submit/page.tsx`, and the airdrop form's local `projects.find()` matching.

The form receives only the first 500 active projects, ordered by name. A valid project outside that list cannot be selected through the form. Loading this list also happens when the user only wants to submit a coin.

Change: keep the exact-name interaction the user requested, but query a small server endpoint after a debounce. Return only a matching approved project, loading/not-found state, or a clear ambiguity response. Cancel obsolete requests. Add a matching normalized-name index after settling normalization rules; recheck approval during submission. Do not solve this by sending all 10,000 projects to the browser.

### 6. Cropped logo MIME type can disagree with its contents

Evidence: `features/submissions/components/logo-crop-dialog.tsx` exports `canvas.toDataURL('image/png')` but retains `draft.mimeType`; `lib/storage/r2.ts` requires the data URL prefix to match that MIME type.

JPEG/WebP inputs can therefore produce PNG data with a JPEG/WebP label, leading to upload rejection. Fix MIME/extension consistency and validate actual image bytes when adding the image pipeline.

## Highest-value performance changes

### 7. Remove maintenance from public reads

Evidence: `features/coins/server/coin-list.ts`, `presale-expiry.ts`, `delete-requests.ts`, account pages, and `features/ads/server/banner-ads.ts`.

Coin reads call presale conversion and deletion processing before reading data, sometimes even before a cache lookup. Watchlist/dashboard pages call them and then call hydration that invokes them again. Presale processing loads submission history and filters it in JavaScript. Banner cache misses execute status updates before reading active ads.

Change: run idempotent, bounded maintenance through an authenticated scheduled job. Use typed `presale_ends_at` and `scheduled_delete_at` columns for range queries. Keep time-aware read conditions so ads/presales stop displaying at the intended time even if a job runs late. Preserve existing deletion/review semantics and use locking to avoid duplicate work.

### 8. Narrow cache invalidation and prevent duplicate rebuilds

Evidence: `features/coins/server/cache-invalidation.ts`, `lib/cache/json-cache.ts`, and `features/coins/server/discovery.ts`.

Both invalidation helpers discard the supplied coin ID. Each vote invalidates public coins, leaderboard, interaction summaries, public watchlists, and topbar summary. Airdrop caching depends on the public-coins version, so votes also indirectly invalidate airdrop pages and approved-project options. Concurrent misses independently run the loader; writes are asynchronous.

Change: separate coin metadata, market prices, interaction counts, watchlist membership, and moderation visibility into appropriate scopes. Add per-key in-flight deduplication; use a distributed rebuild lock where multiple app instances warrant it. Normalize discovery query values before building keys, bound search input, and deduplicate version reads within a request.

A short stale-data refresh strategy can help market/discovery reads, but never use stale authorization or moderation state indiscriminately. If ranking refresh is batched, return fresh vote/watchlist results to the acting user and make any change in global ranking freshness explicit.

### 9. Reduce repeated leaderboard aggregation

Evidence: `features/coins/server/leaderboard.ts` and `discovery.ts`.

Each leaderboard selection includes latest market/submission selection, weekly/recent vote counts, total/recent watchlist counts, and boosts. A cold homepage requests five selections plus promoted IDs. SQL pagination limits returned rows, but does not eliminate the work needed to aggregate and sort candidates.

Change first: omit irrelevant joins/aggregates for each view and profile the generated SQL. At larger volume, add a current market row per coin and weekly vote/watchlist aggregate tables. Preserve raw vote records, boost rules, the weekly reset, and rolling 24-hour semantics. Rolling counts need expiry-aware buckets or reconciliation; a forever-incrementing counter is not equivalent.

Also fix out-of-range paging: `count(*) over()` yields no total when OFFSET returns no rows, and the current zero-total return prevents the later fallback from running. Add a reliable count/fallback and a unique ID tie-breaker to every order. Similar stable tie-breakers should be added to airdrops and watchlists.

### 10. Reduce rate-limit database writes

Evidence: `lib/security/rate-limit.ts`.

Every consumed limit performs an upsert and triggers deletion of expired rows. Authentication and interactions can invoke this frequently. During database failure, the fallback map is process-local and has no global eviction of abandoned subjects.

Lowest-risk change: schedule expiry cleanup instead of running it on each request and bound fallback memory. If traffic justifies it, use atomic Redis increment/expiry logic with a deliberately designed database fallback. Preserve limits, reset behavior, retry headers, and identity rules across multiple instances and outage recovery. Do not replace the atomic PostgreSQL operation with a non-atomic Redis GET/SET pair.

### 11. Load only the active admin tab

Evidence: `app/admin/dashboard/page.tsx` starts 17 reads, including up to 500 coin submissions, 500 airdrops, and 1,000 sessions, regardless of the active tab. The client component exceeds 2,000 lines.

Change: query overview counters separately, fetch only the selected tab with server pagination, and load detail payloads when a reviewer opens an item. Select only fields actually displayed. Keep current controls, permissions, audit logs, and table styling. The five-connection pool means Promise.all does not make all 17 queries run simultaneously.

### 12. Complete the market-sync strategy

Evidence: `features/coins/server/market-sync.ts`, `app/api/market/sync/route.ts`, and `lib/cache/redis-lock.ts`.

The endpoint accepts a batch limit, but `refreshStaleMarketSnapshots()` slices it back to `defaultSyncLimit`. The sync path loads all historical snapshots for selected IDs despite only using the latest. Prioritization currently orders stale timestamps/coin IDs, not promoted and watched demand. The 120-second lock has no renewal; a larger sequential batch can outlive it. Failure retries beyond invalid-address suppression need a scheduling policy.

Change: honor the requested bounded batch size, select only latest snapshots, renew the lock or claim bounded queue jobs, track next-attempt time with backoff, and prioritize paid/visible/watched coins before the long tail. Define snapshot retention/downsampling before history grows. Keep provider pacing and last-good market values.

Topbar prices still fetch external providers on cache miss, with sequential fallbacks. Suspense already limits their impact on the main content, but persisting last-good values in Redis and refreshing on a schedule would reduce provider dependence during visits.

## Database changes: targeted, not more indexes everywhere

The configured database already has many indexes. Check execution plans and sustained index usage before adding or removing more.

- Normalize frequently filtered business dates out of submission JSON. Public presale SQL currently uses the date while conversion also considers the separate time; one canonical timestamp prevents divergent behavior.
- Use a current-market table if snapshot history becomes a major read cost; keep history separately where needed.
- For substring homepage search (`lower(name) LIKE '%query%'`), evaluate a matching trigram index. The existing ordinary name/symbol B-trees are not the intended solution for arbitrary substring matching. Exact project lookup needs a simpler matching equality index.
- Airdrop CASE ordering depends on current time. Existing schedule indexes do not automatically satisfy that complete sort. Measure before changing it; at larger volume, consider separately ordered live/scheduled/ended query branches while preserving numbered pagination.
- Review overlapping indexes, such as single-column indexes already covered by leading columns of larger indexes. Do not remove them based solely on this small database's statistics.
- Add database checks for valid airdrop date order and positive winner counts, matching validation rules.
- Make vote eligibility atomic: the current recent-vote check followed by insert is not one transaction/lock. The IP-scoped request throttle does not prove that concurrent requests for the same account/coin cannot pass. Preserve the rolling voting interval with a per-user/coin transaction or eligibility row, not a calendar-day unique key.
- Make submission retries idempotent so a lost response cannot create duplicate submissions. Treat this as correctness protection, not merely rate limiting.

PostgreSQL reference: [trigram indexes and LIKE/ILIKE](https://www.postgresql.org/docs/17/pgtrgm.html).

## Browser, images, and libraries

- Keep Next.js, React, Drizzle/postgres, Redis, Better Auth, and Zod. Nothing found requires replacing these libraries.
- AuthModal is statically imported in several surfaces; forms statically import confetti and the cropper. Share the auth modal and dynamically load optional UI or success-only effects. Keep essential content server-rendered and make interactive controls the client boundary where practical. See [Next.js lazy loading](https://nextjs.org/docs/app/guides/lazy-loading).
- The root layout loads four font families. Measure font requests and actual weights used; reduce redundant weights/families only if the current visual appearance can be preserved.
- The cropper always exports a 1024px PNG, even for tiny logos. Produce small WebP variants for tables/cards and larger variants for detail pages, with responsive image selection and explicit dimensions. Keep the original where useful. Enforce dimensions/format on the server rather than trusting client-supplied metadata.
- R2 immutable cache headers are already implemented for submitted logos; the notes are outdated here. This does not prove older objects, imported logos, or externally uploaded ad creatives have the same headers. Verify those separately.
- Avoid automatic lazy-loading of the visible above-the-fold banner if measurement identifies it as the largest-contentful element. Keep below-fold creatives lazy.
- Align Node type definitions with the declared runtime: package.json declares Node 26, while @types/node is 22. This is a tooling consistency issue, not a demonstrated runtime speed issue.
- Measure bundle contents before removing packages. A dependency's presence in package.json does not prove it ships to the browser. No dependency vulnerability/version-currency audit was performed.
- Split large admin/form components and consolidate repeated CSS rules gradually, with screenshot regression checks. Code organization helps maintainability; fewer source lines alone do not establish faster rendering.

## Measurement and rollout

Add production-safe counters and timings for cache hits/misses/rebuilds, Redis failures/recovery, database query count/duration, pool waits, sync freshness, and submission/Turnstile error codes. Current Redis diagnostics are development-only and `/api/health` only checks that the process responds. Keep that liveness endpoint lightweight; add a separate controlled dependency/readiness check.

Benchmark a production build on the VPS with cold cache, warm cache, authenticated traffic, multiple simultaneous votes, Redis outage/recovery, and realistic history. Record p50/p95 response time, SQL work, browser transfer size, LCP/INP/CLS, and error rate. Do not use next dev timings to judge production performance.

Suggested order:

1. Repair Redis recovery/versioning, migration consistency, airdrop error classification, logo MIME consistency, and the 500-project lookup limitation.
2. Add baseline measurements; move maintenance off requests; narrow invalidation and deduplicate rebuilds.
3. Load admin tabs independently; reduce repeated leaderboard/hydration work and rate-limit cleanup.
4. Complete market sync and image variants; defer optional client code.
5. Introduce aggregate/current-market tables or further indexes only where representative query plans justify them.

Regression coverage should protect approved-project validation, submission review, Turnstile retries, vote cooldowns and weekly resets, boosts, watchlists, banner rotation/windows, airdrop ordering/pagination, and mobile layouts. The repository currently has no dedicated test script or test suite found in the reviewed file inventory. Add focused behavioral tests and a fresh/upgrade migration check rather than tests that merely mirror implementation.

The original optimization plan should be updated after implementation: Redis fallback recovery is incomplete, the limiter is PostgreSQL-backed, public reads still perform maintenance, R2 upload cache headers are already present, and index existence alone is not proof of query performance.
