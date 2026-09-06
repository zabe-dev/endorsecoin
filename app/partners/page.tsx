import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import {
  ArrowRight,
  ChartLine,
  MessageCircle,
  Rocket,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import { createPublicPageMetadata } from '@/lib/seo/metadata';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../market.css';
import './partners.css';

export const metadata: Metadata = createPublicPageMetadata({
  title: 'Ecosystem Partners',
  description:
    'Partner with EndorseCoin as a launchpad, community, tool, or service provider. Explore partnership opportunities and contact our team.',
  path: '/partners',
});

export default function PartnersPage() {
  return (
    <main className="market-page">
      <SiteHeader active="none" />
      <section className="container partners-shell">
        <div className="partners-hero">
          <div className="partners-copy">
            <span className="partners-kicker">Partners</span>
            <h1>
              Better signals
              <span>for better coin discovery.</span>
            </h1>
            <p>
              EndorseCoin partners with teams that help projects launch, prove trust, and reach
              investors looking for an edge in early discovery.
            </p>
            <div className="partners-actions">
              <a className="partners-primary" href="https://t.me/EndorseCoinSupport">
                <MessageCircle aria-hidden="true" />
                Contact support
              </a>
              <a className="partners-secondary" href="/advertise">
                Advertise instead
                <ArrowRight aria-hidden="true" />
              </a>
            </div>
          </div>

          <div className="partners-signal" aria-label="Partner focus areas">
            <div className="partners-signal-top">
              <span>PARTNER FIT</span>
              <b>OPEN</b>
            </div>
            <ul>
              <li>
                <span>01</span>
                <b>Launch support</b>
              </li>
              <li>
                <span>02</span>
                <b>Trust verification</b>
              </li>
              <li>
                <span>03</span>
                <b>Audience growth</b>
              </li>
              <li>
                <span>04</span>
                <b>Market data</b>
              </li>
            </ul>
          </div>
        </div>

        <div className="partners-section-head">
          <div>
            <small>PARTNER LANES</small>
            <h2>Where we can work together</h2>
          </div>
          <p>No fluff partnership page. If it helps projects or investors, it belongs here.</p>
        </div>

        <div className="partners-lanes">
          <PartnerType
            label="Launch partners"
            text="Launchpads, presale platforms, and listing teams that help new coins reach early investors."
          >
            <Rocket aria-hidden="true" />
          </PartnerType>
          <PartnerType
            label="Trust partners"
            text="KYC, audit, and safety teams that make stronger project signals easier to verify."
          >
            <ShieldCheck aria-hidden="true" />
          </PartnerType>
          <PartnerType
            label="Audience partners"
            text="Communities, media pages, and creator networks with real attention from early investors."
          >
            <UsersRound aria-hidden="true" />
          </PartnerType>
          <PartnerType
            label="Data partners"
            text="Chart, DEX, analytics, and market data teams that help investors move with confidence."
          >
            <ChartLine aria-hidden="true" />
          </PartnerType>
        </div>

        <div className="partners-contact">
          <div>
            <small>READY TO TALK?</small>
            <h2>Send the useful version.</h2>
            <p>What you do, who you help, and what a clean partnership should look like.</p>
          </div>
          <a className="partners-secondary" href="https://t.me/EndorseCoinSupport">
            Start a conversation
            <ArrowRight aria-hidden="true" />
          </a>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}

function PartnerType({
  children,
  label,
  text,
}: {
  children: ReactNode;
  label: string;
  text: string;
}) {
  return (
    <article>
      <span className="partners-lane-icon">{children}</span>
      <div className="partners-lane-copy">
        <strong>{label}</strong>
        <p>{text}</p>
      </div>
    </article>
  );
}
