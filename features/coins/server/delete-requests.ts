import 'server-only';

import { db } from '@/lib/db/client';
import { coinSubmissions, coins } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { invalidateCoinDiscoveryCache } from './cache-invalidation';

export async function processExpiredCoinDeletionRequests() {
  try {
    const now = new Date();
    const deletionRequests = await db
      .select({
        id: coinSubmissions.id,
        coinId: coinSubmissions.coinId,
        coinData: coinSubmissions.coinData,
      })
      .from(coinSubmissions)
      .where(
        and(
          eq(coinSubmissions.submissionType, 'delete-request'),
          eq(coinSubmissions.status, 'pending'),
        ),
      );
    const expiredRequests = deletionRequests.filter((request) => {
      const data = isRecord(request.coinData) ? request.coinData : null;
      const scheduledDeleteAt = data ? data.scheduledDeleteAt : null;
      if (typeof scheduledDeleteAt !== 'string') return false;

      const scheduledTime = Date.parse(scheduledDeleteAt);
      return Number.isFinite(scheduledTime) && scheduledTime <= now.getTime();
    });

    if (!expiredRequests.length) {
      return { completedRequests: 0, deletedCoins: 0 };
    }

    const requestIds = expiredRequests.map((request) => request.id);
    const coinIds = Array.from(
      new Set(
        expiredRequests
          .map((request) => request.coinId)
          .filter((coinId): coinId is number => typeof coinId === 'number'),
      ),
    );

    await db.transaction(async (tx) => {
      await tx
        .update(coinSubmissions)
        .set({ status: 'approved', reviewedAt: now, updatedAt: now })
        .where(inArray(coinSubmissions.id, requestIds));

      if (coinIds.length) {
        await tx.delete(coins).where(inArray(coins.id, coinIds));
      }
    });

    await invalidateCoinDiscoveryCache();

    return { completedRequests: requestIds.length, deletedCoins: coinIds.length };
  } catch (error) {
    console.warn(
      '[delete-requests] Expired deletion cleanup skipped:',
      error instanceof Error ? error.message : error,
    );
    return { completedRequests: 0, deletedCoins: 0 };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
