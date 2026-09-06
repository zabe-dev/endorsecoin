import type { CoinDetailView } from '../types';
import { Heading, Stat } from './detail-card';

export function CoinInfoSections({ coin }: { coin: CoinDetailView }) {
  return (
    <>
      <section className="detail-card">
        <Heading kicker="MARKET DATA" title="Token statistics" action="Updated moments ago" />
        <div className="stat-grid">
          <Stat label="Market cap" value={coin.cap} />
          <Stat label="FDV" value={coin.fdv} />
          <Stat label="24h volume" value={coin.volume24h} />
          <Stat label="Liquidity" value={coin.liquidity} />
          <Stat label="Holders" value={coin.holders} />
          <Stat label="Total supply" value={coin.totalSupply} />
        </div>
      </section>

      <section className="detail-card about-card">
        <Heading kicker="COIN" title={`About ${coin.name}`} />
        <p>{coin.description || 'A coin description has not been provided yet.'}</p>
        <div className="tag-row">
          <span>{coin.category}</span>
          <span>{coin.chain} ecosystem</span>
        </div>
      </section>
    </>
  );
}
