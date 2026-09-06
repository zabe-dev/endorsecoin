import type { SubmissionNetwork } from '@/features/submissions/schemas/coin-submission';

export function providerOptions(kind: 'chart' | 'dex', chain: SubmissionNetwork) {
  const commonNone = [{ value: '', label: '' }];
  const chartMap: Record<SubmissionNetwork, Array<{ value: string; label: string }>> = {
    ethereum: [
      ...commonNone,
      { value: 'dexscreener', label: 'DexScreener' },
      { value: 'geckoterminal', label: 'GeckoTerminal' },
      { value: 'dextools', label: 'DEXTools' },
      { value: 'custom', label: 'Custom Link' },
    ],
    bsc: [
      ...commonNone,
      { value: 'dexscreener', label: 'DexScreener' },
      { value: 'geckoterminal', label: 'GeckoTerminal' },
      { value: 'coinbrain', label: 'CoinBrain' },
      { value: 'custom', label: 'Custom Link' },
    ],
    solana: [
      ...commonNone,
      { value: 'dexscreener', label: 'DexScreener' },
      { value: 'custom', label: 'Custom Link' },
    ],
    polygon: [
      ...commonNone,
      { value: 'dexscreener', label: 'DexScreener' },
      { value: 'geckoterminal', label: 'GeckoTerminal' },
      { value: 'dextools', label: 'DEXTools' },
      { value: 'custom', label: 'Custom Link' },
    ],
    avalanche: [...commonNone, { value: 'custom', label: 'Custom Link' }],
    arbitrum: [
      ...commonNone,
      { value: 'dexscreener', label: 'DexScreener' },
      { value: 'geckoterminal', label: 'GeckoTerminal' },
      { value: 'dextools', label: 'DEXTools' },
      { value: 'custom', label: 'Custom Link' },
    ],
    base: [
      ...commonNone,
      { value: 'dexscreener', label: 'DexScreener' },
      { value: 'geckoterminal', label: 'GeckoTerminal' },
      { value: 'dextools', label: 'DEXTools' },
      { value: 'custom', label: 'Custom Link' },
    ],
    optimism: [...commonNone, { value: 'custom', label: 'Custom Link' }],
    dogecoin: [
      ...commonNone,
      { value: 'dexscreener', label: 'DexScreener' },
      { value: 'custom', label: 'Custom Link' },
    ],
    tron: [...commonNone, { value: 'custom', label: 'Custom Link' }],
    fantom: [
      ...commonNone,
      { value: 'dexscreener', label: 'DexScreener' },
      { value: 'geckoterminal', label: 'GeckoTerminal' },
      { value: 'dextools', label: 'DEXTools' },
      { value: 'custom', label: 'Custom Link' },
    ],
    kcc: [
      ...commonNone,
      { value: 'dexscreener', label: 'DexScreener' },
      { value: 'geckoterminal', label: 'GeckoTerminal' },
      { value: 'custom', label: 'Custom Link' },
    ],
    sui: [
      ...commonNone,
      { value: 'dexscreener', label: 'DexScreener' },
      { value: 'geckoterminal', label: 'GeckoTerminal' },
      { value: 'custom', label: 'Custom Link' },
    ],
    hood: [
      ...commonNone,
      { value: 'dexscreener', label: 'DexScreener' },
      { value: 'custom', label: 'Custom Link' },
    ],
    xrpl: [...commonNone, { value: 'custom', label: 'Custom Link' }],
    other: [...commonNone, { value: 'custom', label: 'Custom Link' }],
  };

  const dexMap: Record<SubmissionNetwork, Array<{ value: string; label: string }>> = {
    ethereum: [
      ...commonNone,
      { value: 'uniswap', label: 'Uniswap' },
      { value: 'custom', label: 'Custom Link' },
    ],
    bsc: [
      ...commonNone,
      { value: 'pancakeswap', label: 'PancakeSwap' },
      { value: 'custom', label: 'Custom Link' },
    ],
    solana: [
      ...commonNone,
      { value: 'raydium', label: 'Raydium' },
      { value: 'custom', label: 'Custom Link' },
    ],
    polygon: [
      ...commonNone,
      { value: 'quickswap', label: 'QuickSwap' },
      { value: 'custom', label: 'Custom Link' },
    ],
    avalanche: [...commonNone, { value: 'custom', label: 'Custom Link' }],
    arbitrum: [
      ...commonNone,
      { value: 'uniswap', label: 'Uniswap' },
      { value: 'custom', label: 'Custom Link' },
    ],
    base: [
      ...commonNone,
      { value: 'uniswap', label: 'Uniswap' },
      { value: 'custom', label: 'Custom Link' },
    ],
    optimism: [...commonNone, { value: 'custom', label: 'Custom Link' }],
    dogecoin: [...commonNone, { value: 'custom', label: 'Custom Link' }],
    tron: [...commonNone, { value: 'custom', label: 'Custom Link' }],
    fantom: [...commonNone, { value: 'custom', label: 'Custom Link' }],
    kcc: [
      ...commonNone,
      { value: 'mojitoswap', label: 'MojitoSwap' },
      { value: 'custom', label: 'Custom Link' },
    ],
    sui: [
      ...commonNone,
      { value: 'cetus', label: 'Cetus' },
      { value: 'custom', label: 'Custom Link' },
    ],
    hood: [
      ...commonNone,
      { value: 'uniswap', label: 'Uniswap (Robinhood)' },
      { value: 'custom', label: 'Custom Link' },
    ],
    xrpl: [...commonNone, { value: 'custom', label: 'Custom Link' }],
    other: [...commonNone, { value: 'custom', label: 'Custom Link' }],
  };

  return kind === 'chart' ? chartMap[chain] : dexMap[chain];
}

export function defaultProviderOption(kind: 'chart' | 'dex', chain: SubmissionNetwork) {
  return (
    providerOptions(kind, chain).find((option) => option.value && option.value !== 'custom')
      ?.value || ''
  );
}

export function providerLabel(kind: 'chart' | 'dex', chain: SubmissionNetwork, value: string) {
  if (value === 'custom') return 'Custom Link';
  const options = providerOptions(kind, chain);
  return options.find((item) => item.value === value)?.label || value;
}
