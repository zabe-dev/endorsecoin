'use server';

import { invalidateBannerAdCache } from '@/features/ads/server/cache-invalidation';
import { bannerPlacementLabels, bannerPlacements } from '@/features/ads/types';
import { invalidateCoinDiscoveryCache } from '@/features/coins/server/cache-invalidation';
import { getCurrentSession } from '@/lib/auth/session';
import { hasAdminAccess } from '@/lib/auth/roles';
import { db } from '@/lib/db/client';
import {
  adminAuditLogs,
  bannerAds,
  changeRequests,
  coinBoosts,
  coinLinks,
  coinPromotions,
  coins,
  coinSubmissions,
  users,
} from '@/lib/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import { revalidatePath, revalidateTag } from 'next/cache';
import { notFound, redirect } from 'next/navigation';

const userRoles = ['user', 'admin'] as const;
const coinStatuses = ['active', 'hidden', 'suspended', 'rejected'] as const;
const submissionStatuses = [
  'pending',
  'in-review',
  'needs-changes',
  'approved',
  'rejected',
] as const;
const changeRequestStatuses = ['pending', 'resolved', 'rejected'] as const;
const boostMultipliers = [10, 30, 50, 100, 500] as const;
const boostPackageRules = {
  10: { durationHours: 24, voteMultiplier: 2 },
  30: { durationHours: 72, voteMultiplier: 2 },
  50: { durationHours: 24, voteMultiplier: 3 },
  100: { durationHours: 72, voteMultiplier: 3 },
  500: { durationHours: 168, voteMultiplier: 5 },
} as const;

type AdminTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type CoinSubmissionRecord = typeof coinSubmissions.$inferSelect;

