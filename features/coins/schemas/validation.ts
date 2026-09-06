import { NETWORKS } from '../networks';
import { isCoinId, type Coin } from '../types';

export function validateCoin(coin: Coin): string[] {
  const errors: string[] = [];
  if (!isCoinId(coin.id)) errors.push('Coin ID must be a safe integer of 1000 or higher.');
  if (coin.assetType !== 'token') errors.push('Only token coins are supported.');
  if (!NETWORKS[coin.network]?.enabled) errors.push('Coin network is not supported.');
  if (!coin.contractAddress.trim()) errors.push('Token contract address is required.');
  if (!coin.externalId.trim()) errors.push('External market identifier is required.');
  if (coin.promoted.active && coin.promoted.priority < 0) {
    errors.push('Promoted priority cannot be negative.');
  }
  return errors;
}
