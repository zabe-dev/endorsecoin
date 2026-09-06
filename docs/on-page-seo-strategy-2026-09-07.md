# EndorseCoin on-page SEO strategy

Updated September 7, 2026.

This document proposes metadata and on-page improvements for the current site. It replaces the earlier audit document. The titles and descriptions below are the implementation target, not a verbatim record of the older deployed metadata.

Implementation started September 7, 2026. The codebase now includes the shared metadata helper, public page metadata updates, private route noindex cleanup, sitemap, robots policy, shared social image route, structured data for the site and public lists, crawlable pagination links, crawlable airdrop project links, and outbound sponsored/user-generated link attributes. Production indexing, Cloudflare public access, and Search Console data still need to be verified after deployment.

The review covers all 16 page templates in the repository, including redirects. Dynamic pages were reviewed as templates rather than as every individual database record. Production indexing and Search Console data have not been verified.

## Copy rules

- Use clear project, coin, token, and airdrop terminology. The approved homepage title is “Discover New Crypto Coins, Presales and Airdrops | EndorseCoin”; this is the exception to the terminology restriction elsewhere.
- Write coin names and symbols as NAME (SYMBOL). Do not prefix symbols with a currency sign.
- Do not mention the network in coin-page SEO titles or descriptions. Network details can remain in the page content.
- Use EndorseCoin consistently as the brand.
- Match every metadata claim to information available on the page.
- Do not automatically add a year, “live”, or “latest” to imply freshness.
- Apply the same wording standards to Open Graph and Twitter previews.

## Recommended public-page metadata

These are full displayed titles. The existing title template adds the brand suffix, so page exports should not repeat it.

| Page        | SEO title                                                           | Meta description                                                                                                                                          |
| ----------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home        | Discover New Crypto Coins, Presales and Airdrops &#124; EndorseCoin | Discover new coins, explore token presales, and compare trending projects. Check prices, charts, and community rankings to research your next investment. |
| Airdrops    | Live & Upcoming Airdrops &#124; EndorseCoin                         | Explore airdrops, check rewards and claim dates, and find official links for live and upcoming campaigns.                                                 |
| Coin detail | NAME (SYMBOL) Price, Chart & Where to Buy &#124; EndorseCoin        | Check NAME (SYMBOL) price and chart, explore where to buy, and find token details, contract address, and official links.                                  |
| Advertise   | Project Advertising & Banner Placements &#124; EndorseCoin          | Promote your project with EndorseCoin banner ads, promoted placements, and boosts. Compare prices, ad sizes, and available locations.                     |
| Partners    | Ecosystem Partners &#124; EndorseCoin                               | Partner with EndorseCoin as a launchpad, community, tool, or service provider. Explore partnership opportunities and contact our team.                    |
| Privacy     | Privacy Policy &#124; EndorseCoin                                   | Learn how EndorseCoin collects, uses, and protects account information, submissions, and activity data, and how to contact us about privacy.              |
| Terms       | Terms and Conditions &#124; EndorseCoin                             | Read the rules for using EndorseCoin, submitting projects, voting, managing an account, and purchasing advertising or promotions.                         |
| Disclaimer  | Disclaimer &#124; EndorseCoin                                       | Understand the limits of EndorseCoin listings, community rankings, market data, and sponsored placements before using project information.                |

