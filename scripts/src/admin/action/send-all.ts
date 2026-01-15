/**
 * Admin Send All Action
 *
 * Sends all USDC to whitelisted address (internal Hyperliquid transfer).
 */

import { HttpTransport, ExchangeClient } from '@nktkas/hyperliquid';

import { createAdminAccount, type AdminConfig } from '../account';
import { getAccountStatus } from './status';

const transport = new HttpTransport();

const WHITELISTED_ADDRESS = '0x36CD9238Fd87901661d74c6E7d817DEBbEd034d4';

/**
 * Send all USDC to whitelisted address (internal Hyperliquid transfer)
 */
export const adminSendAllUsdc = async (config: AdminConfig) => {
  console.log('\n[Admin Send All] Sending all USDC to whitelisted address...');
  console.log(`  Destination: ${WHITELISTED_ADDRESS}`);

  const status = await getAccountStatus(config.walletAddress);
  const withdrawable = parseFloat(status.withdrawable);

  console.log(`  Withdrawable: $${withdrawable.toFixed(2)}`);

  if (withdrawable < 0.01) {
    console.log('  No USDC to send.');
    return;
  }

  // Floor to 2 decimal places for USDC
  const amountToSend = Math.floor(withdrawable * 100) / 100;
  console.log(`  Sending: $${amountToSend.toFixed(2)}`);

  const account = createAdminAccount(config);
  const client = new ExchangeClient({ transport, wallet: account });

  const result = await client.usdSend({
    destination: WHITELISTED_ADDRESS,
    amount: amountToSend.toString(),
  });

  console.log('\n[OK] USDC sent!');
  console.log(`  Result: ${JSON.stringify(result, null, 2)}`);
};
