import { AdminDashboardClient } from '@/app/admin/dashboard/admin-dashboard-client';
import type {
  AdminBannerRow,
  AdminChangeRequestRow,
  AdminCoinRow,
  AdminSubmissionRow,
  AdminSummary,
  AdminUserRow,
} from '@/app/admin/dashboard/admin-dashboard-client';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { bannerPlacementLabels, normalizeBannerPlacement } from '@/features/ads/types';
import { NETWORKS } from '@/features/coins/networks';
import { hasAdminAccess } from '@/lib/auth/roles';
import { getCurrentSession } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { isMissingRelationError } from '@/lib/db/errors';
import {
  airdropSubmissions,
  bannerAds,
  changeRequests,
  coinBoosts,
  coinPromotions,
  coins,
  coinSubmissions,
  sessions,
  users,
} from '@/lib/db/schema';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Admin Dashboard',
  robots: { index: false, follow: false },
};

const adminTabs = [
  'overview',
  'submissions',
  'airdrops',
  'coins',
  'promotions',
  'banners',
  'users',
  'reports',
] as const;

type AdminTab = (typeof adminTabs)[number];

type AdminTabData = {
  pendingSubmissions: AdminSubmissionRow[];
  pendingAirdropSubmissions: AdminSubmissionRow[];
  changeRequests: AdminChangeRequestRow[];
  listedCoins: AdminCoinRow[];
  bannerAds: AdminBannerRow[];
  users: AdminUserRow[];
  pagination: AdminTablePagination | null;
};

type AdminTablePagination = {
  page: number;
  pageSize: number;
  total: number;
  pages: number;
};

const adminPageSize = 10;

const emptyAdminTabData = (): AdminTabData => ({
  pendingSubmissions: [],
  pendingAirdropSubmissions: [],
  changeRequests: [],
  listedCoins: [],
  bannerAds: [],
  users: [],
  pagination: null,
});

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string; page?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const session = await getCurrentSession();
  if (!session) redirect('/');
  if (!hasAdminAccess(session.user.role)) notFound();

  const activeTab = resolveAdminTab(resolvedSearchParams?.tab);
  const requestedPage = normalizePositiveInteger(resolvedSearchParams?.page, 1);
  const now = new Date();
  const nowIso = now.toISOString();
  const [summary, data] = await Promise.all([
    getAdminSummary(nowIso),
    getAdminTabData(activeTab, now, nowIso, requestedPage),
  ]);

  return (
    <main className="market-page">
      <SiteHeader active="none" initialSession={session} />
      <section className="container admin-dashboard" aria-label="Admin dashboard">
        <header className="admin-dashboard-head">
          <h1>Admin dashboard</h1>
          <p>Review submissions, manage listed coins, and control boosts or promotions.</p>
        </header>

        <AdminDashboardClient
          summary={summary}
          pendingSubmissions={data.pendingSubmissions}
          pendingAirdropSubmissions={data.pendingAirdropSubmissions}
          changeRequests={data.changeRequests}
          listedCoins={data.listedCoins}
          bannerAds={data.bannerAds}
          users={data.users}
          initialTab={activeTab}
          pagination={data.pagination}
        />
      </section>
      <SiteFooter />
    </main>
  );
}

function resolveAdminTab(value?: string | null): AdminTab {
  return adminTabs.includes(value as AdminTab) ? (value as AdminTab) : 'overview';
}

