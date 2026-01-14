import * as fs from 'fs';
import * as path from 'path';

import { PrivyClient } from '@privy-io/node';
import { createViemAccount } from '@privy-io/node/viem';

import { config } from './config';

let privyClient: PrivyClient | null = null;

export const getPrivyClient = () => {
  if (!privyClient) {
    privyClient = new PrivyClient({
      appId: config.PRIVY_APP_ID,
      appSecret: config.PRIVY_APP_SECRET,
    });
  }
  return privyClient;
};

export interface TradingWallet {
  id: string;
  address: string;
  eoaAddress: string;
}

// Simple local storage for EOA -> Wallet mapping
// In production, this would be a database
const MAPPING_FILE = path.join(process.cwd(), '.wallet-mapping.json');

interface WalletMapping {
  [eoaAddress: string]: {
    walletId: string;
    walletAddress: string;
  };
}

const loadMapping = (): WalletMapping => {
  try {
    if (fs.existsSync(MAPPING_FILE)) {
      return JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf-8'));
    }
  } catch {
    // Ignore errors, return empty mapping
  }
  return {};
};

const saveMapping = (mapping: WalletMapping) => {
  fs.writeFileSync(MAPPING_FILE, JSON.stringify(mapping, null, 2));
};

/**
 * Get or create a trading wallet for an EOA
 * The EOA address is used as the user identifier
 */
export const getOrCreateTradingWallet = async (
  eoaAddress: string
): Promise<TradingWallet> => {
  const privy = getPrivyClient();
  const normalizedEoa = eoaAddress.toLowerCase();

  // Check local mapping first
  const mapping = loadMapping();

  if (mapping[normalizedEoa]) {
    const { walletId, walletAddress } = mapping[normalizedEoa];
    console.log(`   Found existing trading wallet for EOA: ${eoaAddress}`);

    return {
      id: walletId,
      address: walletAddress,
      eoaAddress: normalizedEoa,
    };
  }

  // Create new wallet
  console.log(`   Creating new trading wallet for EOA: ${eoaAddress}`);
  const wallet = await privy.wallets().create({
    chain_type: 'ethereum',
  });

  console.log(`   Created trading wallet: ${wallet.address}`);
  console.log(`   Wallet ID: ${wallet.id}`);

  // Save mapping
  mapping[normalizedEoa] = {
    walletId: wallet.id,
    walletAddress: wallet.address,
  };
  saveMapping(mapping);

  return {
    id: wallet.id,
    address: wallet.address,
    eoaAddress: normalizedEoa,
  };
};

/**
 * Get trading wallet for an EOA (returns null if not found)
 */
export const getTradingWallet = async (
  eoaAddress: string
): Promise<TradingWallet | null> => {
  const normalizedEoa = eoaAddress.toLowerCase();
  const mapping = loadMapping();

  if (!mapping[normalizedEoa]) {
    return null;
  }

  const { walletId, walletAddress } = mapping[normalizedEoa];

  return {
    id: walletId,
    address: walletAddress,
    eoaAddress: normalizedEoa,
  };
};

/**
 * Create a viem-compatible account from a trading wallet
 * This can be used directly with the Hyperliquid SDK
 */
export const createTradingViemAccount = (wallet: TradingWallet) => {
  const privy = getPrivyClient();

  return createViemAccount(privy, {
    walletId: wallet.id,
    address: wallet.address as `0x${string}`,
  });
};
