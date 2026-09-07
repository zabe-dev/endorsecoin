export const bannerImageAssetOrigin = 'https://assets.endorsecoin.com';
export const bannerImageAssetHostname = 'assets.endorsecoin.com';

export function isAllowedBannerImageUrl(value: string | null | undefined) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname.toLowerCase() === bannerImageAssetHostname &&
      !url.port &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function assertAllowedBannerImageUrl(value: string, key = 'Banner image URL') {
  if (!isAllowedBannerImageUrl(value)) {
    throw new Error(`${key} must use ${bannerImageAssetOrigin}.`);
  }
}
