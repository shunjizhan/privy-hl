/**
 * Operator Withdraw Action
 *
 * Tests withdrawal to whitelisted address.
 */

import { HttpTransport, ExchangeClient } from '@nktkas/hyperliquid';

import { createOperatorAccount, type OperatorConfig } from '../account';
import { getAccountStatus } from '../../admin/action/status';
import { WHITELISTED_ADDRESS, validateWhitelistConfig } from '../../core/config';

const transport = new HttpTransport();

/**
 * Test withdrawal to whitelisted address
 */
export const testWithdrawal = async (config: OperatorConfig) => {
  if (!validateWhitelistConfig()) {
    throw new Error('WHITELISTED_ADDRESS env var is required');
  }

  console.log('\n[Withdraw] Testing withdrawal to whitelisted address...');

  const status = await getAccountStatus(config.walletAddress);
  const withdrawable = parseFloat(status.withdrawable);

  console.log(`  Withdrawable: $${withdrawable.toFixed(2)}`);
  console.log(`  Destination: ${WHITELISTED_ADDRESS}`);

  // Hyperliquid withdrawal fee is ~$1, need more than that
  if (withdrawable < 2) {
    console.log('\n[Skip] Insufficient balance (need > $2 to cover fees)');
    return;
  }

  const account = createOperatorAccount(config);
  const client = new ExchangeClient({ transport, wallet: account });

  // Withdraw full amount (use raw value from API)
  const withdrawAmount = status.withdrawable;
  console.log(`  Withdrawing: $${withdrawAmount}`);

  const result = await client.withdraw3({
    destination: WHITELISTED_ADDRESS,
    amount: withdrawAmount,
  });

  console.log('\n[OK] Withdrawal initiated!');
  console.log(`  Result: ${JSON.stringify(result, null, 2)}`);
};
