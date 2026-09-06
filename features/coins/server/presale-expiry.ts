import 'server-only';

import { db } from '@/lib/db/client';
import { coins, coinSubmissions } from '@/lib/db/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { invalidateCoinDiscoveryCache } from './cache-invalidation';

type PresaleCoin = Pick<typeof coins.$inferSelect, 'id'>;
type SubmissionRow = Pick<typeof coinSubmissions.$inferSelect, 'coinId' | 'coinData'>;

export async function processExpiredPresales() {
  try {
    const presaleCoins = await db
      .select({ id: coins.id })
      .from(coins)
      .where(and(eq(coins.isPresale, true), eq(coins.listingStatus, 'active')));

    if (!presaleCoins.length) return { converted: 0 };

    const coinIds = presaleCoins.map((coin) => coin.id);
    const submissionRows = await db
      .select({ coinId: coinSubmissions.coinId, coinData: coinSubmissions.coinData })
      .from(coinSubmissions)
      .where(
        and(
          inArray(coinSubmissions.coinId, coinIds),
          eq(coinSubmissions.submissionType, 'new-coin'),
        ),
      )
      .orderBy(desc(coinSubmissions.createdAt));

    const submissionByCoin = firstSubmissionByCoin(submissionRows);
    const expiredCoins: Array<PresaleCoin & { endDate: Date; submission?: SubmissionRow }> = [];
    presaleCoins.forEach((coin) => {
      const submission = submissionByCoin.get(coin.id);
      const endDate = getPresaleEndDate(submission?.coinData);
      if (endDate && endDate.getTime() <= Date.now()) {
        expiredCoins.push({ ...coin, endDate, submission });
      }
    });

    if (!expiredCoins.length) return { converted: 0 };

    await db.transaction(async (tx) => {
      for (const coin of expiredCoins) {
        await tx
          .update(coins)
          .set({ isPresale: false, launchDate: null, updatedAt: new Date() })
          .where(eq(coins.id, coin.id));

        if (coin.submission?.coinData) {
          await tx
            .update(coinSubmissions)
            .set({
              coinData: buildLaunchedSubmissionData(coin.submission.coinData),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(coinSubmissions.coinId, coin.id),
                eq(coinSubmissions.submissionType, 'new-coin'),
              ),
            );
        }
      }
    });

    await invalidateCoinDiscoveryCache();

    return { converted: expiredCoins.length };
  } catch (error) {
    console.warn(
      '[presale-expiry] Expired presale conversion skipped:',
      error instanceof Error ? error.message : error,
    );
    return { converted: 0 };
  }
}

function firstSubmissionByCoin(rows: SubmissionRow[]) {
  const map = new Map<number, SubmissionRow>();
  rows.forEach((row) => {
    if (typeof row.coinId === 'number' && !map.has(row.coinId)) {
      map.set(row.coinId, row);
    }
  });
  return map;
}

function getPresaleEndDate(value: unknown) {
  if (!isRecord(value)) return null;
  const market = isRecord(value.market) ? value.market : {};
  const rootPresale = isRecord(value.presale) ? value.presale : {};
  const marketPresale = isRecord(market.presale) ? market.presale : {};
  const endDate =
    readString(marketPresale.endDate) ||
    readString(rootPresale.endDate) ||
    readString(market.presaleEndDate) ||
    readString(value.presaleEndDate);
  const endTime =
    readString(marketPresale.endTime) ||
    readString(rootPresale.endTime) ||
    readString(market.presaleEndTime) ||
    readString(value.presaleEndTime) ||
    '00:00';
  if (!endDate) return null;

  const date = parseUtcDateTime(endDate, endTime);
  return Number.isFinite(date.getTime()) ? date : null;
}

function parseUtcDateTime(dateValue: string, timeValue: string) {
  const normalizedDate = dateValue.trim();
  if (normalizedDate.includes('T')) return new Date(normalizedDate);

  const normalizedTime = timeValue.trim();
  const timeWithSeconds = /^\d{2}:\d{2}$/.test(normalizedTime)
    ? `${normalizedTime}:00`
    : normalizedTime;

  return new Date(`${normalizedDate}T${timeWithSeconds || '00:00:00'}.000Z`);
}

function buildLaunchedSubmissionData(value: unknown) {
  if (!isRecord(value)) return value;
  const basic = isRecord(value.basic) ? value.basic : {};
  const market = isRecord(value.market) ? value.market : {};

  return {
    ...value,
    basic: {
      ...basic,
      isPresale: false,
    },
    market: {
      ...market,
      type: 'launched',
      launchDate: '',
      presale: null,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}
