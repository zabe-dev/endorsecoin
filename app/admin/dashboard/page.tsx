import { AdminDashboardClient } from '@/app/admin/dashboard/admin-dashboard-client';
import type {
  AdminBannerRow,
  AdminCoinRow,
  AdminSubmissionRow,
  AdminSummary,
  AdminUserRow,
} from '@/app/admin/dashboard/admin-dashboard-client';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { NETWORKS } from '@/features/coins/networks';
import { bannerPlacementLabels, normalizeBannerPlacement } from '@/features/ads/types';
import { processExpiredCoinDeletionRequests } from '@/features/coins/server/delete-requests';
import { processExpiredPresales } from '@/features/coins/server/presale-expiry';
import { hasAdminAccess } from '@/lib/auth/roles';
import { getCurrentSession } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import {
  coinBoosts,
  coinPromotions,
  coins,
  coinSubmissions,
  changeRequests,
  bannerAds,
  sessions,
  users,
} from '@/lib/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Admin Dashboard',
  robots: { index: false, follow: false },
};

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const session = await getCurrentSession();
  if (!session) redirect('/');
  if (!hasAdminAccess(session.user.role)) notFound();

  await processExpiredPresales();
  await processExpiredCoinDeletionRequests();

  const now = new Date();
  const nowIso = now.toISOString();
  const [
    userRows,
    coinRows,
    submissionRows,
    sessionRows,
    activeBoostRows,
    activePromotionRows,
    userCountRows,
    coinCountRows,
    activeBoostCoinCountRows,
    activePromotionCoinCountRows,
    pendingSubmissionCount,
    changeRequestRows,
    pendingChangeRequestCount,
    bannerAdRows,
    activeBannerCountRows,
  ] = await Promise.all([
    db.select().from(users).orderBy(desc(users.createdAt)).limit(200),
    db.select().from(coins).orderBy(desc(coins.submittedAt)).limit(200),
    db.select().from(coinSubmissions).orderBy(desc(coinSubmissions.createdAt)).limit(500),
    db.select().from(sessions).orderBy(desc(sessions.updatedAt)).limit(1000),
    db
      .select()
      .from(coinBoosts)
      .where(
        and(
          sql`${coinBoosts.status} in ('active', 'scheduled')`,
          sql`${coinBoosts.expiresAt} > ${nowIso}::timestamptz`,
        ),
      )
      .orderBy(desc(coinBoosts.expiresAt)),
    db
      .select()
      .from(coinPromotions)
      .where(
        and(
          sql`${coinPromotions.status} in ('active', 'scheduled')`,
          sql`${coinPromotions.expiresAt} > ${nowIso}::timestamptz`,
        ),
      )
      .orderBy(desc(coinPromotions.expiresAt)),
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
    db.select().from(changeRequests).orderBy(desc(changeRequests.createdAt)).limit(200),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(changeRequests)
      .where(eq(changeRequests.status, 'pending')),
    db
      .select()
      .from(bannerAds)
      .orderBy(desc(bannerAds.updatedAt))
      .limit(200)
      .catch((error) => {
        console.warn(
          '[admin] Banner ad rows unavailable:',
          error instanceof Error ? error.message : error,
        );
        return [];
      }),
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
  ]);

  const userById = new Map(userRows.map((user) => [user.id, user]));
  const coinById = new Map(coinRows.map((coin) => [coin.id, coin]));
  const latestSessionByUser = new Map<string, (typeof sessionRows)[number]>();
  sessionRows.forEach((row) => {
    if (!latestSessionByUser.has(row.userId)) latestSessionByUser.set(row.userId, row);
  });

  const submissionsByCoinId = new Map<number, (typeof submissionRows)[number]>();
  submissionRows.forEach((submission) => {
    if (submission.coinId && !submissionsByCoinId.has(submission.coinId)) {
      submissionsByCoinId.set(submission.coinId, submission);
    }
  });

  const submittedCountsByUser = new Map<string, number>();
  submissionRows.forEach((submission) => {
    if (!submission.submittedByUserId) return;
    submittedCountsByUser.set(
      submission.submittedByUserId,
      (submittedCountsByUser.get(submission.submittedByUserId) || 0) + 1,
    );
  });

  const activeBoostByCoin = new Map(activeBoostRows.map((boost) => [boost.coinId, boost]));
  const activePromotionByCoin = new Map(
    activePromotionRows.map((promotion) => [promotion.coinId, promotion]),
  );

  const pendingSubmissions: AdminSubmissionRow[] = submissionRows
    .filter(
      (submission) => submission.submissionType === 'new-coin' && submission.status === 'pending',
    )
    .map((submission) => {
      const data = readSubmissionData(submission.coinData);
      const submitter = submission.submittedByUserId
        ? userById.get(submission.submittedByUserId)
        : null;

      return {
        id: submission.id,
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

  const listedCoins: AdminCoinRow[] = coinRows.map((coin) => {
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

  const adminUsers: AdminUserRow[] = userRows.map((user) => {
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

  const summary: AdminSummary = {
    users: readCount(userCountRows),
    coins: readCount(coinCountRows),
    activeBoosts: readCount(activeBoostCoinCountRows),
    promotedCoins: readCount(activePromotionCoinCountRows),
    activeBanners: readCount(activeBannerCountRows),
    pendingSubmissions: readCount(pendingSubmissionCount),
    changeRequests: readCount(pendingChangeRequestCount),
  };

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

  const adminBannerAds: AdminBannerRow[] = bannerAdRows.map((banner) => ({
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
          pendingSubmissions={pendingSubmissions}
          changeRequests={adminChangeRequests}
          listedCoins={listedCoins}
          bannerAds={adminBannerAds}
          users={adminUsers}
          initialTab={resolvedSearchParams?.tab}
        />
      </section>
      <SiteFooter />
    </main>
  );
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
