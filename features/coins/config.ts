import { getNetworkConfig } from './networks';
import type { ChartConfig, DexConfig, NetworkId } from './types';

export function createChartConfig({
  externalId,
  network,
  poolAddress,
}: {
  externalId?: string;
  network: NetworkId;
  poolAddress?: string;
}): ChartConfig {
  if (poolAddress) return { source: 'dex', network, poolAddress };
  if (externalId) return { source: 'market', externalId };
  return { source: 'unavailable' };
}

export function createDexConfig({
  network,
  contractAddress,
  pairAddress,
}: {
  network: NetworkId;
  contractAddress: string;
  pairAddress?: string;
}): DexConfig {
  const config = getNetworkConfig(network);
  if (!config.dexScreenerSlug || !contractAddress) return { available: false };

  return {
    available: true,
    provider: 'dexscreener',
    url: `https://dexscreener.com/${config.dexScreenerSlug}/${pairAddress || contractAddress}`,
    ...(pairAddress ? { pairAddress } : {}),
  };
}
