/**
 * Admin Deposit Flow
 *
 * Interactive flow for depositing USDC from Arbitrum to Hyperliquid.
 */

import { formatUnits } from 'viem';

import {
  depositToHyperliquid,
  getArbitrumUsdcBalance,
  getArbitrumEthBalance,
  formatUsdcBalance,
  type AdminConfig,
} from '../admin';
import { prompt } from './terminal';

/**
 * Interactive admin deposit flow
 */
export const adminDeposit = async (config: AdminConfig) => {
  console.log('\n[Admin Deposit] Depositing USDC from Arbitrum to Hyperliquid...');
  console.log(`  Wallet: ${config.walletAddress}`);

  // Check balances on Arbitrum
  const usdcBalance = await getArbitrumUsdcBalance(config.walletAddress);
  const ethBalance = await getArbitrumEthBalance(config.walletAddress);

  const usdcFormatted = formatUsdcBalance(usdcBalance);
  const ethFormatted = formatUnits(ethBalance, 18);

  console.log(`\n  Arbitrum Balances:`);
  console.log(`    USDC: $${usdcFormatted}`);
  console.log(`    ETH: ${parseFloat(ethFormatted).toFixed(6)} ETH (for gas)`);

  if (usdcBalance === 0n) {
    console.log('\n  [Error] No USDC to deposit.');
    console.log(`  Send USDC to ${config.walletAddress} on Arbitrum first.`);
    return;
  }

  if (ethBalance === 0n) {
    console.log('\n  [Error] No ETH for gas fees.');
    console.log(
      `  Send ETH to ${config.walletAddress} on Arbitrum first.`
    );
    return;
  }

  // Ask for amount
  const amountStr = await prompt(
    `\nAmount to deposit (max ${usdcFormatted}, or 'all'): `
  );

  let depositAmount: string;
  if (amountStr.toLowerCase() === 'all') {
    depositAmount = usdcFormatted;
  } else {
    const parsed = parseFloat(amountStr);
    if (isNaN(parsed) || parsed <= 0) {
      console.log('  [Error] Invalid amount.');
      return;
    }
    if (parsed > parseFloat(usdcFormatted)) {
      console.log(`  [Error] Amount exceeds balance ($${usdcFormatted}).`);
      return;
    }
    depositAmount = parsed.toString();
  }

  console.log(`\n  Depositing $${depositAmount} USDC to Hyperliquid...`);

  const txHash = await depositToHyperliquid(config, depositAmount);

  console.log('\n[OK] Deposit transaction sent!');
  console.log(`  Tx Hash: ${txHash}`);
  console.log(`  View: https://arbiscan.io/tx/${txHash}`);
  console.log(
    '\n  Note: It may take a few minutes for the deposit to appear on Hyperliquid.'
  );
};
