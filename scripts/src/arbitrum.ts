import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  formatUnits,
} from 'viem';
import { arbitrum } from 'viem/chains';

import { createTradingViemAccount, type TradingWallet } from './privy';

// USDC on Arbitrum One (native USDC)
const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const;
const USDC_DECIMALS = 6;

// Minimal ERC20 ABI for balance and transfer
const ERC20_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
]);

// Public client for read operations
const publicClient = createPublicClient({
  chain: arbitrum,
  transport: http(),
});

/**
 * Get USDC balance on Arbitrum for an address
 */
export const getUsdcBalance = async (address: string): Promise<string> => {
  const balance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
  });

  return formatUnits(balance, USDC_DECIMALS);
};

/**
 * Transfer USDC on Arbitrum from trading wallet to destination
 */
export const transferUsdc = async (
  tradingWallet: TradingWallet,
  destination: `0x${string}`,
  amount: bigint
) => {
  const account = createTradingViemAccount(tradingWallet);

  const walletClient = createWalletClient({
    account,
    chain: arbitrum,
    transport: http(),
  });

  const hash = await walletClient.writeContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [destination, amount],
  });

  return hash;
};

/**
 * Reap all USDC from trading wallet to EOA on Arbitrum
 * This is an on-chain ERC20 transfer, not a Hyperliquid withdrawal
 */
export const reapUsdcOnArbitrum = async (
  tradingWallet: TradingWallet,
  destination: `0x${string}`
) => {
  // Get raw balance (not formatted)
  const balance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [tradingWallet.address as `0x${string}`],
  });

  const formattedBalance = formatUnits(balance, USDC_DECIMALS);

  console.log(`\n🌾 Reap USDC (Arbitrum) Details:`);
  console.log(`   From: ${tradingWallet.address}`);
  console.log(`   To: ${destination}`);
  console.log(`   Balance: $${parseFloat(formattedBalance).toFixed(2)} USDC`);

  if (balance === 0n) {
    throw new Error('No USDC balance on Arbitrum');
  }

  const hash = await transferUsdc(tradingWallet, destination, balance);

  console.log(`   Tx Hash: ${hash}`);

  return {
    status: 'ok',
    txHash: hash,
    amount: formattedBalance,
  };
};
