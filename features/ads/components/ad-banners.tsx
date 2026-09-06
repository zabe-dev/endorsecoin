'use client';

/* eslint-disable @next/next/no-img-element -- Ad creatives need plain desktop/mobile images that scale by container width without Next image sizing constraints. */
import type { PublicBannerAd } from '@/features/ads/types';
import Link from 'next/link';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

type BannerProps = {
  ads?: PublicBannerAd[];
  offset?: number;
};

const BASIC_AD_ROTATION_MS = 60_000;

function useSelectedAd(ads: PublicBannerAd[] = [], offset = 0, rotating = false) {
  const activeAds = useMemo(() => ads.filter((ad) => ad.desktopImageUrl), [ads]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!rotating || activeAds.length < 2) return;
    const timer = window.setInterval(() => setIndex((current) => current + 1), 7000);
    return () => window.clearInterval(timer);
  }, [activeAds.length, rotating]);

  if (activeAds.length === 0) return null;
  return activeAds[(index + offset) % activeAds.length] ?? activeAds[0];
}

function useSelectedBasicAdPair(ads: PublicBannerAd[] = [], offset = 0) {
  const activeAds = useMemo(() => ads.filter((ad) => ad.desktopImageUrl), [ads]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (activeAds.length < 2) return;
    const timer = window.setInterval(
      () => setIndex((current) => current + 1),
      BASIC_AD_ROTATION_MS,
    );
    return () => window.clearInterval(timer);
  }, [activeAds.length]);

  if (activeAds.length === 0) {
    return { firstAd: null, secondAd: null };
  }

  const firstIndex = (index + offset) % activeAds.length;
  const secondIndex = activeAds.length > 1 ? (firstIndex + 1) % activeAds.length : -1;

  return {
    firstAd: activeAds[firstIndex] ?? activeAds[0],
    secondAd: secondIndex >= 0 ? activeAds[secondIndex] : null,
  };
}

function AdBadge() {
  return <span className="ad-creative-badge">Ad</span>;
}

function AdPicture({ ad }: { ad: PublicBannerAd }) {
  return (
    <span className="ad-banner-media" aria-label={ad.title || 'Advertisement'}>
      <AdImageContent
        key={`desktop-${ad.id}-${ad.desktopImageUrl}`}
        frameClassName="ad-banner-img-frame--desktop"
        ad={ad}
        initialSrc={ad.desktopImageUrl}
        fallbackSrc={ad.desktopImageUrl}
      />
      <AdImageContent
        key={`mobile-${ad.id}-${ad.mobileImageUrl || ad.desktopImageUrl}`}
        frameClassName="ad-banner-img-frame--mobile"
        ad={ad}
        initialSrc={ad.mobileImageUrl || ad.desktopImageUrl}
        fallbackSrc={ad.desktopImageUrl}
        decorative
      />
    </span>
  );
}

function BasicAdPicture({ ad, mode }: { ad: PublicBannerAd; mode: 'desktop' | 'mobile' }) {
  const initialSrc =
    mode === 'mobile' ? ad.mobileImageUrl || ad.desktopImageUrl : ad.desktopImageUrl;

  return (
    <span className="ad-banner-media" aria-label={ad.title || 'Advertisement'}>
      <AdImageContent
        key={`basic-${mode}-${ad.id}-${initialSrc}`}
        ad={ad}
        initialSrc={initialSrc}
        fallbackSrc={ad.desktopImageUrl}
      />
    </span>
  );
}

function AdImageContent({
  ad,
  frameClassName,
  initialSrc,
  fallbackSrc,
  decorative = false,
}: {
  ad: PublicBannerAd;
  frameClassName?: string;
  initialSrc: string;
  fallbackSrc: string;
  decorative?: boolean;
}) {
  const [src, setSrc] = useState(initialSrc);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className={`ad-banner-img-frame ${frameClassName || ''} ad-banner-img-frame--pending`}>
        <span className="ad-banner-loading-copy">Advertisement</span>
      </span>
    );
  }

  return (
    <span className={`ad-banner-img-frame ${frameClassName || ''}`}>
      <img
        className="ad-banner-img"
        src={src}
        alt={decorative ? '' : ad.title || 'Advertisement'}
        aria-hidden={decorative ? true : undefined}
        onError={() => {
          if (src !== fallbackSrc) {
            setSrc(fallbackSrc);
            return;
          }
          setFailed(true);
        }}
      />
    </span>
  );
}