Descriptions are suggested search snippets. Search engines can choose other page text or rewrite titles. Prefer readable, accurate copy over rigid character counts or repeated keywords. [Google title guidance](https://developers.google.com/search/docs/appearance/title-link), [Google snippet guidance](https://developers.google.com/search/docs/appearance/snippet)

## Pre-implementation indexing, canonical, and access inventory

These were the source settings before implementation began, including inherited root defaults. Unlike the proposed copy above, this table records the behavior found during the audit. Redirects and framework-generated 404 responses can affect the final emitted metadata; production response headers have not been inspected.

`index` allows indexing but does not guarantee inclusion. `noindex` requests exclusion from search results. `follow` permits following page links; `nofollow` asks crawlers not to follow those links from this page. These directives do not protect private data. Canonicals identify the preferred URL; they are not redirects or access controls.

All canonical paths below resolve against `https://endorsecoin.com`.

| Route                 | Current robots                                | Current canonical                  | Access / response                                              | Recommended policy                                                                 |
| --------------------- | --------------------------------------------- | ---------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `/`                   | index, follow — root default                  | `/`, including query variants      | Public                                                         | Keep index, follow for main results; give ordinary paginated pages self-canonicals |
| `/airdrops`           | index, follow — inherited                     | `/airdrops`, including later pages | Public                                                         | Keep index, follow; correct later-page canonicals                                  |
| `/coin/[id]`          | index, follow — inherited for valid pages     | `/coin/ID`                         | Public eligible project; invalid/missing records call notFound | Keep index, follow for public records; preserve real 404 behavior                  |
| `/advertise`          | index, follow — inherited                     | `/advertise`                       | Public                                                         | Keep                                                                               |
| `/partners`           | index, follow — inherited                     | `/partners`                        | Public                                                         | Keep                                                                               |
| `/privacy`            | index, follow — inherited                     | `/privacy`                         | Public                                                         | Keep                                                                               |
| `/terms`              | index, follow — inherited                     | `/terms`                           | Public                                                         | Keep                                                                               |
| `/disclaimer`         | index, follow — inherited                     | `/disclaimer`                      | Public                                                         | Keep                                                                               |
| `/submit`             | noindex, nofollow — explicit                  | `/submit`                          | Requires sign-in; otherwise redirects to `/`                   | Keep                                                                               |
| `/dashboard`          | noindex, nofollow — explicit                  | `/` — inherited                    | Requires sign-in; otherwise redirects to `/`                   | Keep robots; remove misleading homepage canonical or use own canonical             |
| `/watchlist`          | noindex, nofollow — explicit                  | `/` — inherited                    | Requires sign-in; otherwise redirects to `/`                   | Keep robots; clean up inherited canonical                                          |
| `/watchlist/[userId]` | noindex, nofollow — explicit                  | `/` — inherited                    | Public shared list; missing owner calls notFound               | Keep robots; clean up inherited canonical                                          |
| `/settings`           | index, follow — inherited; no page metadata   | `/` — inherited                    | Requires sign-in; otherwise redirects to `/`                   | Add explicit noindex, nofollow and Settings title; clean up canonical              |
| `/admin`              | noindex, nofollow — explicit                  | `/` — inherited                    | Redirects to `/admin/dashboard`                                | Keep redirect and exclusion from sitemap                                           |
| `/admin/dashboard`    | noindex, nofollow — explicit                  | `/` — inherited                    | Sign-in required; non-admin users receive notFound             | Keep robots and authorization; clean up inherited canonical                        |
| `/account`            | No page override; root defaults index, follow | `/` — root default                 | Redirects to `/dashboard`                                      | Preserve redirect; exclude from sitemap; explicit noindex can provide consistency  |

The homepage currently also accepts search, category, chain, view, and sort parameters. It has no separate query-specific metadata policy. Proposed policy: index ordinary pagination with correct self-canonicals; noindex internal search and uncurated filter/sort variants. Implement this deliberately instead of applying it to every query parameter indiscriminately.

## Pre-implementation social metadata and shared settings

| Setting                                | Current configuration                                                     | Recommended change                                                          |
| -------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Metadata base                          | `https://endorsecoin.com`                                                 | Keep                                                                        |
| Root title template                    | `%s` followed by the EndorseCoin brand suffix                             | Keep; do not append the suffix twice                                        |
| Root canonical                         | `/`                                                                       | Keep for home; override or clear appropriately on other routes              |
| HTML language                          | `en`                                                                      | Keep for English content                                                    |
| Root Open Graph                        | Homepage title/description, URL `/`, siteName EndorseCoin, type website   | Keep shared defaults but supply page-specific copy and URLs                 |
| Root social image                      | No Open Graph or Twitter image configured                                 | Add a shared fallback image                                                 |
| Root Twitter card                      | `summary_large_image`                                                     | Provide an appropriate image                                                |
| Coin Open Graph                        | Generated coin title/description, `/coin/ID`, logo when present           | Apply agreed coin copy; preserve valid URLs and image fallback              |
| Coin Twitter                           | `summary`, generated coin copy, logo when present                         | Apply agreed coin copy                                                      |
| Advertise Open Graph                   | Dedicated page title/description and `/advertise`                         | Apply agreed copy; explicitly include shared image/site defaults            |
| Partners Open Graph                    | Dedicated page title/description and `/partners`                          | Apply agreed copy; explicitly include shared image/site defaults            |
| Advertise and Partners Twitter         | Root homepage copy inherited                                              | Add matching page-specific copy                                             |
| Airdrops social metadata               | Root homepage Open Graph and Twitter inherited, including homepage OG URL | Add airdrop-specific copy, URL, and image                                   |
| Legal and account-page social metadata | Root defaults inherited                                                   | Use relevant page copy where needed; account-page cleanup is lower priority |
| Manifest                               | `/site.webmanifest`                                                       | Keep                                                                        |
| Icons                                  | Apple touch icon 180×180; favicon PNGs 32×32 and 16×16                    | Keep and verify they resolve                                                |
| Sitemap / robots file                  | Not found in audited app/public source                                    | Add deliberate public discovery and crawler policies                        |
| Structured data                        | No JSON-LD found in source audit                                          | Add minimal truthful markup as described below                              |

Nested Open Graph overrides should explicitly include desired shared fields rather than relying on recursive inheritance. A normal page title override does not automatically replace the explicitly configured root Twitter copy.

The proposed titles and descriptions in this document intentionally use revised wording. Current source copy has not been reproduced verbatim, to preserve the requested terminology and symbol formatting.

## Coin-page strategy

### Main metadata

Use this when the page provides price information, a chart, and a usable purchase destination:

**Title:** NAME (SYMBOL) Price, Chart & Where to Buy | EndorseCoin

**Description:** Check NAME (SYMBOL) price and chart, explore where to buy, and find token details, contract address, and official links.

For pages without market data:

**Title:** NAME (SYMBOL) Token Details & Official Links | EndorseCoin

**Description:** Learn about NAME (SYMBOL). Find project information, its contract address, official links, and community activity.

Adapt the copy to available fields. Omit contract claims if no contract is listed. If price is available but a chart is not, keep the price wording and omit the chart claim. Use a timestamped last-known value or a clear unavailable state during temporary feed failures; avoid changing metadata on every transient error.

### Search intent

Candidate queries to address naturally:

| Search theme                     | Content that answers it                                 |
| -------------------------------- | ------------------------------------------------------- |
| NAME price / SYMBOL price today  | Price, currency, change, and a visible update time      |
| NAME chart                       | Available chart with its source                         |
| Where to buy NAME                | Working exchange or DEX links for the correct token     |
| How to buy NAME                  | Actual project-specific purchasing instructions         |
| What is NAME                     | A concise, factual project introduction                 |
| NAME contract address            | Copyable contract details and an explorer link          |
| NAME market cap / trading volume | Available market figures with clear missing-data states |
| NAME official website            | Clearly identified official website and social links    |

These are candidate search themes, not verified search-volume findings. Validate them through Search Console once pages receive impressions.

“Where to buy” is suitable for verified purchase destinations. Use “How to buy” in metadata only when the page includes useful instructions, not merely an exchange icon. Do not promise price predictions or investment outcomes.

### Visible sections

Use compact headings where the corresponding content exists:

- What is NAME?
- SYMBOL price and chart
- Where to buy NAME
- Contract address and official links
- Community activity

Keep the existing project-name main heading. Explain that the displayed rank is the EndorseCoin community leaderboard rank, including the weekly reset period. Link back to the matching leaderboard. Community votes must not be presented as customer review ratings.

Numeric coin URLs can remain. A readable slug is optional later work, not a prerequisite for this strategy. Any future URL change must preserve old links through permanent redirects and update canonicals, internal links, and the sitemap together.

## Page-by-page improvements

| Route                 | Current structure or behavior                                | Recommended action                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                   | Community leaderboard, discovery sections, existing FAQ      | Keep the compact layout. Apply homepage metadata, add crawlable project links, and review the existing FAQ for accurate voting and boost explanations. Avoid adding another large FAQ or hero. |
| `/airdrops`           | Server-paginated reward cards linking to projects            | Apply airdrop metadata, make project names real links, and preserve clear rewards, claim dates, status, and official destinations. This is not a ranking.                                      |
| `/coin/[id]`          | Dynamic project metadata, details, charts, rank, and links   | Apply conditional metadata above. Keep full useful project descriptions in the body and a concise summary in metadata.                                                                         |
| `/advertise`          | Placements, pricing, boosts, and eligibility                 | Keep placement information accurate across homepage, coin pages, and airdrops. Answer practical questions about sizes, scheduling, review, and paid visibility.                                |
| `/partners`           | Partner types, fit, and contact                              | State who can partner, what each side provides, and how to apply. Use a clear contact heading such as “Become a partner.”                                                                      |
| `/privacy`            | Policy content and update date                               | Improve the short description; preserve readable policy sections and truthful update dates.                                                                                                    |
| `/terms`              | Platform, submission, and advertising rules                  | Apply a descriptive summary and keep the page accessible through the footer.                                                                                                                   |
| `/disclaimer`         | Listing, market-data, and sponsorship limitations            | Apply a descriptive summary and link it where sponsorship or project information needs context.                                                                                                |
| `/submit`             | Authenticated project and airdrop forms                      | Keep noindex. Preserve both submission flows and avoid adding SEO paragraphs inside the forms.                                                                                                 |
| `/dashboard`          | Personal submissions                                         | Keep authentication and noindex.                                                                                                                                                               |
| `/watchlist`          | Personal saved projects                                      | Keep authentication and noindex.                                                                                                                                                               |
| `/watchlist/[userId]` | Publicly shared watchlist                                    | Keep current noindex policy; public access does not require search indexing.                                                                                                                   |
| `/settings`           | Authenticated account controls; no dedicated metadata export | Add Settings title and explicit noindex metadata.                                                                                                                                              |
| `/admin`              | Redirect to admin dashboard                                  | Preserve redirect and noindex; exclude from sitemap.                                                                                                                                           |
| `/admin/dashboard`    | Restricted operational tools                                 | Preserve authorization and noindex.                                                                                                                                                            |
| `/account`            | Redirect to dashboard                                        | Preserve redirect and exclude from sitemap.                                                                                                                                                    |

For private pages, use concise titles such as “Dashboard | EndorseCoin” and “Watchlist | EndorseCoin”. They do not need keyword targeting. Authentication remains the privacy control; metadata is not access control.

## Technical findings and fixes

### Metadata inheritance

The root layout supplies a title template, description, canonical, Open Graph, and Twitter metadata. Several pages inherit homepage social copy even when their visible content differs. Airdrops also inherits the homepage social URL.

Create a shared metadata helper that explicitly sets page title, description, canonical, Open Graph URL, social copy, and fallback image. Preserve the shared site name and type when constructing nested metadata objects. Keep the canonical origin as https://endorsecoin.com.

Add a shared social preview image. The root currently requests a large Twitter image card without configuring an image. Coin pages can use their logos or a later cached branded preview. Do not fetch third-party market data during preview generation.

### Internal links

Homepage rows and airdrop cards use JavaScript navigation. Add actual anchors or Next Links to project names, preserving whole-row clicks as an enhancement. Keep vote, watchlist, claim, and website controls independent; do not nest buttons or links inside another anchor.

Google generally discovers destinations through anchor hrefs, rather than clicking JavaScript controls. [Google link guidance](https://developers.google.com/search/docs/crawling-indexing/links-crawlable)

### Pagination and canonicals

Keep server pagination and the existing compact controls. Render navigable page numbers and previous/next destinations as links, preserving pending feedback and scroll behavior.

Use self-canonicals for ordinary paginated results:

| URL                               | Canonical          |
| --------------------------------- | ------------------ |
| `/` or `/?page=1`                 | `/`                |
| `/?page=2`                        | `/?page=2`         |
| `/airdrops` or `/airdrops?page=1` | `/airdrops`        |
| `/airdrops?page=2`                | `/airdrops?page=2` |

The current homepage canonical stays at `/`, and airdrops stays at `/airdrops`, including later pages. Correct this without changing pagination data logic. Internal search and uncurated filter/sort variants need a separate noindex policy. Do not treat materially different results pages as duplicates of page 1. [Google pagination guidance](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading)

### Sitemap and robots

No sitemap or robots file was found in the app/public source audit.

Add a sitemap containing public canonical pages and eligible public coin records. Exclude account tools, redirects, internal search, and unapproved records. Select only required database fields, cache generation, and split the sitemap if the catalog grows. Use real content modification dates rather than assigning the current time on every request.

Add robots.txt with the sitemap location and an explicit production policy. Do not block a URL from crawling when relying on the crawler reading its noindex tag.

At public launch, verify anonymous access through Cloudflare. Development Access protection should remain until launch; an ACME path exception alone does not make public content crawlable.

### Structured data

No JSON-LD was found in the source audit. Start with truthful WebSite/Organization information and BreadcrumbList on coin pages. Optional CollectionPage/ItemList markup can describe visible lists, without promising special search appearances.

Use only public facts, serialize safely, and avoid rating markup derived from community votes. Do not label tokens as retail products or reward campaigns as events solely to seek rich results.

### Images and performance

Logo cropping already outputs WebP, and R2 delivery and caching are part of the existing system. Preserve those improvements.

Measure actual delivered image dimensions and sizes before adding another processing layer. Reserve logo and banner dimensions to reduce layout shifts. Lazy-load below-fold images. Empty logo alt text can remain when adjacent text already names the project.

Keep bounded database reads, cache versioning, and background market refreshes. Metadata should reuse available project data instead of duplicating expensive queries. Do not introduce third-party requests into normal page rendering.

### Trust and outbound links

Keep paid placements and boosts visibly identified. Review paid outbound links for sponsored attributes and submitted links for appropriate user-generated-content treatment. Preserve existing security attributes.

Review project descriptions for factual usefulness and misleading claims. Keep absent market data distinct from zero. Do not mass-generate repetitive paragraphs merely to lengthen pages.

## Implementation stages

| Stage                   | Work                                                                                    | Acceptance checks                                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Discovery           | Crawlable project/pagination links, canonical policy, sitemap, robots, Settings noindex | Anonymous production-build HTML links to projects and page 2; later pages serve distinct records and correct canonicals; private URLs are absent from sitemap       |
| 2 — Metadata            | Shared helper, agreed titles/descriptions, conditional coin copy, social image          | Inspect all public page types and coins with/without market data, logos, descriptions, and purchase links; verify symbols use parentheses without currency prefixes |
| 3 — Content             | Compact project sections, accurate ranking FAQ, clear partnership and advertising copy  | Metadata promises match visible content; no unnecessary hero, duplicated FAQ, or obstructive form copy                                                              |
| 4 — Markup and assets   | Minimal structured data and measured image improvements                                 | Validate markup; images use appropriate dimensions; no extra layout shift or expensive request-time work                                                            |
| 5 — Launch verification | Public access, redirects, real 404s, sitemap submission, Search Console baseline        | Crawlers can reach public content; invalid records return proper 404s; indexing and field performance can be monitored                                              |

Test mobile and desktop navigation, pending states, scroll preservation, external-link controls, and vote/watchlist actions after shared component changes. SEO work should preserve the site’s compact design and existing performance optimizations.
