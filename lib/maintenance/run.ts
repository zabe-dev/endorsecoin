import 'server-only';

import { syncBannerAdStatuses } from '@/features/ads/server/banner-ads';
import { processExpiredCoinDeletionRequests } from '@/features/coins/server/delete-requests';
import { processExpiredPresales } from '@/features/coins/server/presale-expiry';
import { timeAsync } from '@/lib/observability/metrics';
import { cleanupExpiredRateLimits } from '@/lib/security/rate-limit';

export async function runScheduledMaintenance() {
  return timeAsync('server.operation', { operation: 'maintenance.scheduled' }, async () => {
    const [presales, deletionRequests, rateLimits] = await Promise.all([
      processExpiredPresales(),
      processExpiredCoinDeletionRequests(),
      cleanupExpiredRateLimits(),
    ]);
    await syncBannerAdStatuses();

    return {
      presales,
      deletionRequests,
      rateLimits,
      banners: { synced: true },
    };
  });
}
