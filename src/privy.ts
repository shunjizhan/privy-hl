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

export interface PrivyWallet {
  id: string;
  address: string;
}

/**
 * Create a new server wallet or retrieve existing one
 */
export const getOrCreateWallet = async (): Promise<PrivyWallet> => {
  const privy = getPrivyClient();

  if (config.PRIVY_WALLET_ID) {
    console.log(`   Using existing wallet: ${config.PRIVY_WALLET_ID}`);
    const wallet = await privy.wallets().get(config.PRIVY_WALLET_ID);
    return {
      id: wallet.id,
      address: wallet.address,
    };
  }

  console.log('   Creating new Privy server wallet...');
  const wallet = await privy.wallets().create({ chain_type: 'ethereum' });
  console.log(`   Created wallet: ${wallet.address}`);
  console.log(`   ⚠️  Save this wallet ID to .env: PRIVY_WALLET_ID=${wallet.id}`);

  return {
    id: wallet.id,
    address: wallet.address,
  };
};

/**
 * Create a viem-compatible account from a Privy wallet
 * This can be used directly with the Hyperliquid SDK
 */
export const createPrivyViemAccount = (wallet: PrivyWallet) => {
  const privy = getPrivyClient();

  return createViemAccount(privy, {
    walletId: wallet.id,
    address: wallet.address as `0x${string}`,
  });
};
