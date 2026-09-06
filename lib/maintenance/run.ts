import 'server-only';

import { syncBannerAdStatuses } from '@/features/ads/server/banner-ads';
import { processExpiredCoinDeletionRequests } from '@/features/coins/server/delete-requests';
import { processExpiredPresales } from '@/features/coins/server/presale-expiry';
import { refreshTopbarPrices } from '@/features/topbar/server/market-prices';
import { timeAsync } from '@/lib/observability/metrics';
import { cleanupExpiredRateLimits } from '@/lib/security/rate-limit';

export async function runScheduledMaintenance() {
  return timeAsync('server.operation', { operation: 'maintenance.scheduled' }, async () => {
    const [presales, deletionRequests, rateLimits, topbarPrices] = await Promise.all([
      processExpiredPresales(),
      processExpiredCoinDeletionRequests(),
      cleanupExpiredRateLimits(),
      refreshTopbarPrices(),
    ]);
    await syncBannerAdStatuses();

    return {
      presales,
      deletionRequests,
      rateLimits,
      topbarPrices: { updated: topbarPrices.updated },
      banners: { synced: true },
    };
  });
}
