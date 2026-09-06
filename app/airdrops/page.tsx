import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { AirdropSubmissionPrototype } from './airdrop-submission-prototype';
import { CalendarClock, Gift, Trophy, Users } from 'lucide-react';
import type { Metadata } from 'next';
import '../market.css';
import './airdrops.css';

export const metadata: Metadata = {
  title: 'Crypto Airdrops',
  description:
    'Discover crypto airdrops from approved EndorseCoin projects and preview airdrop submission details.',
  alternates: {
    canonical: '/airdrops',
  },
};

const prototypeAirdrops = [
  {
    name: 'Early Signal Rewards',
    project: 'EndorseCoin',
    rewards: '$2,500 ECN pool',
    winners: '250',
    start: 'Sep 12, 2026 · 12:00 UTC',
    end: 'Sep 19, 2026 · 12:00 UTC',
    status: 'Upcoming',
  },
  {
    name: 'Community Scout Drop',
    project: 'OrbitFi',
    rewards: '10,000 ORB',
    winners: '100',
    start: 'Sep 15, 2026 · 14:00 UTC',
    end: 'Sep 22, 2026 · 14:00 UTC',
    status: 'Draft',
  },
];

export default function AirdropsPage() {
  const today = getDateInputValue(new Date());

  return (
    <main className="market-page airdrops-page">
      <SiteHeader active="airdrops" />
      <section className="container airdrops-shell">
        <div className="airdrops-hero">
          <p className="eyebrow">
            <span>●</span> Airdrop prototype
          </p>
          <div className="airdrops-hero-grid">
            <div>
              <h1>Submit and track community airdrops.</h1>
              <p>
                A lightweight prototype for collecting airdrop campaigns from approved projects
                already listed on EndorseCoin. This is UI-only for now, ready to connect to storage
                once the flow feels right.
              </p>
            </div>
            <div className="airdrops-hero-card">
              <Gift aria-hidden="true" />
              <b>Approved projects only</b>
              <span>Airdrops stay tied to reviewed listings so the page remains clean.</span>
            </div>
          </div>
        </div>

        <div className="airdrops-layout">
          <section className="airdrops-card airdrop-submission-card">
            <div className="airdrop-submission-head">
              <div>
                <p className="eyebrow">
                  <span>●</span> Submissions
                </p>
                <h2>Submit an airdrop</h2>
                <p>Add the reward details for review.</p>
              </div>
              <div className="airdrop-submission-status">
                <b>Prototype</b>
                <span>UI only</span>
              </div>
            </div>

            <AirdropSubmissionPrototype today={today} />
          </section>

          <section className="airdrops-card airdrop-table-card">
            <div className="airdrops-section-head">
              <span className="airdrops-icon">
                <Trophy aria-hidden="true" />
              </span>
              <div>
                <h2>Airdrops table</h2>
                <p>Preview of how approved campaigns could be listed.</p>
              </div>
            </div>

            <div className="airdrops-table-wrap">
              <table className="airdrops-table">
                <thead>
                  <tr>
                    <th>Airdrop</th>
                    <th>Rewards</th>
                    <th>Winners</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {prototypeAirdrops.map((airdrop) => (
                    <tr key={airdrop.name}>
                      <td>
                        <div className="airdrop-name-cell">
                          <span>{airdrop.project.slice(0, 1)}</span>
                          <div>
                            <b>{airdrop.name}</b>
                            <small>{airdrop.project}</small>
                          </div>
                        </div>
                      </td>
                      <td>{airdrop.rewards}</td>
                      <td>
                        <span className="airdrop-winners">
                          <Users aria-hidden="true" />
                          {airdrop.winners}
                        </span>
                      </td>
                      <td>{airdrop.start}</td>
                      <td>{airdrop.end}</td>
                      <td>
                        <span className="airdrop-status">{airdrop.status}</span>
                      </td>
                      <td>
                        <a href="/airdrops" aria-label={`View ${airdrop.name}`}>
                          View
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="airdrops-empty-preview">
              <CalendarClock aria-hidden="true" />
              <span>Empty state preview: no active airdrops match the current filters.</span>
            </div>
          </section>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}

function getDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
