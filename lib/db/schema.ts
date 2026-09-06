import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

export const coins = pgTable(
  'coins',
  {
    id: integer('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    symbol: text('symbol').notNull(),
    logoUrl: text('logo_url'),
    description: text('description'),
    category: text('category').default('Other').notNull(),
    chain: text('chain'),
    contractAddress: text('contract_address'),
    launchDate: timestamp('launch_date', { withTimezone: true }),
    listingSource: text('listing_source').default('imported').notNull(),
    listingStatus: text('listing_status').default('active').notNull(),
    isPresale: boolean('is_presale').default(false).notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('coins_slug_unique').on(table.slug),
    index('coins_symbol_idx').on(table.symbol),
    index('coins_chain_idx').on(table.chain),
    index('coins_category_idx').on(table.category),
    index('coins_listing_status_idx').on(table.listingStatus),
    index('coins_status_submitted_idx').on(table.listingStatus, table.submittedAt),
    index('coins_status_launch_idx').on(table.listingStatus, table.launchDate),
    index('coins_status_presale_idx').on(table.listingStatus, table.isPresale),
    index('coins_status_category_idx').on(table.listingStatus, table.category),
    index('coins_status_chain_idx').on(table.listingStatus, table.chain),
  ],
);

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    image: text('image'),
    role: text('role').default('user'),
    banned: boolean('banned').default(false),
    banReason: text('ban_reason'),
    banExpires: timestamp('ban_expires', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    impersonatedBy: text('impersonated_by'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('sessions_token_unique').on(table.token),
    index('sessions_user_id_idx').on(table.userId),
  ],
);

export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    issuer: text('issuer').default('local:credential').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    ...timestamps,
  },
  (table) => [index('accounts_user_id_idx').on(table.userId)],
);

export const verifications = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [index('verifications_identifier_idx').on(table.identifier)],
);

export const marketSources = pgTable(
  'market_sources',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    coinId: integer('coin_id')
      .references(() => coins.id, { onDelete: 'cascade' })
      .notNull(),
    provider: text('provider').notNull(),
    externalId: text('external_id').notNull(),
    sourceImageUrl: text('source_image_url'),
    lastMarketSyncAt: timestamp('last_market_sync_at', { withTimezone: true }),
    lastMetadataSyncAt: timestamp('last_metadata_sync_at', { withTimezone: true }),
    lastErrorCode: text('last_error_code'),
    lastErrorMessage: text('last_error_message'),
    lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('market_sources_provider_external_unique').on(table.provider, table.externalId),
    uniqueIndex('market_sources_coin_provider_unique').on(table.coinId, table.provider),
    index('market_sources_error_idx').on(table.provider, table.lastErrorCode, table.externalId),
    index('market_sources_sync_idx').on(table.provider, table.lastMarketSyncAt),
  ],
);

export const marketSnapshots = pgTable(
  'market_snapshots',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    coinId: integer('coin_id')
      .references(() => coins.id, { onDelete: 'cascade' })
      .notNull(),
    priceUsd: numeric('price_usd', { precision: 30, scale: 12 }),
    marketCapUsd: numeric('market_cap_usd', { precision: 30, scale: 2 }),
    volume24hUsd: numeric('volume_24h_usd', { precision: 30, scale: 2 }),
    change24h: numeric('change_24h', { precision: 12, scale: 4 }),
    liquidityUsd: numeric('liquidity_usd', { precision: 30, scale: 2 }),
    fdvUsd: numeric('fdv_usd', { precision: 30, scale: 2 }),
    totalSupply: numeric('total_supply', { precision: 40, scale: 8 }),
    holdersCount: integer('holders_count'),
    marketRank: integer('market_rank'),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('market_snapshots_coin_recorded_idx').on(table.coinId, table.recordedAt)],
);

export const coinLinks = pgTable(
  'coin_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    coinId: integer('coin_id')
      .references(() => coins.id, { onDelete: 'cascade' })
      .notNull(),
    type: text('type').notNull(),
    url: text('url').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('coin_links_coin_type_unique').on(table.coinId, table.type),
    index('coin_links_coin_idx').on(table.coinId),
  ],
);

