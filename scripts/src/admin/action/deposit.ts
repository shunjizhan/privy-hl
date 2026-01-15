/**
 * Admin Deposit Action
 *
 * Deposits USDC from Arbitrum to Hyperliquid via the bridge.
 */

import { createPublicClient, http, encodeFunctionData, formatUnits } from 'viem';
import { arbitrum } from 'viem/chains';
import { PrivyClient, type AuthorizationContext } from '@privy-io/node';

import type { AdminConfig } from '../account';

// Arbitrum contract addresses
const ARBITRUM_CONTRACTS = {
  USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as `0x${string}`,
  HYPERLIQUID_BRIDGE: '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7' as `0x${string}`,
};

// ERC20 ABI (minimal)
const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// Arbitrum public RPC
const arbitrumClient = createPublicClient({
  chain: arbitrum,
  transport: http(),
});

/**
 * Get USDC balance on Arbitrum
 */
export const getArbitrumUsdcBalance = async (
  address: `0x${string}`
): Promise<bigint> => {
  const balance = await arbitrumClient.readContract({
    address: ARBITRUM_CONTRACTS.USDC,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address],
  });
  return balance as bigint;
};

/**
 * Get ETH balance on Arbitrum (for gas)
 */
export const getArbitrumEthBalance = async (
  address: `0x${string}`
): Promise<bigint> => {
  return arbitrumClient.getBalance({ address });
};

/**
 * Format USDC balance for display
 */
export const formatUsdcBalance = (balance: bigint): string => {
  return formatUnits(balance, 6);
};

/**
 * Deposit USDC from Arbitrum to Hyperliquid
 *
 * This sends USDC to the Hyperliquid bridge contract.
 * The bridge will credit the deposit to the sender's address on Hyperliquid.
 *
 * @param config Admin config with Privy credentials
 * @param amount Amount of USDC to deposit (in human-readable format, e.g., "100" for $100)
 * @returns Transaction hash
 */
export const depositToHyperliquid = async (
  config: AdminConfig,
  amount: string
): Promise<string> => {
  const { privyAppId, privyAppSecret, walletId, adminPrivateKey } = config;

  // Initialize Privy client
  const privy = new PrivyClient({
    appId: privyAppId,
    appSecret: privyAppSecret,
  });

  // Convert amount to USDC units (6 decimals)
  const amountInUnits = BigInt(Math.floor(parseFloat(amount) * 1e6));

  // Encode the transfer call
  const data = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [ARBITRUM_CONTRACTS.HYPERLIQUID_BRIDGE, amountInUnits],
  });

  // Privy uses CAIP-2 chain identifiers
  // Arbitrum One = eip155:42161
  const caip2 = `eip155:${arbitrum.id}`;

  // Build authorization context for admin key
  const authorizationContext: AuthorizationContext = {
    authorization_private_keys: [adminPrivateKey],
  };

  // Send transaction via Privy SDK
  const response = await privy.wallets().ethereum().sendTransaction(walletId, {
    caip2,
    params: {
      transaction: {
        to: ARBITRUM_CONTRACTS.USDC,
        data,
        chain_id: arbitrum.id,
      },
    },
    authorization_context: authorizationContext,
  });

  if (!response.hash) {
    throw new Error(`No transaction hash returned: ${JSON.stringify(response)}`);
  }

  return response.hash;
};