export async function updateAdminUser(formData: FormData) {
  const adminUser = await requireAdmin();
  const userId = readRequired(formData, 'userId');
  const name = readOptional(formData, 'name');
  const email = readOptional(formData, 'email');
  const role = readEnum(formData, 'role', userRoles);
  const banned = formData.get('banned') === 'on';
  const banReason = readOptional(formData, 'banReason');

  if (userId === adminUser.id && (role !== 'admin' || banned)) {
    throw new Error('You cannot remove your own admin access or ban yourself.');
  }

  await db
    .update(users)
    .set({
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
      role,
      banned,
      banReason: banned ? banReason || 'Admin action' : null,
      banExpires: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  await audit(adminUser.id, 'user.updated', 'user', userId, {
    name,
    email,
    role,
    banned,
    banReason: banned ? banReason || 'Admin action' : null,
  });
  revalidatePath('/admin/dashboard');
}

export async function deleteAdminUser(formData: FormData) {
  const adminUser = await requireAdmin();
  const userId = readRequired(formData, 'userId');

  if (userId === adminUser.id) {
    throw new Error('You cannot delete your own admin account.');
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  await db.delete(users).where(eq(users.id, userId));
  await audit(adminUser.id, 'user.deleted', 'user', userId, {
    email: user?.email || null,
    role: user?.role || null,
    banned: user?.banned || false,
  });
  await invalidateCoinDiscoveryCache();
  revalidatePath('/admin/dashboard');
}

export async function updateAdminCoin(formData: FormData) {
  const adminUser = await requireAdmin();
  const coinId = readNumber(formData, 'coinId');
  const listingStatus = readEnum(formData, 'listingStatus', coinStatuses);
  const category = readOptional(formData, 'category');

  await db
    .update(coins)
    .set({
      listingStatus,
      ...(category ? { category } : {}),
      updatedAt: new Date(),
    })
    .where(eq(coins.id, coinId));

  await audit(adminUser.id, 'coin.updated', 'coin', String(coinId), { listingStatus, category });
  await invalidateCoinDiscoveryCache(coinId);
  revalidatePath('/admin/dashboard');
}

export async function deleteAdminCoin(formData: FormData) {
  const adminUser = await requireAdmin();
  const coinId = readNumber(formData, 'coinId');

  const [coin] = await db.select().from(coins).where(eq(coins.id, coinId)).limit(1);
  await db.delete(coins).where(eq(coins.id, coinId));
  await audit(adminUser.id, 'coin.deleted', 'coin', String(coinId), {
    name: coin?.name || null,
    symbol: coin?.symbol || null,
    chain: coin?.chain || null,
    listingStatus: coin?.listingStatus || null,
  });
  await invalidateCoinDiscoveryCache(coinId);
  revalidatePath('/admin/dashboard');
  revalidatePath('/');
}

export async function updateAdminSubmission(formData: FormData) {
  const adminUser = await requireAdmin();
  const submissionId = readRequired(formData, 'submissionId');
  const status = readEnum(formData, 'status', submissionStatuses);
  const reviewReason = readOptional(formData, 'reviewReason');
  let approvedCoinId: number | null = null;
  let previousStatus: string | null = null;
  let requesterEmail: string | null = null;

  if (status === 'rejected' && !reviewReason) {
    throw new Error('A rejection reason is required.');
  }

  await db.transaction(async (tx) => {
    const [submission] = await tx
      .select()
      .from(coinSubmissions)
      .where(eq(coinSubmissions.id, submissionId))
      .limit(1);

    if (!submission) throw new Error('Submission not found.');

    previousStatus = submission.status;
    requesterEmail = submission.requesterEmail;

    if (status === 'approved') {
      approvedCoinId = submission.coinId || (await createCoinFromSubmission(tx, submission));
    }

    await tx
      .update(coinSubmissions)
      .set({
        status,
        coinId: approvedCoinId || submission.coinId,
        reviewedAt: ['approved', 'rejected'].includes(status) ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(coinSubmissions.id, submissionId));
  });

  await audit(adminUser.id, 'submission.updated', 'submission', submissionId, {
    previousStatus,
    status,
    reviewReason,
    requesterEmail,
    coinId: approvedCoinId,
  });
  await invalidateCoinDiscoveryCache(approvedCoinId);
  revalidatePath('/admin/dashboard');
  revalidatePath('/');
  if (approvedCoinId) revalidatePath(`/coin/${approvedCoinId}`);
}

export async function grantCoinBoost(formData: FormData) {
  const adminUser = await requireAdmin();
  const coinId = readNumber(formData, 'coinId');
  const multiplier = readNumber(formData, 'multiplier');
  const extensionDays = readOptionalBoundedNumber(formData, 'extensionDays', 0, 0, 365);
  const notes = readOptional(formData, 'notes');

  if (!boostMultipliers.includes(multiplier as (typeof boostMultipliers)[number])) {
    throw new Error('Invalid boost package.');
  }

  const rule = boostPackageRules[multiplier as keyof typeof boostPackageRules];
  const now = new Date();
  const [existingBoost] = await db
    .select()
    .from(coinBoosts)
    .where(
      and(
        eq(coinBoosts.coinId, coinId),
        sql`${coinBoosts.status} in ('active', 'scheduled')`,
        sql`${coinBoosts.expiresAt} > ${now.toISOString()}::timestamptz`,
      ),
    )
    .orderBy(desc(coinBoosts.expiresAt))
    .limit(1);

  if (existingBoost) {
    const currentStatus = getScheduleStatus(existingBoost.startsAt, existingBoost.expiresAt);
    if (currentStatus === 'active') {
      if (extensionDays < 1) throw new Error('Add at least 1 day to extend an active boost.');
      await db
        .update(coinBoosts)
        .set({
          expiresAt: addHours(existingBoost.expiresAt, extensionDays * 24),
          assignedByUserId: adminUser.id,
          notes,
          updatedAt: now,
        })
        .where(eq(coinBoosts.id, existingBoost.id));
      await audit(adminUser.id, 'boost.extended', 'coin', String(coinId), {
        package: existingBoost.multiplier,
        extensionDays,
        notes: notes || null,
      });
      await invalidateCoinDiscoveryCache(coinId);
      revalidatePath('/admin/dashboard');
      return;
    }
  }

  const startsAt = readUtcStartDateOrNow(formData, 'startDate');
  const expiresAt = addHours(startsAt, rule.durationHours);
  const status = getScheduleStatus(startsAt, expiresAt);

  await cancelOpenBoosts(coinId);
  await db.insert(coinBoosts).values({
    coinId,
    multiplier,
    status,
    startsAt,
    expiresAt,
    assignedByUserId: adminUser.id,
    notes,
  });

  await audit(adminUser.id, 'boost.granted', 'coin', String(coinId), {
    package: multiplier,
    voteMultiplier: rule.voteMultiplier,
    durationHours: rule.durationHours,
    status,
    startsAt,
    expiresAt,
    notes: notes || null,
  });
  await invalidateCoinDiscoveryCache(coinId);
  revalidatePath('/admin/dashboard');
}

export async function removeCoinBoost(formData: FormData) {
  const adminUser = await requireAdmin();
  const coinId = readNumber(formData, 'coinId');
  const activeBoosts = await db
    .select()
    .from(coinBoosts)
    .where(and(eq(coinBoosts.coinId, coinId), sql`${coinBoosts.status} in ('active', 'scheduled')`));

  await cancelActiveBoosts(coinId);
  await audit(adminUser.id, 'boost.removed', 'coin', String(coinId), {
    activeBoosts: activeBoosts.map((boost) => ({
      id: boost.id,
      multiplier: boost.multiplier,
      expiresAt: boost.expiresAt,
      notes: boost.notes,
    })),
  });
  await invalidateCoinDiscoveryCache(coinId);
  revalidatePath('/admin/dashboard');
}

export async function addPromotedCoin(formData: FormData) {
  const adminUser = await requireAdmin();
  const coinId = readNumber(formData, 'coinId');
  const durationDays = readBoundedNumber(formData, 'durationDays', 1, 365);
  const extensionDays = readOptionalBoundedNumber(formData, 'extensionDays', 0, 0, 365);
  const priority = readBoundedNumber(formData, 'priority', 1, 999);
  const notes = readOptional(formData, 'notes');

  const now = new Date();
  const nowIso = now.toISOString();
  const [existingPromotion] = await db
    .select()
    .from(coinPromotions)
    .where(
      and(
        eq(coinPromotions.coinId, coinId),
        sql`${coinPromotions.status} in ('active', 'scheduled')`,
        sql`${coinPromotions.expiresAt} > ${nowIso}::timestamptz`,
      ),
    )
    .orderBy(desc(coinPromotions.expiresAt))
    .limit(1);

  if (existingPromotion) {
    const currentStatus = getScheduleStatus(existingPromotion.startsAt, existingPromotion.expiresAt);
    if (currentStatus === 'active') {
      if (extensionDays < 1) throw new Error('Add at least 1 day to extend an active promotion.');
      await db
        .update(coinPromotions)
        .set({
          priority,
          expiresAt: addHours(existingPromotion.expiresAt, extensionDays * 24),
          assignedByUserId: adminUser.id,
          notes,
          updatedAt: now,
        })
        .where(eq(coinPromotions.id, existingPromotion.id));
      await audit(adminUser.id, 'promotion.extended', 'coin', String(coinId), {
        extensionDays,
        priority,
        notes: notes || null,
      });
      await invalidateCoinDiscoveryCache(coinId);
      revalidatePath('/admin/dashboard');
      return;
    }

    const startsAt = readUtcStartDateOrNow(formData, 'startDate');
    const expiresAt = addHours(startsAt, durationDays * 24);
    await db
      .update(coinPromotions)
      .set({
        priority,
        status: getScheduleStatus(startsAt, expiresAt),
        startsAt,
        expiresAt,
        assignedByUserId: adminUser.id,
        notes,
        updatedAt: now,
      })
      .where(eq(coinPromotions.id, existingPromotion.id));
  } else {
    const startsAt = readUtcStartDateOrNow(formData, 'startDate');
    const expiresAt = addHours(startsAt, durationDays * 24);
    await db.insert(coinPromotions).values({
      coinId,
      placement: 'promoted-table',
      priority,
      status: getScheduleStatus(startsAt, expiresAt),
      startsAt,
      expiresAt,
      assignedByUserId: adminUser.id,
      notes,
    });
  }

  await audit(adminUser.id, 'promotion.added', 'coin', String(coinId), {
    durationDays,
    priority,
    notes: notes || null,
  });
  await invalidateCoinDiscoveryCache(coinId);
  revalidatePath('/admin/dashboard');
}

export async function removePromotedCoin(formData: FormData) {
  const adminUser = await requireAdmin();
  const coinId = readNumber(formData, 'coinId');
  const activePromotions = await db
    .select()
    .from(coinPromotions)
    .where(
      and(eq(coinPromotions.coinId, coinId), sql`${coinPromotions.status} in ('active', 'scheduled')`),
    );

  await cancelActivePromotions(coinId);
  await audit(adminUser.id, 'promotion.removed', 'coin', String(coinId), {
    activePromotions: activePromotions.map((promotion) => ({
      id: promotion.id,
      placement: promotion.placement,
      priority: promotion.priority,
      expiresAt: promotion.expiresAt,
      notes: promotion.notes,
    })),
  });
  await invalidateCoinDiscoveryCache(coinId);
  revalidatePath('/admin/dashboard');
}

export async function updateChangeRequestStatus(formData: FormData) {
  const adminUser = await requireAdmin();
  const requestId = readRequired(formData, 'requestId');
  const status = readEnum(formData, 'status', changeRequestStatuses);

  await db
    .update(changeRequests)
    .set({
      status,
      reviewedAt: status === 'pending' ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(eq(changeRequests.id, requestId));

  await audit(adminUser.id, 'change-request.updated', 'change-request', requestId, { status });
  revalidatePath('/admin/dashboard');
}

export async function createBannerAd(formData: FormData) {
  const adminUser = await requireAdmin();
  const placement = readEnum(formData, 'placement', bannerPlacements);
  const desktopImageUrl = readUrl(formData, 'desktopImageUrl');
  const mobileImageUrl = readUrl(formData, 'mobileImageUrl');
  const targetUrl = readUrl(formData, 'targetUrl');
  const priority = readBoundedNumber(formData, 'priority', 1, 999);
  const durationDays = readBoundedNumber(formData, 'durationDays', 1, 365);
  const startsAt = readUtcStartDateOrNow(formData, 'startDate');
  const expiresAt = addHours(startsAt, durationDays * 24);
  const status = getScheduleStatus(startsAt, expiresAt);
  const notes = readOptional(formData, 'notes');
  const title = `${bannerPlacementLabels[placement]} creative`;

  await db.insert(bannerAds).values({
    placement,
    title,
    subtitle: null,
    desktopImageUrl,
    mobileImageUrl,
    targetUrl,
    status,
    priority,
    startsAt,
    expiresAt,
    assignedByUserId: adminUser.id,
    notes: notes || null,
  });

  await audit(adminUser.id, 'banner.created', 'banner', title, {
    placement,
    priority,
    status,
    durationDays,
    startsAt,
    expiresAt,
    notes: notes || null,
  });
  await revalidateBannerPaths();
}

export async function updateBannerAd(formData: FormData) {
  const adminUser = await requireAdmin();
  const bannerId = readRequired(formData, 'bannerId');
  const [existing] = await db.select().from(bannerAds).where(eq(bannerAds.id, bannerId)).limit(1);
  if (!existing) throw new Error('Banner ad was not found.');

  const currentStatus = getScheduleStatus(existing.startsAt, existing.expiresAt);
  if (currentStatus === 'inactive') {
    await db
      .update(bannerAds)
      .set({ status: 'inactive', updatedAt: new Date() })
      .where(eq(bannerAds.id, bannerId));
    throw new Error('Inactive ads cannot be edited. Create a new booking instead.');
  }

  const placement = readEnum(formData, 'placement', bannerPlacements);
  const desktopImageUrl = readUrl(formData, 'desktopImageUrl');
  const mobileImageUrl = readUrl(formData, 'mobileImageUrl');
  const targetUrl = readUrl(formData, 'targetUrl');
  const priority = readBoundedNumber(formData, 'priority', 1, 999);
  const notes = readOptional(formData, 'notes');
  const title = `${bannerPlacementLabels[placement]} creative`;
  let startsAt = existing.startsAt;
  let expiresAt = existing.expiresAt;

  if (currentStatus === 'scheduled') {
    const durationDays = readBoundedNumber(formData, 'durationDays', 1, 365);
    startsAt = readUtcStartDateOrNow(formData, 'startDate');
    expiresAt = addHours(startsAt, durationDays * 24);
  } else {
    const extensionDays = readBoundedNumber(formData, 'extensionDays', 0, 365);
    if (extensionDays > 0) {
      expiresAt = addHours(existing.expiresAt || new Date(), extensionDays * 24);
    }
  }

  const status = getScheduleStatus(startsAt, expiresAt);

  await db
    .update(bannerAds)
    .set({
      placement,
      title,
      subtitle: null,
      desktopImageUrl,
      mobileImageUrl,
      targetUrl,
      status,
      priority,
      startsAt,
      expiresAt,
      notes: notes || null,
      assignedByUserId: adminUser.id,
      updatedAt: new Date(),
    })
    .where(eq(bannerAds.id, bannerId));

  await audit(adminUser.id, 'banner.updated', 'banner', bannerId, {
    placement,
    status,
    priority,
    currentStatus,
    startsAt,
    expiresAt,
    notes: notes || null,
  });
  await revalidateBannerPaths();
}

export async function deleteBannerAd(formData: FormData) {
  const adminUser = await requireAdmin();
  const bannerId = readRequired(formData, 'bannerId');

  const [banner] = await db.select().from(bannerAds).where(eq(bannerAds.id, bannerId)).limit(1);
  await db.delete(bannerAds).where(eq(bannerAds.id, bannerId));
  await audit(adminUser.id, 'banner.deleted', 'banner', bannerId, {
    title: banner?.title || null,
    placement: banner?.placement || null,
    status: banner?.status || null,
    targetUrl: banner?.targetUrl || null,
    notes: banner?.notes || null,
  });
  await revalidateBannerPaths();
}

async function requireAdmin() {
  const session = await getCurrentSession();
  if (!session) redirect('/');
  if (!hasAdminAccess(session.user.role)) notFound();
  return session.user;
}

async function createCoinFromSubmission(tx: AdminTransaction, submission: CoinSubmissionRecord) {
  const data = parseSubmissionData(submission.coinData);
  if (!data.name || !data.symbol) throw new Error('Submission is missing project basics.');

  const [{ nextId }] = await tx
    .select({ nextId: sql<number>`coalesce(max(${coins.id}), 999) + 1` })
    .from(coins);

  const coinId = nextId;
  const now = new Date();

  await tx.insert(coins).values({
    id: coinId,
    slug: `${slugify(data.name)}-${coinId}`,
    name: data.name,
    symbol: data.symbol,
    logoUrl: data.logoUrl || null,
    description: data.description || null,
    category: data.categories[0] || 'Other',
    chain: data.primaryChain || null,
    contractAddress: data.primaryContractAddress || null,
    launchDate: data.isPresale || !data.launchDate ? null : new Date(data.launchDate),
    listingSource: 'submission',
    listingStatus: 'active',
    isPresale: data.isPresale,
    submittedAt: submission.createdAt,
    createdAt: now,
    updatedAt: now,
  });

  const links = buildCoinLinksFromSubmission(data, coinId);
  if (links.length) await tx.insert(coinLinks).values(links);

  return coinId;
}

function parseSubmissionData(value: unknown) {
  const root = isRecord(value) ? value : {};
  const basic = isRecord(root.basic) ? root.basic : {};
  const logo = isRecord(basic.logo) ? basic.logo : {};
  const links = isRecord(root.links) ? root.links : {};
  const market = isRecord(root.market) ? root.market : {};
  const chart = isRecord(market.chart) ? market.chart : {};
  const dex = isRecord(market.dex) ? market.dex : {};
  const presale = isRecord(market.presale) ? market.presale : {};
  const security = isRecord(root.security) ? root.security : {};
  const contracts = Array.isArray(market.contracts)
    ? market.contracts
        .map((contract) =>
          isRecord(contract)
            ? {
                chain: readRecordString(contract.chain),
                address: readRecordString(contract.address),
              }
            : { chain: '', address: '' },
        )
        .filter((contract) => contract.chain || contract.address)
    : [];
  const primaryContract = contracts.find((contract) => contract.address) || contracts[0];

  return {
    name: readRecordString(basic.name),
    symbol: readRecordString(basic.symbol).toUpperCase(),
    description: readRecordText(basic.description),
    categories: Array.isArray(basic.categories)
      ? basic.categories.filter((category): category is string => typeof category === 'string')
      : [],
    logoUrl: readRecordString(logo.url),
    isPresale: readRecordString(market.type) === 'presale' || basic.isPresale === true,
    primaryChain: readRecordString(market.primaryChain) || primaryContract?.chain || '',
    primaryContractAddress: primaryContract?.address || '',
    launchDate: readRecordString(market.launchDate),
    links: {
      website: readRecordString(links.website),
      telegram: readRecordString(links.telegram),
      x: readRecordString(links.x),
      discord: readRecordString(links.discord),
      github: readRecordString(links.github),
      whitepaper: readRecordString(links.whitepaper),
      chart: readRecordString(chart.customUrl),
      dex: readRecordString(dex.customUrl),
      presaleWebsite: readRecordString(presale.website),
      kyc: readRecordString(security.kycUrl),
      audit: readRecordString(security.auditUrl),
    },
  };
}

function buildCoinLinksFromSubmission(
  data: ReturnType<typeof parseSubmissionData>,
  coinId: number,
) {
  return [
    { type: 'website', url: data.links.website },
    { type: 'telegram', url: data.links.telegram },
    { type: 'x', url: data.links.x },
    { type: 'discord', url: data.links.discord },
    { type: 'github', url: data.links.github },
    { type: 'whitepaper', url: data.links.whitepaper },
    { type: 'chart', url: data.isPresale ? '' : data.links.chart },
    { type: 'dex', url: data.isPresale ? '' : data.links.dex },
    { type: 'presale-website', url: data.isPresale ? data.links.presaleWebsite : '' },
    { type: 'kyc', url: data.links.kyc },
    { type: 'audit', url: data.links.audit },
  ]
    .filter((link) => link.url)
    .map((link) => ({
      coinId,
      type: link.type,
      url: link.url,
    }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readRecordString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function readRecordText(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function slugify(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'coin'
  );
}

async function cancelActiveBoosts(coinId: number) {
  await db
    .update(coinBoosts)
    .set({ status: 'canceled', updatedAt: new Date() })
    .where(and(eq(coinBoosts.coinId, coinId), sql`${coinBoosts.status} in ('active', 'scheduled')`));
}

async function cancelOpenBoosts(coinId: number) {
  await db
    .update(coinBoosts)
    .set({ status: 'canceled', updatedAt: new Date() })
    .where(and(eq(coinBoosts.coinId, coinId), sql`${coinBoosts.status} in ('active', 'scheduled')`));
}

async function cancelActivePromotions(coinId: number) {
  await db
    .update(coinPromotions)
    .set({ status: 'canceled', updatedAt: new Date() })
    .where(
      and(eq(coinPromotions.coinId, coinId), sql`${coinPromotions.status} in ('active', 'scheduled')`),
    );
}

async function audit(
  adminUserId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown>,
) {
  await db.insert(adminAuditLogs).values({
    adminUserId,
    action,
    targetType,
    targetId,
    metadata,
  });
}

function readRequired(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${key} is required.`);
  return value.trim();
}

function readOptional(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function readNumber(formData: FormData, key: string) {
  const value = Number(readRequired(formData, key));
  if (!Number.isFinite(value)) throw new Error(`${key} is invalid.`);
  return value;
}

function readBoundedNumber(formData: FormData, key: string, min: number, max: number) {
  const value = readNumber(formData, key);
  if (value < min || value > max) throw new Error(`${key} must be between ${min} and ${max}.`);
  return value;
}

function readOptionalBoundedNumber(
  formData: FormData,
  key: string,
  fallback: number,
  min: number,
  max: number,
) {
  const raw = readOptional(formData, key);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${key} must be between ${min} and ${max}.`);
  }
  return value;
}

function readEnum<T extends readonly string[]>(formData: FormData, key: string, options: T) {
  const value = readRequired(formData, key);
  if (!options.includes(value)) throw new Error(`${key} is invalid.`);
  return value as T[number];
}

function readUrl(formData: FormData, key: string) {
  const value = readRequired(formData, key);
  assertUrl(value, key);
  return value;
}

function assertUrl(value: string, key: string) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid protocol');
  } catch {
    throw new Error(`${key} must be a valid URL.`);
  }
}

async function revalidateBannerPaths() {
  await invalidateBannerAdCache();
  revalidateTag('banner-ads', 'max');
  revalidatePath('/admin/dashboard');
  revalidatePath('/');
  revalidatePath('/coin/[id]', 'page');
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function readUtcStartDateOrNow(formData: FormData, key: string) {
  const value = readOptional(formData, key);
  if (!value) return new Date();

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error('Start date must be a valid date.');

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0));
  if (Number.isNaN(date.getTime())) throw new Error('Start date must be a valid date.');

  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  if (date < todayUtc) throw new Error('Start date must be today or a future date.');

  return date;
}

function getScheduleStatus(startsAt: Date, expiresAt: Date | null) {
  const now = new Date();
  if (expiresAt && expiresAt <= now) return 'inactive';
  if (startsAt > now) return 'scheduled';
  return 'active';
}
