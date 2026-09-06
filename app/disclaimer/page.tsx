import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { createPublicPageMetadata } from '@/lib/seo/metadata';
import type { Metadata } from 'next';
import '../market.css';

export const metadata: Metadata = createPublicPageMetadata({
  title: 'Disclaimer',
  description:
    'Understand the limits of EndorseCoin listings, community rankings, market data, and sponsored placements before using project information.',
  path: '/disclaimer',
});

const lastUpdated = 'September 6, 2026';

export default function DisclaimerPage() {
  return (
    <main className="market-page">
      <SiteHeader active="none" />
      <section className="container legal-shell">
        <header className="legal-hero">
          <small>LEGAL</small>
          <h1>Disclaimer</h1>
          <p>
            EndorseCoin helps users discover crypto projects, but every decision to research, buy,
            trade, promote, or interact with a project is your own responsibility.
          </p>
          <span>Last updated: {lastUpdated}</span>
        </header>

        <div className="legal-card">
          <LegalSection title="Not financial advice">
            <p>
              Nothing on EndorseCoin is financial, investment, legal, tax, or trading advice. Coin
              pages, rankings, votes, charts, market data, ads, and promotions are provided for
              discovery and information only.
            </p>
          </LegalSection>

          <LegalSection title="No endorsement of listed projects">
            <p>
              A project appearing on EndorseCoin does not mean we endorse, verify, recommend, or
              guarantee it. Our name reflects community-driven visibility: projects can gain
              attention through votes from users, but votes, watchlists, boosts, promoted
              placements, and banner ads do not confirm that a project is safe or suitable for you.
            </p>
          </LegalSection>

          <LegalSection title="Crypto risk and possible loss">
            <p>
              Crypto assets can be highly volatile, illiquid, experimental, or unsafe. You may lose
              some or all of the money you choose to spend, trade, stake, bridge, or invest. Always
              do your own research before connecting a wallet or interacting with any contract.
            </p>
          </LegalSection>

          <LegalSection title="Accuracy of information">
            <p>
              Project details may come from project owners, public sources, users, third-party data
              providers, or automated tools. Information can be delayed, incomplete, outdated,
              inaccurate, or changed without notice.
            </p>
          </LegalSection>

          <LegalSection title="Advertising, promotions, and sponsored content">
            <p>
              Sponsored placements are paid visibility. They do not guarantee ranking, performance,
              safety, trustworthiness, liquidity, buyers, investors, or results. Sponsored content
              should be reviewed with the same caution as any other project listing.
            </p>
          </LegalSection>

          <LegalSection title="Third-party links">
            <p>
              EndorseCoin may link to external websites, wallets, charts, exchanges, social pages,
              communities, and project resources. We do not control third-party sites and are not
              responsible for their content, availability, security, or actions.
            </p>
          </LegalSection>

          <LegalSection title="Regulatory and jurisdictional notice">
            <p>
              Crypto rules vary by country and may change over time. You are responsible for
              understanding whether your use of any project, token, service, or promotion is allowed
              where you live or operate.
            </p>
          </LegalSection>

          <LegalSection title="No warranty">
            <p>
              EndorseCoin is provided as available. We do not promise uninterrupted access, error
              free data, complete listings, successful promotions, or that every unsafe project will
              be detected before users see it.
            </p>
          </LegalSection>

          <LegalSection title="Limitation of liability">
            <p>
              To the fullest extent allowed by law, EndorseCoin is not responsible for losses,
              damages, claims, missed opportunities, token losses, wallet issues, third-party
              actions, or decisions made based on information shown on the site.
            </p>
          </LegalSection>

          <LegalSection title="Reporting scams or unsafe projects">
            <p>
              If you believe a listed project is a scam, impersonation, malware risk, or otherwise
              harmful, please use the report option on the coin page or contact us through our
              official support channels so the listing can be reviewed.
            </p>
          </LegalSection>

          <LegalSection title="Changes to this disclaimer">
            <p>
              We may update this disclaimer as EndorseCoin grows, features change, or new risks need
              to be explained. The latest version posted on this page applies when you use the site.
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
