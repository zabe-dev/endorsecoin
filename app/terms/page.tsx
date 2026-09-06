import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import type { Metadata } from 'next';
import '../market.css';

export const metadata: Metadata = {
  title: 'Terms and Conditions',
  description: 'Terms and Conditions for EndorseCoin.',
  alternates: {
    canonical: '/terms',
  },
};

const lastUpdated = 'September 4, 2026';

export default function TermsPage() {
  return (
    <main className="market-page">
      <SiteHeader active="none" />
      <section className="container legal-shell">
        <header className="legal-hero">
          <small>LEGAL</small>
          <h1>Terms and Conditions</h1>
          <p>
            These terms explain the rules for using EndorseCoin, submitting projects, voting,
            watching coins, and purchasing paid visibility.
          </p>
          <span>Last updated: {lastUpdated}</span>
        </header>

        <div className="legal-card">
          <LegalSection title="Who these terms apply to">
            <p>
              These Terms and Conditions apply to anyone who visits, uses, submits to, advertises
              on, or creates an account with EndorseCoin. By using the site, you agree to follow
              these rules and use the platform responsibly.
            </p>
          </LegalSection>

          <LegalSection title="Age requirement">
            <p>
              You must be at least 18 years old to use EndorseCoin. By using the site, you confirm
              that you meet this requirement.
            </p>
          </LegalSection>

          <LegalSection title="No financial advice">
            <p>
              EndorseCoin is a discovery and information platform. We do not provide financial,
              investment, legal, tax, or trading advice. Listings, votes, charts, market data,
              boosts, ads, and promoted placements are not endorsements. Always do your own research
              before interacting with any project.
            </p>
          </LegalSection>

          <LegalSection title="Accounts and fair use">
            <p>
              You are responsible for your account activity. Do not create fake accounts, manipulate
              votes, abuse watchlists, scrape aggressively, attack the site, submit malicious
              content, or try to bypass review, security, rate limits, or payment checks.
            </p>
          </LegalSection>

          <LegalSection title="Project submissions">
            <p>
              When you submit a project, you confirm that the information is accurate, that you have
              the right to submit the logo and content, and that the project does not impersonate
              another brand or violate laws or rights.
            </p>
            <p>
              We may approve, reject, edit, hide, suspend, or remove submissions if information
              appears false, unsafe, misleading, broken, illegal, spammy, or harmful to users.
            </p>
          </LegalSection>

          <LegalSection title="User-submitted content">
            <p>
              By submitting project information, logos, links, descriptions, or other content, you
              give EndorseCoin permission to display, store, resize, crop, format, and use that
              content for the platform, review process, promotion, and listing pages.
            </p>
          </LegalSection>

          <LegalSection title="Ads, boosts, and promoted placements">
            <p>
              Paid visibility can help projects reach more users, but it does not guarantee votes,
              rank, clicks, investors, buyers, token performance, or any business result. Boosted
              and promoted projects may still move up or down depending on site activity and the
              rules of each placement.
            </p>
            <p>
              We may reject, pause, remove, or refuse ads and promotions for safety, compliance,
              quality, availability, broken links, misleading claims, impersonation, or abuse.
            </p>
          </LegalSection>

          <LegalSection title="Payments and refunds">
            <p>
              Boosts, promoted coins, banner placements, and other paid visibility products are
              non-refundable once purchased or activated, unless we choose otherwise in writing or
              applicable law requires it.
            </p>
            <p>
              If a placement is rejected before activation, we may offer a replacement, credit, or
              refund depending on the situation and payment provider rules.
            </p>
          </LegalSection>

          <LegalSection title="Market data and third-party links">
            <p>
              Market prices, charts, liquidity, supply, holders, DEX links, and other external data
              may be delayed, incomplete, unavailable, or incorrect. Third-party websites are not
              controlled by EndorseCoin, and users visit them at their own risk.
            </p>
          </LegalSection>

          <LegalSection title="Changes to these terms">
            <p>
              We may update these terms as EndorseCoin grows. If changes are material, we will make
              reasonable efforts to make the update visible on the site.
            </p>
          </LegalSection>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}

function LegalSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
