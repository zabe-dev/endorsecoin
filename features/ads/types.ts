export type BannerPlacement = 'basic' | 'premium' | 'fixed';

export type PublicBannerAd = {
  id: string;
  placement: BannerPlacement;
  title: string;
  subtitle: string | null;
  desktopImageUrl: string;
  mobileImageUrl: string;
  targetUrl: string;
};

export type BannerAdMap = Record<BannerPlacement, PublicBannerAd[]>;

export const bannerPlacements = [
  'basic',
  'premium',
  'fixed',
] as const satisfies readonly BannerPlacement[];

export const bannerPlacementLabels: Record<BannerPlacement, string> = {
  basic: 'Basic banner',
  premium: 'Premium banner',
  fixed: 'Fixed footer banner',
};

export const legacyBannerPlacementMap: Record<string, BannerPlacement> = {
  premium: 'basic',
  wide: 'premium',
  'homepage-top': 'basic',
  'homepage-wide': 'premium',
  'homepage-guide-wide': 'basic',
  'site-bottom': 'fixed',
};

export function normalizeBannerPlacement(value: string): BannerPlacement | null {
  if (bannerPlacements.includes(value as BannerPlacement)) return value as BannerPlacement;
  return legacyBannerPlacementMap[value] || null;
}