function BasicBannerSlot({
  ad,
  imageMode,
  slot = 'primary',
}: {
  ad: PublicBannerAd | null;
  imageMode: 'desktop' | 'mobile';
  slot?: string;
}) {
  if (ad) {
    return (
      <Link
        className={`basic-ad-banner basic-ad-banner--${slot} ad-banner-image`}
        href={ad.targetUrl}
        target="_blank"
      >
        <AdBadge />
        <BasicAdPicture ad={ad} mode={imageMode} />
      </Link>
    );
  }

  return (
    <div className={`basic-ad-banner basic-ad-banner--${slot}`}>
      <small>AD SPACE</small>
      <div className="ad-placeholder-copy">
        <b>Reach crypto&apos;s earliest investors.</b>
        <span>Premium inventory · Measured impressions and clicks</span>
      </div>
      <Link href="/advertise">View ad packages ↗</Link>
    </div>
  );
}

export function BasicAdBannerPair({ ads = [], offset = 0 }: BannerProps) {
  const { firstAd, secondAd } = useSelectedBasicAdPair(ads, offset);

  return (
    <div className="container basic-ad-grid">
      <div className="basic-ad-row basic-ad-row--desktop">
        <BasicBannerSlot ad={firstAd} imageMode="desktop" slot="primary" />
        <BasicBannerSlot ad={secondAd} imageMode="desktop" slot="secondary" />
      </div>
      <div className="basic-ad-row basic-ad-row--mobile">
        <BasicBannerSlot ad={firstAd} imageMode="mobile" slot="primary" />
      </div>
    </div>
  );
}

export function PremiumAdBanner({ ads = [], offset = 0 }: BannerProps) {
  const ad = useSelectedAd(ads, offset, false);

  if (ad) {
    return (
      <Link
        className="container premium-ad-banner ad-banner-image"
        href={ad.targetUrl}
        target="_blank"
      >
        <AdBadge />
        <AdPicture ad={ad} />
      </Link>
    );
  }

  return (
    <div className="container premium-ad-banner">
      <small>PREMIUM ADVERTISEMENT</small>
      <div>
        <b>Reach crypto&apos;s earliest investors.</b>
        <span>Premium inventory · Measured impressions and clicks</span>
      </div>
      <Link href="/advertise">View ad packages ↗</Link>
    </div>
  );
}

export function FixedFooterBanner({ ads = [], offset = 0 }: BannerProps) {
  const ad = useSelectedAd(ads, offset, false);
  const visibleFromStorage = useSyncExternalStore(
    subscribeFixedAdStorage,
    getFixedAdSnapshot,
    () => false,
  );
  const [dismissed, setDismissed] = useState(false);
  const visible = visibleFromStorage && !dismissed;

  if (!visible) return null;

  return (
    <aside className="fixed-footer-ad-banner">
      <div className="fixed-footer-ad-banner-inner">
        {ad ? (
          <Link className="fixed-footer-ad-banner-creative" href={ad.targetUrl} target="_blank">
            <AdBadge />
            <AdPicture ad={ad} />
          </Link>
        ) : (
          <div className="fixed-footer-ad-banner-placeholder">
            <div className="fixed-footer-ad-banner-placeholder-inner">
              <small>AD SPACE</small>
              <b>SPOOKY</b>
              <span>Reach crypto&apos;s earliest investors.</span>
              <Link href="/advertise">View ad packages ↗</Link>
            </div>
          </div>
        )}
        <button
          className="fixed-footer-ad-banner-close"
          type="button"
          onClick={() => {
            window.localStorage.setItem('spooky-fixed-footer-ad-closed', '1');
            setDismissed(true);
          }}
          aria-label="Close ad"
        >
          ×
        </button>
      </div>
    </aside>
  );
}

function subscribeFixedAdStorage(callback: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

function getFixedAdSnapshot() {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem('spooky-fixed-footer-ad-closed') !== '1';
}
