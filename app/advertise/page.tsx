import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { BoltIcon } from '@/features/coins/components';
import { createPublicPageMetadata } from '@/lib/seo/metadata';
import {
  Activity,
  BarChart3,
  ImageIcon,
  Megaphone,
  MessageCircle,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { Metadata } from 'next';
import '../market.css';
import './advertise.css';
import { SubmitProjectAction } from './submit-project-action';

export const metadata: Metadata = createPublicPageMetadata({
  title: 'Advertisement and Promotions',
  description:
    'Promote your project with EndorseCoin banner ads, promoted placements, and boosts. Compare prices, ad sizes, and available locations.',
  path: '/advertise',
});

const promotedRates = [
  { duration: '1–2 days', discount: 'No discount', price: '$30/day' },
  { duration: '3–6 days', discount: '20% off', price: '$24/day' },
  { duration: '7–13 days', discount: '30% off', price: '$21/day' },
  { duration: '14+ days', discount: '40% off', price: '$18/day' },
];

const boostRates = [
  { package: '10×', price: '$19', multiplier: '×2', duration: '24 hours', extra: '—' },
  { package: '30×', price: '$49', multiplier: '×2', duration: '3 days', extra: '—' },
  { package: '50×', price: '$79', multiplier: '×3', duration: '24 hours', extra: '—' },
  { package: '100×', price: '$149', multiplier: '×3', duration: '3 days', extra: '—' },
  {
    package: '500×',
    price: '$499',
    multiplier: '×5',
    duration: '7 days',
    extra: '+ Golden ticker',
  },
];

const bannerPlacements = [
  {
    placement: 'Basic banner',
    size: 'Desktop: 652×90px - 728×120px',
    price: '$25/day',
    mobile: 'Mobile: 320×90px - 620×120px',
    note: 'Located at the top of homepage and airdrops pages, plus below the homepage community leaderboard. Rotates through active ads.',
  },
  {
    placement: 'Premium banner',
    size: 'Desktop: 1320×90px - 1400×120px',
    price: '$50/day',
    mobile: 'Mobile: 320×90px - 620×120px',
    note: 'Located between promoted coins and the homepage leaderboard, under coin page headers, in dashboard/watchlist, and between airdrops and promoted coins. Exclusive ad space, does not rotate.',
  },
  {
    placement: 'Fixed footer banner',
    size: 'Desktop: 1920×90px - 2560×120px',
    price: '$100/day',
    mobile: 'Mobile: 320×90px - 620×120px',
    note: 'Located at the bottom of page displayed across all site pages. Exclusive ad space, does not rotate.',
  },
];

const approvalSteps = [
  'Choose your project and campaign type.',
  'Message @EndorseCoinSupport on Telegram.',
  'Send your preferred dates and creative.',
  'We manually review the request.',
  'Confirm the payment/order details.',
  'Approved campaigns go live on schedule.',
];

export default function AdvertisePage() {
  return (
    <main className="market-page">
      <SiteHeader active="none" />
      <section className="container advertise-shell">
        <div className="advertise-hero">
          <p className="eyebrow">
            <span>●</span> Advertise on EndorseCoin
          </p>
          <h1>Reach early project investors.</h1>
          <p>
            Put your project in front of users scanning for new launches, presales, and coins
            gaining community attention. Choose banner placements, promoted coin visibility, or
            boosts depending on how much reach you want.
          </p>
          <div className="advertise-actions">
            <a className="advertise-primary" href="https://t.me/EndorseCoinCom">
              <MessageCircle aria-hidden="true" />
              Contact @EndorseCoinCom
            </a>
            <SubmitProjectAction />
          </div>
        </div>

        <section className="advertise-card advertise-banner-card">
          <div className="advertise-section-head">
            <span className="advertise-card-icon">
              <ImageIcon aria-hidden="true" />
            </span>
            <div>
              <h2>Banner ad placements</h2>
            </div>
          </div>
          <p className="advertise-banner-intro">
            Banner ads are now available as managed placements. Send us your creative, target URL,
            preferred start date, and campaign length. We&apos;ll review everything before it goes
            live.
          </p>
          <div className="advertise-banner-grid">
            {bannerPlacements.map((banner) => (
              <div key={banner.placement}>
                <b>{banner.placement}</b>
                <strong>{banner.price}</strong>
                <span className="advertise-banner-sizes">
                  <span>{banner.size}</span>
                  <span>{banner.mobile}</span>
                </span>
                <small>{banner.note}</small>
              </div>
            ))}
            <div className="advertise-custom-request-card">
              <b>Custom request</b>
              <strong>TBD</strong>
              <span className="advertise-banner-sizes">
                <span>Custom campaign idea.</span>
                <span>Reviewed manually before pricing.</span>
              </span>
              <small>
                Have something outside the standard packages? Send the idea and we&apos;ll price it
                based on placement, duration, and availability.
              </small>
            </div>
          </div>
          <p className="advertise-note">
            *Banner ads follow the same multi-day discount model as promoted coins. Approved active
            placements are non-refundable.
          </p>
        </section>

        <div className="advertise-grid">
          <section className="advertise-card">
            <span className="advertise-card-icon">
              <Megaphone aria-hidden="true" />
            </span>
            <h2>Promoted coins</h2>
            <p>
              Promoted coin placement gives approved projects premium table visibility for the dates
              purchased. This is advertising inventory, not a safety endorsement.
            </p>
            <div className="advertise-table">
              {promotedRates.map((rate) => (
                <div key={rate.duration}>
                  <span>{rate.duration}</span>
                  <b>{rate.discount}</b>
                  <strong>{rate.price}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="advertise-card">
            <span className="advertise-card-icon">
              <BoltIcon />
            </span>
            <h2>Boost packages</h2>
            <p>
              Boosts multiply a project’s displayed/ranking vote value for the purchased active
              period. Raw votes are never changed, and only one boost can be active per project.
            </p>
            <div className="advertise-boosts">
              {boostRates.map((rate) => (
                <div key={rate.package}>
                  <b>{rate.package}</b>
                  <span>{rate.price}</span>
                  <small>
                    {rate.multiplier} · {rate.duration}
                  </small>
                  {rate.extra !== '—' && <em>{rate.extra}</em>}
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="advertise-policy">
          <div className="advertise-policy-golden">
            <div className="golden-ticker-icon">
              <BoltIcon aria-hidden="true" />
            </div>
            <div className="golden-ticker-header">
              <h2>Golden ticker</h2>
              <span className="boost-badge boost-500">
                <BoltIcon aria-hidden="true" />
                500×
              </span>
            </div>
            <p>
              Give your project a premium golden ticker, a glowing orange/gold name treatment paired
              with a standout badge that makes your coin impossible to miss while the boost is
              active.
            </p>
          </div>
          <div>
            <span className="advertise-card-icon">
              <BarChart3 aria-hidden="true" />
            </span>
            <h2>Managed banner setup</h2>
            <p>
              Banner ads are reviewed before they run. We check the creative, destination link,
              timing, and placement fit so the site stays clean for users and useful for
              advertisers.
            </p>
          </div>
          <div>
            <span className="advertise-card-icon">
              <ShieldCheck aria-hidden="true" />
            </span>
            <h2>Eligibility rules</h2>
            <p>
              The project must already be submitted/listed on EndorseCoin, must not be suspended,
              rejected, fraud-flagged, hidden, or under review, and must pass final manual approval.
            </p>
          </div>
        </section>
        <section className="advertise-card advertise-wide">
          <div className="advertise-wide-copy">
            <span className="advertise-card-icon analytics">
              <Activity aria-hidden="true" />
            </span>
            <div>
              <h2>Hands-on campaign setup.</h2>
              <p>
                Tell us what you want to promote, where you want it shown, and when you want the
                campaign to run. We&apos;ll confirm availability, review the creative, and set it up
                from the admin side.
              </p>
              <p>
                Same-day starts are not guaranteed. Paid visibility is advertising inventory, not a
                project endorsement, ranking promise, or performance guarantee.
              </p>
            </div>
          </div>
          <ol className="approval-list" type="1">
            {approvalSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <section className="advertise-final-cta">
          <Sparkles aria-hidden="true" />
          <div>
            <h2>Ready to increase your project’s reach?</h2>
            <p>Message us to start your project campaign.</p>
          </div>
          <div className="advertise-actions advertise-final-actions">
            <a className="advertise-primary" href="https://t.me/EndorseCoinSupport">
              <MessageCircle aria-hidden="true" />
              Contact us
            </a>
            <SubmitProjectAction />
          </div>
        </section>
      </section>

      <SiteFooter />
    </main>
  );
}