async function getAdminSummary(nowIso: string): Promise<AdminSummary> {
  const [
    userCountRows,
    coinCountRows,
    activeBoostCoinCountRows,
    activePromotionCoinCountRows,
    pendingSubmissionCount,
    pendingAirdropSubmissionCount,
    pendingChangeRequestCount,
    activeBannerCountRows,
    scheduledBannerCountRows,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(users),
    db.select({ count: sql<number>`count(*)::int` }).from(coins),
    db
      .select({ count: sql<number>`count(distinct ${coinBoosts.coinId})::int` })
      .from(coinBoosts)
      .where(
        and(
          sql`${coinBoosts.status} in ('active', 'scheduled')`,
          sql`${coinBoosts.startsAt} <= ${nowIso}::timestamptz`,
          sql`${coinBoosts.expiresAt} > ${nowIso}::timestamptz`,
        ),
      ),
    db
      .select({ count: sql<number>`count(distinct ${coinPromotions.coinId})::int` })
      .from(coinPromotions)
      .where(
        and(
          sql`${coinPromotions.status} in ('active', 'scheduled')`,
          sql`${coinPromotions.startsAt} <= ${nowIso}::timestamptz`,
          sql`${coinPromotions.expiresAt} > ${nowIso}::timestamptz`,
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(coinSubmissions)
      .where(
        and(eq(coinSubmissions.submissionType, 'new-coin'), eq(coinSubmissions.status, 'pending')),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(airdropSubmissions)
      .where(eq(airdropSubmissions.status, 'pending'))
      .catch((error) => {
        if (isMissingRelationError(error, 'airdrop_submissions')) return [{ count: 0 }];
        throw error;
      }),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(changeRequests)
      .where(eq(changeRequests.status, 'pending')),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(bannerAds)
      .where(
        and(
          sql`${bannerAds.status} in ('active', 'scheduled')`,
          sql`${bannerAds.startsAt} <= ${nowIso}::timestamptz`,
          sql`(${bannerAds.expiresAt} is null or ${bannerAds.expiresAt} > ${nowIso}::timestamptz)`,
        ),
      )
      .catch((error) => {
        console.warn(
          '[admin] Active banner count unavailable:',
          error instanceof Error ? error.message : error,
        );
        return [{ count: 0 }];
      }),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(bannerAds)
      .where(
        and(eq(bannerAds.status, 'scheduled'), sql`${bannerAds.startsAt} > ${nowIso}::timestamptz`),
      )
      .catch(() => [{ count: 0 }]),
  ]);

  return {
    users: readCount(userCountRows),
    coins: readCount(coinCountRows),
    activeBoosts: readCount(activeBoostCoinCountRows),
    promotedCoins: readCount(activePromotionCoinCountRows),
    activeBanners: readCount(activeBannerCountRows),
    scheduledBanners: readCount(scheduledBannerCountRows),
    pendingSubmissions: readCount(pendingSubmissionCount),
    pendingAirdrops: readCount(pendingAirdropSubmissionCount),
    changeRequests: readCount(pendingChangeRequestCount),
  };
}

async function getAdminTabData(
  tab: AdminTab,
  now: Date,
  nowIso: string,
  requestedPage: number,
): Promise<AdminTabData> {
  const data = emptyAdminTabData();

  switch (tab) {
    case 'submissions':
      Object.assign(data, await getPendingCoinSubmissions(requestedPage));
      break;
    case 'airdrops':
      Object.assign(data, await getPendingAirdropSubmissions(requestedPage));
      break;
    case 'coins':
      Object.assign(data, await getListedCoins(now, nowIso, requestedPage));
      break;
    case 'promotions':
      Object.assign(data, await getPromotedAdminCoins(now, nowIso, requestedPage));
      break;
    case 'banners':
      Object.assign(data, await getAdminBannerRows(now, requestedPage));
      break;
    case 'users':
      Object.assign(data, await getAdminUsers(requestedPage));
      break;
    case 'reports':
      Object.assign(data, await getAdminChangeRequests(requestedPage));
      break;
    case 'overview':
      break;
  }

  return data;
}

async function getPendingCoinSubmissions(requestedPage: number): Promise<Partial<AdminTabData>> {
  const total = await countPendingCoinSubmissions();
  const pagination = buildPagination(total, requestedPage);
  const submissionRows = await db
    .select()
    .from(coinSubmissions)
    .where(
      and(eq(coinSubmissions.submissionType, 'new-coin'), eq(coinSubmissions.status, 'pending')),
    )
    .orderBy(desc(coinSubmissions.createdAt))
    .limit(pagination.pageSize)
    .offset((pagination.page - 1) * pagination.pageSize);
  const userById = await getUsersByIds(
    submissionRows.map((submission) => submission.submittedByUserId).filter(isString),
  );

  const pendingSubmissions: AdminSubmissionRow[] = submissionRows.map((submission) => {
    const data = readSubmissionData(submission.coinData);
    const submitter = submission.submittedByUserId
      ? userById.get(submission.submittedByUserId)
      : null;

    return {
      id: submission.id,
      submissionKind: 'coin',
      logoUrl: data.logoUrl,
      name: data.name,
      symbol: data.symbol,
      chain: formatChain(data.chain),
      submittedBy: submitter?.name || submitter?.email || submission.requesterEmail,
      contactEmail: submission.requesterEmail,
      contactTelegram: submission.requesterTelegram || data.contactTelegram,
      submittedAt: formatDateTime(submission.createdAt),
      status: submission.status,
      flag: buildSubmissionFlag(data),
      details: buildSubmissionDetails(submission.coinData),
      rawData: JSON.stringify(submission.coinData, null, 2),
    };
  });

  return { pendingSubmissions, pagination };
}

async function getPendingAirdropSubmissions(requestedPage: number): Promise<Partial<AdminTabData>> {
  const total = await countPendingAirdropSubmissions();
  const pagination = buildPagination(total, requestedPage);
  const rows = await db
    .select({ submission: airdropSubmissions, coin: coins })
    .from(airdropSubmissions)
    .innerJoin(coins, eq(airdropSubmissions.coinId, coins.id))
    .where(eq(airdropSubmissions.status, 'pending'))
    .orderBy(desc(airdropSubmissions.createdAt))
    .limit(pagination.pageSize)
    .offset((pagination.page - 1) * pagination.pageSize)
    .catch((error) => {
      if (isMissingRelationError(error, 'airdrop_submissions')) {
        console.warn(
          '[admin] airdrop_submissions table is unavailable. Run migrations to enable airdrops.',
        );
        return [];
      }

      throw error;
    });
  const userById = await getUsersByIds(
    rows.map(({ submission }) => submission.submittedByUserId).filter(isString),
  );

  const pendingAirdropSubmissions: AdminSubmissionRow[] = rows.map(({ submission, coin }) => {
    const submitter = submission.submittedByUserId
      ? userById.get(submission.submittedByUserId)
      : null;

    return {
      id: submission.id,
      submissionKind: 'airdrop',
      logoUrl: coin.logoUrl || null,
      name: submission.name,
      symbol: coin.symbol,
      chain: coin.name,
      submittedBy: submitter?.name || submitter?.email || submission.requesterEmail,
      contactEmail: submission.requesterEmail,
      contactTelegram: readAirdropSocialLink(submission.socialLinks, 'telegram'),
      submittedAt: formatDateTime(submission.createdAt),
      status: submission.status,
      flag: 'Airdrop',
      details: buildAirdropSubmissionDetails(submission, coin),
      rawData: JSON.stringify(submission, null, 2),
    };
  });

  return { pendingAirdropSubmissions, pagination };
}

async function getListedCoins(
  now: Date,
  nowIso: string,
  requestedPage: number,
): Promise<Partial<AdminTabData>> {
  const total = await countTableRows(coins);
  const pagination = buildPagination(total, requestedPage);
  const coinRows = await db
    .select()
    .from(coins)
    .orderBy(desc(coins.submittedAt))
    .limit(pagination.pageSize)
    .offset((pagination.page - 1) * pagination.pageSize);
  return { listedCoins: await hydrateAdminCoins(coinRows, now, nowIso), pagination };
}

async function getPromotedAdminCoins(
  now: Date,
  nowIso: string,
  requestedPage: number,
): Promise<Partial<AdminTabData>> {
  const [activeBoostRows, activePromotionRows] = await Promise.all([
    readActiveBoosts(nowIso),
    readActivePromotions(nowIso),
  ]);
  const coinIds = uniqueNumbers([
    ...activeBoostRows.map((boost) => boost.coinId),
    ...activePromotionRows.map((promotion) => promotion.coinId),
  ]);
  const pagination = buildPagination(coinIds.length, requestedPage);
  const pagedCoinIds = coinIds.slice(
    (pagination.page - 1) * pagination.pageSize,
    pagination.page * pagination.pageSize,
  );
  const coinRows = await getCoinsByIds(pagedCoinIds);
  const promotedRows = await hydrateAdminCoins(
    coinRows,
    now,
    nowIso,
    activeBoostRows,
    activePromotionRows,
  );

  const listedCoins = promotedRows.sort((a, b) => {
    const aDate = a.promotion?.expiresAt || a.boost?.expiresAt || '';
    const bDate = b.promotion?.expiresAt || b.boost?.expiresAt || '';
    return aDate.localeCompare(bDate);
  });

  return { listedCoins, pagination };
}

async function hydrateAdminCoins(
  coinRows: Array<typeof coins.$inferSelect>,
  now: Date,
  nowIso: string,
  providedBoostRows?: Array<typeof coinBoosts.$inferSelect>,
  providedPromotionRows?: Array<typeof coinPromotions.$inferSelect>,
): Promise<AdminCoinRow[]> {
  const coinIds = coinRows.map((coin) => coin.id);
  const [submissionRows, activeBoostRows, activePromotionRows] = await Promise.all([
    getCoinSubmissionsByCoinIds(coinIds),
    providedBoostRows ? Promise.resolve(providedBoostRows) : readActiveBoosts(nowIso, coinIds),
    providedPromotionRows
      ? Promise.resolve(providedPromotionRows)
      : readActivePromotions(nowIso, coinIds),
  ]);
  const userById = await getUsersByIds(
    submissionRows.map((submission) => submission.submittedByUserId).filter(isString),
  );
  const submissionsByCoinId = new Map<number, (typeof submissionRows)[number]>();
  submissionRows.forEach((submission) => {
    if (submission.coinId && !submissionsByCoinId.has(submission.coinId)) {
      submissionsByCoinId.set(submission.coinId, submission);
    }
  });
  const activeBoostByCoin = new Map(activeBoostRows.map((boost) => [boost.coinId, boost]));
  const activePromotionByCoin = new Map(
    activePromotionRows.map((promotion) => [promotion.coinId, promotion]),
  );

  return coinRows.map((coin) => {
    const submission = submissionsByCoinId.get(coin.id);
    const submissionData = submission ? readSubmissionData(submission.coinData) : null;
    const submitter = submission?.submittedByUserId
      ? userById.get(submission.submittedByUserId)
      : null;
    const boost = activeBoostByCoin.get(coin.id);
    const promotion = activePromotionByCoin.get(coin.id);

    return {
      id: coin.id,
      logoUrl: coin.logoUrl || submissionData?.logoUrl || null,
      name: coin.name,
      symbol: coin.symbol,
      chain: formatChain(coin.chain || submissionData?.chain || ''),
      submittedBy: submitter?.name || submitter?.email || submission?.requesterEmail || '—',
      contactEmail: submission?.requesterEmail || '—',
      contactTelegram: submission?.requesterTelegram || submissionData?.contactTelegram || '—',
      submittedAt: formatDateTime(coin.submittedAt),
      status: coin.listingStatus,
      category: coin.category,
      boost: boost
        ? {
            tier: boost.multiplier,
            status: getBannerStatus(boost.startsAt, boost.expiresAt, now),
            startDate: formatInputDate(boost.startsAt),
            startsAt: formatDateTime(boost.startsAt),
            expiresAt: boost.expiresAt.toISOString(),
            remaining: formatTimeRemaining(boost.expiresAt, now),
          }
        : null,
      promotion: promotion
        ? {
            status: getBannerStatus(promotion.startsAt, promotion.expiresAt, now),
            priority: promotion.priority,
            startDate: formatInputDate(promotion.startsAt),
            startsAt: formatDateTime(promotion.startsAt),
            durationDays: getDurationDays(promotion.startsAt, promotion.expiresAt),
            expiresAt: promotion.expiresAt.toISOString(),
            remaining: formatTimeRemaining(promotion.expiresAt, now),
          }
        : null,
    };
  });
}

async function getAdminBannerRows(
  now: Date,
  requestedPage: number,
): Promise<Partial<AdminTabData>> {
  const total = await countTableRows(bannerAds).catch(() => 0);
  const pagination = buildPagination(total, requestedPage);
  const bannerRows = await db
    .select()
    .from(bannerAds)
    .orderBy(desc(bannerAds.updatedAt))
    .limit(pagination.pageSize)
    .offset((pagination.page - 1) * pagination.pageSize)
    .catch((error) => {
      console.warn(
        '[admin] Banner ad rows unavailable:',
        error instanceof Error ? error.message : error,
      );
      return [];
    });

  const adminBannerAds = bannerRows.map((banner) => ({
    ...(() => {
      const placement = normalizeBannerPlacement(banner.placement) || 'premium';
      const status = getBannerStatus(banner.startsAt, banner.expiresAt, now);
      return {
        placement,
        placementLabel: bannerPlacementLabels[placement],
        status,
      };
    })(),
    id: banner.id,
    title: banner.title,
    subtitle: banner.subtitle || '',
    desktopImageUrl: banner.desktopImageUrl,
    mobileImageUrl: banner.mobileImageUrl || '',
    targetUrl: banner.targetUrl,
    priority: banner.priority,
    startDate: formatInputDate(banner.startsAt),
    startsAt: formatDateTime(banner.startsAt),
    endsAt: banner.expiresAt ? formatDateTime(banner.expiresAt) : '—',
    durationDays: banner.expiresAt ? getDurationDays(banner.startsAt, banner.expiresAt) : 1,
    schedule: formatBannerSchedule(banner.startsAt, banner.expiresAt, now),
    notes: banner.notes || '',
  }));

  return { bannerAds: adminBannerAds, pagination };
}

async function getAdminUsers(requestedPage: number): Promise<Partial<AdminTabData>> {
  const total = await countTableRows(users);
  const pagination = buildPagination(total, requestedPage);
  const userRows = await db
    .select()
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(pagination.pageSize)
    .offset((pagination.page - 1) * pagination.pageSize);
  const userIds = userRows.map((user) => user.id);
  const [sessionRows, submittedCountRows] = await Promise.all([
    userIds.length
      ? db
          .select()
          .from(sessions)
          .where(inArray(sessions.userId, userIds))
          .orderBy(desc(sessions.updatedAt))
          .limit(1000)
      : Promise.resolve([]),
    userIds.length
      ? db
          .select({ userId: coinSubmissions.submittedByUserId, count: sql<number>`count(*)::int` })
          .from(coinSubmissions)
          .where(inArray(coinSubmissions.submittedByUserId, userIds))
          .groupBy(coinSubmissions.submittedByUserId)
      : Promise.resolve([]),
  ]);
  const latestSessionByUser = new Map<string, (typeof sessionRows)[number]>();
  sessionRows.forEach((row) => {
    if (!latestSessionByUser.has(row.userId)) latestSessionByUser.set(row.userId, row);
  });
  const submittedCountsByUser = new Map<string, number>();
  submittedCountRows.forEach((row) => {
    if (!row.userId) return;
    submittedCountsByUser.set(row.userId, Number(row.count || 0));
  });

  const adminUsers = userRows.map((user) => {
    const latestSession = latestSessionByUser.get(user.id);

    return {
      id: user.id,
      avatar: emailInitials(user.email),
      avatarTone: emailTone(user.email),
      name: user.name,
      email: user.email,
      role: user.role || 'user',
      status: user.banned ? 'suspended' : 'active',
      projectsSubmitted: submittedCountsByUser.get(user.id) || 0,
      joinedAt: formatDateTime(user.createdAt),
      lastActive: latestSession ? formatDateTime(latestSession.updatedAt) : '—',
      lastIp: latestSession?.ipAddress || '—',
    };
  });

  return { users: adminUsers, pagination };
}

async function getAdminChangeRequests(requestedPage: number): Promise<Partial<AdminTabData>> {
  const total = await countTableRows(changeRequests);
  const pagination = buildPagination(total, requestedPage);
  const changeRequestRows = await db
    .select()
    .from(changeRequests)
    .orderBy(desc(changeRequests.createdAt))
    .limit(pagination.pageSize)
    .offset((pagination.page - 1) * pagination.pageSize);
  const coinById = await getCoinMapByIds(changeRequestRows.map((request) => request.coinId));

  const adminChangeRequests = changeRequestRows.map((request) => {
    const coin = coinById.get(request.coinId);
    return {
      id: request.id,
      coinId: request.coinId,
      coinName: coin?.name || `Coin #${request.coinId}`,
      coinSymbol: coin?.symbol || '',
      requesterEmail: request.requesterEmail,
      requesterTelegram: request.requesterTelegram || '',
      requestedChanges: request.requestedChanges,
      evidenceUrl: request.evidenceUrl || '',
      status: request.status,
      submittedAt: formatDateTime(request.createdAt),
    };
  });

  return { changeRequests: adminChangeRequests, pagination };
}

async function countPendingCoinSubmissions() {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(coinSubmissions)
    .where(
      and(eq(coinSubmissions.submissionType, 'new-coin'), eq(coinSubmissions.status, 'pending')),
    );
  return readCount(rows);
}

async function countPendingAirdropSubmissions() {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(airdropSubmissions)
    .where(eq(airdropSubmissions.status, 'pending'))
    .catch((error) => {
      if (isMissingRelationError(error, 'airdrop_submissions')) return [{ count: 0 }];
      throw error;
    });
  return readCount(rows);
}

async function countTableRows<TTable>(table: TTable) {
  const rows = await db.select({ count: sql<number>`count(*)::int` }).from(table as never);
  return readCount(rows);
}

function buildPagination(total: number, requestedPage: number): AdminTablePagination {
  const pages = Math.max(1, Math.ceil(total / adminPageSize));
  const page = Math.min(Math.max(1, requestedPage), pages);
  return { page, pageSize: adminPageSize, total, pages };
}

function normalizePositiveInteger(value: string | number | null | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

async function readActiveBoosts(nowIso: string, coinIds?: number[]) {
  if (coinIds && !coinIds.length) return [];
  return db
    .select()
    .from(coinBoosts)
    .where(
      and(
        sql`${coinBoosts.status} in ('active', 'scheduled')`,
        sql`${coinBoosts.expiresAt} > ${nowIso}::timestamptz`,
        coinIds?.length ? inArray(coinBoosts.coinId, coinIds) : undefined,
      ),
    )
    .orderBy(desc(coinBoosts.expiresAt));
}

async function readActivePromotions(nowIso: string, coinIds?: number[]) {
  if (coinIds && !coinIds.length) return [];
  return db
    .select()
    .from(coinPromotions)
    .where(
      and(
        sql`${coinPromotions.status} in ('active', 'scheduled')`,
        sql`${coinPromotions.expiresAt} > ${nowIso}::timestamptz`,
        coinIds?.length ? inArray(coinPromotions.coinId, coinIds) : undefined,
      ),
    )
    .orderBy(desc(coinPromotions.expiresAt));
}

async function getCoinSubmissionsByCoinIds(coinIds: number[]) {
  if (!coinIds.length) return [];
  return db
    .select()
    .from(coinSubmissions)
    .where(inArray(coinSubmissions.coinId, coinIds))
    .orderBy(desc(coinSubmissions.createdAt));
}

async function getUsersByIds(userIds: string[]) {
  const uniqueIds = uniqueStrings(userIds);
  if (!uniqueIds.length) return new Map<string, typeof users.$inferSelect>();
  const rows = await db.select().from(users).where(inArray(users.id, uniqueIds));
  return new Map(rows.map((user) => [user.id, user]));
}

async function getCoinsByIds(coinIds: number[]) {
  const uniqueIds = uniqueNumbers(coinIds);
  if (!uniqueIds.length) return [];
  return db.select().from(coins).where(inArray(coins.id, uniqueIds));
}

async function getCoinMapByIds(coinIds: number[]) {
  const rows = await getCoinsByIds(coinIds);
  return new Map(rows.map((coin) => [coin.id, coin]));
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function uniqueNumbers(values: number[]) {
  return Array.from(new Set(values.filter((value) => Number.isSafeInteger(value))));
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function buildAirdropSubmissionDetails(
  submission: typeof airdropSubmissions.$inferSelect,
  coin: typeof coins.$inferSelect,
) {
  const socialLinks = isRecord(submission.socialLinks) ? submission.socialLinks : {};

  return [
    {
      title: 'Airdrop',
      rows: [
        detail('Name', submission.name),
        detail('Project', `${coin.name}${coin.symbol ? ` (${coin.symbol})` : ''}`),
        detail('Description', submission.description),
        detail('Rewards', submission.rewards),
        detail('Number of winners', submission.winnersCount),
        detail('Claim Rewards URL', submission.claimRewardsUrl),
      ],
    },
    {
      title: 'Schedule',
      rows: [
        detail('Start', submission.startsAt.toISOString()),
        detail('End', submission.endsAt.toISOString()),
      ],
    },
    {
      title: 'Links',
      rows: [
        detail('Website', submission.website),
        detail('Telegram', socialLinks.telegram),
        detail('X / Twitter', socialLinks.x),
        detail('Reddit', socialLinks.reddit),
        detail('Discord', socialLinks.discord),
        detail('YouTube', socialLinks.youtube),
        detail('Facebook', socialLinks.facebook),
      ],
    },
    {
      title: 'Contact',
      rows: [detail('Email', submission.requesterEmail)],
    },
  ];
}

function readAirdropSocialLink(value: unknown, key: string) {
  if (!isRecord(value)) return '';
  return readString(value[key]) || '';
}

function readSubmissionData(value: unknown) {
  if (!isRecord(value)) {
    return {
      name: 'Untitled project',
      symbol: '',
      chain: '',
      logoUrl: null,
      contactTelegram: '',
      auditUrl: '',
    };
  }

  const basic = isRecord(value.basic) ? value.basic : null;
  const logo = isRecord(basic?.logo) ? basic.logo : null;
  const market = isRecord(value.market) ? value.market : null;
  const contact = isRecord(value.contact) ? value.contact : null;
  const security = isRecord(value.security) ? value.security : null;

  return {
    name: readString(basic?.name) || readString(value.name) || 'Untitled project',
    symbol: readString(basic?.symbol) || readString(value.symbol) || '',
    chain: readString(market?.primaryChain) || readString(value.chain) || '',
    logoUrl: readString(logo?.url) || readString(value.logoUrl) || null,
    contactTelegram: readString(contact?.telegram) || '',
    auditUrl: readString(security?.auditUrl) || '',
  };
}

function buildSubmissionFlag(data: ReturnType<typeof readSubmissionData>) {
  if (!data.auditUrl) return '';
  return '';
}

function buildSubmissionDetails(value: unknown) {
  const root = isRecord(value) ? value : {};
  const basic = isRecord(root.basic) ? root.basic : {};
  const logo = isRecord(basic.logo) ? basic.logo : {};
  const links = isRecord(root.links) ? root.links : {};
  const market = isRecord(root.market) ? root.market : {};
  const security = isRecord(root.security) ? root.security : {};
  const contact = isRecord(root.contact) ? root.contact : {};
  const chart = isRecord(market.chart) ? market.chart : {};
  const dex = isRecord(market.dex) ? market.dex : {};
  const presale = isRecord(market.presale) ? market.presale : {};
  const contracts = Array.isArray(market.contracts) ? market.contracts : [];

  return [
    {
      title: 'Basics',
      rows: [
        detail('Name', basic.name),
        detail('Symbol', basic.symbol),
        detail('Description', basic.description),
        detail('Categories', Array.isArray(basic.categories) ? basic.categories.join(', ') : ''),
        detail('Project type', readString(market.type) === 'presale' ? 'Presale' : 'Launched'),
        detail('Logo URL', logo.url),
        detail('Logo file', logo.fileName),
      ],
    },
    {
      title: 'Links',
      rows: [
        detail('Website', links.website),
        detail('Telegram', links.telegram),
        detail('X', links.x),
        detail('Discord', links.discord),
        detail('GitHub', links.github),
        detail('Whitepaper', links.whitepaper),
      ],
    },
    {
      title: 'Market',
      rows: [
        detail('Primary chain', market.primaryChain),
        detail('Contracts', formatContracts(contracts)),
        detail('Launch date', market.launchDate),
        detail('Chart provider', chart.provider),
        detail('Custom Chart Link', chart.customUrl),
        detail('DEX provider', dex.provider),
        detail('Custom DEX Link', dex.customUrl),
      ],
    },
    {
      title: 'Presale',
      rows: [
        detail('Presale Website Link', presale.website),
        detail('Start date', presale.startDate),
        detail('Start time', presale.startTime),
        detail('End date', presale.endDate),
        detail('End time', presale.endTime),
        detail('Payment token', presale.paymentToken),
        detail('Soft cap', presale.softCap),
        detail('Hard cap', presale.hardCap),
      ],
    },
    {
      title: 'Security',
      rows: [detail('KYC', security.kycUrl), detail('Audit', security.auditUrl)],
    },
    {
      title: 'Contact',
      rows: [detail('Email', contact.email), detail('Telegram', contact.telegram)],
    },
  ];
}

function detail(label: string, value: unknown) {
  return { label, value: formatDetailValue(value) };
}

function formatContracts(contracts: unknown[]) {
  if (!contracts.length) return '';
  return contracts
    .map((contract, index) => {
      if (!isRecord(contract)) return '';
      const chain = readString(contract.chain) || 'No chain';
      const address = readString(contract.address) || 'No address';
      return `Contract Address ${index + 1}: ${chain} · ${address}`;
    })
    .filter(Boolean)
    .join('\n');
}

function formatDetailValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatDetailValue).filter(Boolean).join(', ');
  if (isRecord(value)) return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  return readString(value) || '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function readCount(rows: Array<{ count: number | string | bigint }>) {
  return Number(rows[0]?.count || 0);
}

function formatChain(value: string) {
  if (!value) return '';
  return NETWORKS[value as keyof typeof NETWORKS]?.shortName || value;
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatInputDate(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function formatBannerSchedule(startsAt: Date, expiresAt: Date | null, now: Date) {
  if (startsAt > now) return `Starts in ${formatTimeRemaining(startsAt, now)}`;
  if (!expiresAt) return 'Active';
  if (expiresAt <= now) return 'Expired';
  return `${formatTimeRemaining(expiresAt, now)} left`;
}

function getBannerStatus(startsAt: Date, expiresAt: Date | null, now: Date) {
  if (expiresAt && expiresAt <= now) return 'inactive';
  if (startsAt > now) return 'scheduled';
  return 'active';
}

function getDurationDays(startsAt: Date, expiresAt: Date) {
  return Math.max(1, Math.ceil((expiresAt.getTime() - startsAt.getTime()) / 86_400_000));
}

function formatTimeRemaining(expiresAt: Date, now: Date) {
  const milliseconds = Math.max(0, expiresAt.getTime() - now.getTime());
  const hours = Math.ceil(milliseconds / 3_600_000);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainder = hours % 24;
  return remainder ? `${days}d ${remainder}h` : `${days}d`;
}

function emailInitials(email: string) {
  return (
    email
      .replace(/[^a-z0-9]/gi, '')
      .slice(0, 2)
      .toUpperCase() || 'SC'
  );
}

function emailTone(email: string) {
  const total = Array.from(email).reduce((sum, letter) => sum + letter.charCodeAt(0), 0);
  return (total % 6) + 1;
}
