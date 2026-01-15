/**
 * Operator Withdraw Action
 *
 * Tests withdrawal to whitelisted address.
 */

import { HttpTransport, ExchangeClient } from '@nktkas/hyperliquid';

import { createOperatorAccount, type OperatorConfig } from '../account';
import { getAccountStatus } from '../../admin/action/status';

const transport = new HttpTransport();

const WHITELISTED_ADDRESS = '0x36CD9238Fd87901661d74c6E7d817DEBbEd034d4';

/**
 * Test withdrawal to whitelisted address
 */
export const testWithdrawal = async (config: OperatorConfig) => {
  console.log('\n[Withdraw] Testing withdrawal to whitelisted address...');

  const status = await getAccountStatus(config.walletAddress);
  const withdrawable = parseFloat(status.withdrawable);

  console.log(`  Withdrawable: $${withdrawable.toFixed(2)}`);
  console.log(`  Destination: ${WHITELISTED_ADDRESS}`);

  if (withdrawable < 1) {
    console.log('\n[Skip] Insufficient balance (need at least $1)');
    return;
  }

  const account = createOperatorAccount(config);
  const client = new ExchangeClient({ transport, wallet: account });

  const result = await client.withdraw3({
    destination: WHITELISTED_ADDRESS,
    amount: '1',
  });

  console.log('\n[OK] Withdrawal initiated!');
  console.log(`  Result: ${JSON.stringify(result, null, 2)}`);
};
