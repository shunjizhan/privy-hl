/**
 * Operator Deny Action
 *
 * Tests policy enforcement by attempting denied operations.
 */

import { HttpTransport, ExchangeClient } from '@nktkas/hyperliquid';

import { createOperatorAccount, type OperatorConfig } from '../account';

const transport = new HttpTransport();

/**
 * Test denied operations (policy enforcement)
 */
export const testDeniedOperations = async (config: OperatorConfig) => {
  console.log('\n[Deny] Testing policy enforcement...');

  const account = createOperatorAccount(config);
  const client = new ExchangeClient({ transport, wallet: account });

  // Test 1: Withdrawal to non-whitelisted address
  console.log('\n  Test: Withdraw to non-whitelisted address');
  console.log('  Expected: DENIED by policy');

  try {
    await client.withdraw3({
      destination: '0x0000000000000000000000000000000000001234',
      amount: '1',
    });
    console.log('  Result: ALLOWED (unexpected!)');
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    console.log(`  Result: DENIED - ${msg}`);
  }

  // Test 2: USD send to another address (internal transfer)
  console.log('\n  Test: USD send to another address');
  console.log('  Expected: DENIED by policy');

  try {
    await client.usdSend({
      destination: '0x0000000000000000000000000000000000005678',
      amount: '1',
    });
    console.log('  Result: ALLOWED (unexpected!)');
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    console.log(`  Result: DENIED - ${msg}`);
  }
};