export const changeRequests = pgTable(
  'change_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    coinId: integer('coin_id')
      .references(() => coins.id, { onDelete: 'cascade' })
      .notNull(),
    requesterEmail: text('requester_email').notNull(),
    requesterTelegram: text('requester_telegram'),
    requestedChanges: text('requested_changes').notNull(),
    evidenceUrl: text('evidence_url'),
    status: text('status').default('pending').notNull(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('change_requests_coin_status_idx').on(table.coinId, table.status),
    index('change_requests_status_created_idx').on(table.status, table.createdAt),
  ],
);

export const coinSubmissions = pgTable(
  'coin_submissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    coinId: integer('coin_id').references(() => coins.id, { onDelete: 'set null' }),
    submittedByUserId: text('submitted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    requesterEmail: text('requester_email').notNull(),
    requesterTelegram: text('requester_telegram'),
    submissionType: text('submission_type').default('new-coin').notNull(),
    status: text('status').default('pending').notNull(),
    coinData: jsonb('coin_data').notNull(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('coin_submissions_status_created_idx').on(table.status, table.createdAt),
    index('coin_submissions_status_type_created_idx').on(
      table.status,
      table.submissionType,
      table.createdAt,
    ),
    index('coin_submissions_coin_idx').on(table.coinId),
    index('coin_submissions_user_idx').on(table.submittedByUserId),
    index('coin_submissions_requester_type_created_idx').on(
      table.requesterEmail,
      table.submissionType,
      table.createdAt,
    ),
    index('coin_submissions_coin_type_created_idx').on(
      table.coinId,
      table.submissionType,
      table.createdAt,
    ),
  ],
);

export const coinSubmissionCategories = pgTable(
  'coin_submission_categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    submissionId: uuid('submission_id')
      .references(() => coinSubmissions.id, { onDelete: 'cascade' })
      .notNull(),
    category: text('category').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('coin_submission_categories_submission_category_unique').on(
      table.submissionId,
      table.category,
    ),
    index('coin_submission_categories_submission_idx').on(table.submissionId),
  ],
);

export const coinSubmissionContracts = pgTable(
  'coin_submission_contracts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    submissionId: uuid('submission_id')
      .references(() => coinSubmissions.id, { onDelete: 'cascade' })
      .notNull(),
    chain: text('chain').notNull(),
    contractAddress: text('contract_address'),
    isPrimary: boolean('is_primary').default(false).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    index('coin_submission_contracts_submission_idx').on(table.submissionId),
    uniqueIndex('coin_submission_contracts_submission_sort_unique').on(
      table.submissionId,
      table.sortOrder,
    ),
  ],
);

export const coinSubmissionLinks = pgTable(
  'coin_submission_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    submissionId: uuid('submission_id')
      .references(() => coinSubmissions.id, { onDelete: 'cascade' })
      .notNull(),
    kind: text('kind').notNull(),
    provider: text('provider'),
    label: text('label'),
    url: text('url').notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    index('coin_submission_links_submission_idx').on(table.submissionId),
    uniqueIndex('coin_submission_links_submission_kind_unique').on(table.submissionId, table.kind),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    coinId: integer('coin_id').references(() => coins.id, { onDelete: 'set null' }),
    productType: text('product_type').notNull(),
    amount: numeric('amount', { precision: 20, scale: 8 }).notNull(),
    currency: text('currency').notNull(),
    status: text('status').default('pending').notNull(),
    providerReference: text('provider_reference'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('payments_provider_reference_unique').on(table.providerReference),
    index('payments_coin_status_idx').on(table.coinId, table.status),
  ],
);

export const coinBoosts = pgTable(
  'coin_boosts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    coinId: integer('coin_id')
      .references(() => coins.id, { onDelete: 'cascade' })
      .notNull(),
    multiplier: integer('multiplier').notNull(),
    status: text('status').default('active').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    assignedByUserId: text('assigned_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),
    ...timestamps,
  },
  (table) => [
    index('coin_boosts_coin_status_idx').on(table.coinId, table.status),
    index('coin_boosts_expires_idx').on(table.expiresAt),
    index('coin_boosts_status_schedule_idx').on(table.status, table.startsAt, table.expiresAt),
    index('coin_boosts_coin_schedule_idx').on(
      table.coinId,
      table.status,
      table.startsAt,
      table.expiresAt,
    ),
  ],
);

