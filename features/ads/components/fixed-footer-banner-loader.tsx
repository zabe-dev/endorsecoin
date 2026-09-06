import { FixedFooterBanner } from '@/features/ads/components/ad-banners';
import { getActiveBannerAds } from '@/features/ads/server/banner-ads';

export async function FixedFooterBannerLoader() {
  const bannerAds = await getActiveBannerAds();
  return <FixedFooterBanner ads={bannerAds.fixed} />;
}
