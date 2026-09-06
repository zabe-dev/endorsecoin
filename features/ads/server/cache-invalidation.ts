import 'server-only';

import { bumpCacheVersion } from '@/lib/cache/cache-version';

export async function invalidateBannerAdCache() {
  await bumpCacheVersion('banner-ads');
}