export const coinPromotions = pgTable(
  'coin_promotions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    coinId: integer('coin_id')
      .references(() => coins.id, { onDelete: 'cascade' })
      .notNull(),
    placement: text('placement').default('promoted-table').notNull(),
    priority: integer('priority').default(1).notNull(),
    status: text('status').default('active').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    assignedByUserId: text('assigned_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),
    ...timestamps,
  },
  (table) => [
    index('coin_promotions_coin_status_idx').on(table.coinId, table.status),
    index('coin_promotions_expires_idx').on(table.expiresAt),
    index('coin_promotions_status_schedule_idx').on(
      table.status,
      table.startsAt,
      table.expiresAt,
    ),
    index('coin_promotions_rank_schedule_idx').on(
      table.status,
      table.startsAt,
      table.expiresAt,
      table.priority,
      table.coinId,
    ),
  ],
);

export const bannerAds = pgTable(
  'banner_ads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    placement: text('placement').notNull(),
    title: text('title').notNull(),
    subtitle: text('subtitle'),
    desktopImageUrl: text('desktop_image_url').notNull(),
    mobileImageUrl: text('mobile_image_url').notNull(),
    targetUrl: text('target_url').notNull(),
    status: text('status').default('active').notNull(),
    priority: integer('priority').default(1).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    assignedByUserId: text('assigned_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),
    ...timestamps,
  },
  (table) => [
    index('banner_ads_placement_status_idx').on(table.placement, table.status),
    index('banner_ads_schedule_idx').on(table.startsAt, table.expiresAt),
    index('banner_ads_active_lookup_idx').on(
      table.placement,
      table.status,
      table.startsAt,
      table.expiresAt,
      table.priority,
    ),
  ],
);

export const mailingListSubscribers = pgTable(
  'mailing_list_subscribers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(),
    source: text('source').default('homepage').notNull(),
    status: text('status').default('subscribed').notNull(),
    subscribedAt: timestamp('subscribed_at', { withTimezone: true }).defaultNow().notNull(),
    unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('mailing_list_subscribers_email_unique').on(table.email),
    index('mailing_list_subscribers_status_idx').on(table.status),
  ],
);

export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text('key').primaryKey(),
    action: text('action').notNull(),
    subject: text('subject').notNull(),
    count: integer('count').default(0).notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    index('rate_limits_action_subject_idx').on(table.action, table.subject),
    index('rate_limits_expires_idx').on(table.expiresAt),
  ],
);

export const coinVotes = pgTable(
  'coin_votes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    coinId: integer('coin_id')
      .references(() => coins.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    weekStartsAt: timestamp('week_starts_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('coin_votes_coin_created_idx').on(table.coinId, table.createdAt),
    index('coin_votes_coin_week_idx').on(table.coinId, table.weekStartsAt),
    index('coin_votes_week_coin_idx').on(table.weekStartsAt, table.coinId),
    index('coin_votes_user_coin_created_idx').on(table.userId, table.coinId, table.createdAt),
    index('coin_votes_created_idx').on(table.createdAt),
    index('coin_votes_user_created_idx').on(table.userId, table.createdAt),
  ],
);

export const coinWatchlists = pgTable(
  'coin_watchlists',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    coinId: integer('coin_id')
      .references(() => coins.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('coin_watchlists_user_coin_unique').on(table.userId, table.coinId),
    index('coin_watchlists_coin_idx').on(table.coinId),
    index('coin_watchlists_user_idx').on(table.userId),
    index('coin_watchlists_coin_created_idx').on(table.coinId, table.createdAt),
    index('coin_watchlists_user_created_idx').on(table.userId, table.createdAt),
    index('coin_watchlists_user_created_coin_idx').on(table.userId, table.createdAt, table.coinId),
  ],
);

export const adminAuditLogs = pgTable(
  'admin_audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    adminUserId: text('admin_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('admin_audit_logs_admin_idx').on(table.adminUserId),
    index('admin_audit_logs_target_idx').on(table.targetType, table.targetId),
    index('admin_audit_logs_created_idx').on(table.createdAt),
  ],
);
