# EndorseCoin Speed Optimization Plan

## Current setup

- Hosting: Coolify on VPS
- Assets: Cloudflare R2
- Database: PostgreSQL
- Market data: Mobula API
- Frontend: Next.js

## Main goal

Keep expensive work out of user-facing page requests. Pages should read ready or cached data, not wait for third-party API calls or heavy database calculations.

## Priority stages

### 1. Remove slow work from page requests — done

- Do not run Mobula sync during normal page loads.
- Market sync should run only through cron or background jobs.
- Homepage, coin pages, dashboard, and watchlist pages should read existing database snapshots.
- Missing market data should display safe fallback values.

Current status:

- `MARKET_SYNC_ON_PAGE` defaults to `false`.
- Mobula sync has a Redis lock so duplicate sync calls do not stack.
- Known invalid Mobula address requests are tracked and skipped until the chain or address changes.

### 2. Add Redis with safe fallback — done

Use Redis for:

- Rate limits
- Topbar prices and stats
- Banner ads
- Homepage tables
- Ranking hotspots
- Coin page market snapshots
- Public watchlist tables

If Redis fails, the site should safely fall back to database reads.

Current status:

- Redis helper is in place with safe fallback.
- Cache versioning is used instead of Redis key scans.
- Cache keys are lowercase and log-friendly.
- Rate limiting uses shared helper logic.

### 3. Cache high-traffic data — done for public hot paths

Suggested cache timing:

- Topbar prices: 30–60 seconds
- Topbar stats: 60 seconds
- Banner ads: 2–5 minutes
- Homepage rankings: 30–60 seconds
- Ranking hotspots: 30–60 seconds
- Promoted coin IDs: 60 seconds
- Homepage discovery hydration: batch shared coin IDs once per request
- Coin page market snapshot: 1–5 minutes
- Public watchlist: 30–60 seconds

Current status:

- Topbar prices/stats are cached.
- Banner ads are cached.
- Leaderboard selections are cached.
- Promoted coin IDs are cached.
- Public discovery payload is cached for logged-out homepage traffic.
- Public watchlists are cached.
- Interaction summaries are cached with hashed coin ID keys.

### 4. Improve database performance — done for current scale

Add or confirm indexes for:

- Coin status
- Presale status
- Launch date
- Presale end date
- Votes by coin/date
- Watchlists by coin/user
- Active boosts
- Active promotions
- Active banner ads
- Submission status/type

If vote/watchlist counts become expensive, add stored counters on coins:

- Total votes
- Weekly votes
- Watchlist count
- Trending score if needed

Current status:

- Hot indexes exist for public coins, market snapshots, votes, watchlists, submissions, boosts, promotions, and banner ads.
- Latest market snapshots are selected in the database instead of loading all snapshot history into memory.
- Latest submission payloads are selected in the database instead of loading all submission history into memory.
- Coin pages hydrate only promoted coin rows instead of loading the full public coin list.

### 5. Optimize R2 images — optional production polish

- Store logos and ad creatives in R2.
- Use long cache headers.
- Lazy-load images when possible.
- Keep table logos fixed size.
- Avoid loading oversized images in tables.

Notes:

- R2 is storage, not full image optimization by itself.
- If R2 is behind Cloudflare, CDN caching can be strong, but uploaded assets should still send long cache headers.
- True image resizing/compression would need Cloudflare Image Resizing, Cloudflare Images, a Worker, or an image pipeline.

### 6. Lazy-load heavy UI — optional

Lazy-load:

- Chart embeds
- Auth modal
- Admin modals
- Submission cropper
- Confetti
- Admin tab content

Charts should not block the first page render.

### 7. Improve admin dashboard loading — not needed now

- Load summary first.
- Load only active tab data.
- Fetch other tabs when clicked.
- Paginate admin tables server-side.

Decision:

- Skip this for now. Admin usage is expected to be tiny, likely fewer than five admins.
- Revisit only if admin pages become slow with production data.

### 8. Mobula sync strategy — planned

For 10k coins per day:

- Use controlled queue processing.
- Prioritize promoted/boosted coins first.
- Then homepage-visible coins.
- Then watched coins.
- Then stale long-tail coins.
- Skip known invalid contract addresses unless address or chain changes.
- Store failure reasons to avoid wasting API calls.

At 1 request per second, the theoretical max is 86,400 requests per day. A safer production target is around 40k–70k per day. Updating 10k coins per day is realistic.

### 9. Real production measurement — planned

- Measure homepage, coin page, dashboard, watchlist, and admin page response times on the VPS.
- Compare cold Redis vs warm Redis.
- Check whether any request still waits on third-party APIs.
- Use production-sized data before deciding on deeper database changes.

### 10. Database query analysis — planned

- Run `EXPLAIN ANALYZE` only after production-like data exists.
- Focus on homepage leaderboard queries, interaction summaries, public watchlists, and coin page hydration.
- Avoid guessing new indexes until the query planner shows a real need.

### 11. Redis pre-warming after deploy — optional

Pre-warming means calling important pages or internal reads once after deploy so Redis gets populated before real visitors arrive.

Example:

- deploy finishes
- a small deploy task hits `/`
- Redis writes homepage discovery, topbar summary, banner ads, and leaderboard selections
- first real visitor gets cache hits instead of being the cold-cache visitor

This is useful before launch, but not required during normal development.

## Current implementation summary

Completed:

1. Redis helper with safe database fallback.
2. Redis cache versioning for safe invalidation.
3. Topbar, banner ads, leaderboard selections, promoted IDs, public discovery, public watchlists, and interaction summary caching.
4. Server-side leaderboard selection and pagination.
5. Reduced coin hydration queries.
6. Deferred fixed footer ad loading.
7. Navbar session hydration to avoid login/avatar flicker.

Remaining:

1. Test speed on the VPS with warm Redis.
2. Add R2 cache headers / image delivery polish when asset behavior is finalized.
3. Consider Redis pre-warming before launch.
4. Run database query analysis after production-sized data exists.
