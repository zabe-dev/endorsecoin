'use client';

import type { CanonicalCoin, CoinDetailView } from '../types';

export function CoinChartCard({
  coin,
  canonicalCoin,
}: {
  coin: CoinDetailView;
  canonicalCoin: CanonicalCoin;
}) {
  const chartLabel = getChartLabel(canonicalCoin.chart);

  return (
    <section className="detail-card chart-card">
      <div className="chart-head">
        <div>
          <strong>
            {coin.symbol} / {coin.chain} / {coin.category.toUpperCase()}
          </strong>
        </div>
        {canonicalCoin.dex.available ? (
          <a href={canonicalCoin.dex.url} target="_blank" rel="noreferrer">
            Buy on {dexProviderName(canonicalCoin.dex.provider, canonicalCoin.network)} ↗
          </a>
        ) : (
          <span>DEX unavailable</span>
        )}
      </div>
      {canonicalCoin.chart.source === 'embed' ? (
        <div className="price-chart chart-embed-wrap">
          <iframe
            src={canonicalCoin.chart.url}
            title={`${coin.name} chart`}
            loading="lazy"
            allowFullScreen
          />
        </div>
      ) : (
        <div className="price-chart chart-unavailable-wrap">
          <span className="chart-unavailable">
            {canonicalCoin.chart.source === 'external'
              ? 'Chart preview unavailable'
              : 'No chart available'}
          </span>
        </div>
      )}
      <div className="chart-foot">
        <span>{chartLabel}</span>
        {canonicalCoin.chart.source === 'external' && (
          <a href={canonicalCoin.chart.url} target="_blank" rel="noreferrer">
            Open Chart ↗
          </a>
        )}
        {canonicalCoin.dex.available && (
          <a href={canonicalCoin.dex.url} target="_blank" rel="noreferrer">
            Open DEX ↗
          </a>
        )}
      </div>
    </section>
  );
}

function getChartLabel(chart: CanonicalCoin['chart']) {
  if (chart.source === 'embed') return `${providerName(chart.provider)} chart`;
  if (chart.source === 'external') return 'Custom chart link';
  return 'No chart available';
}

function providerName(provider: string) {
  if (provider === 'dexscreener') return 'DexScreener';
  if (provider === 'geckoterminal') return 'GeckoTerminal';
  if (provider === 'dextools') return 'DEXTools';
  if (provider === 'coinbrain') return 'CoinBrain';
  return 'Live';
}

function dexProviderName(provider: string, network: CanonicalCoin['network']) {
  if (provider === 'uniswap') return 'Uniswap';
  if (provider === 'pancakeswap') return 'PancakeSwap';
  if (provider === 'raydium') return 'Raydium';
  if (provider === 'quickswap') return 'QuickSwap';
  if (provider === 'mojitoswap') return 'MojitoSwap';
  if (provider === 'cetus') return 'Cetus';
  if (network === 'ethereum' || network === 'arbitrum' || network === 'base' || network === 'hood')
    return 'Uniswap';
  if (network === 'bsc') return 'PancakeSwap';
  if (network === 'solana') return 'Raydium';
  if (network === 'polygon') return 'QuickSwap';
  if (network === 'kcc') return 'MojitoSwap';
  if (network === 'sui') return 'Cetus';
  return 'DEX';
}
