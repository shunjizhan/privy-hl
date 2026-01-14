export const config = {
  privy: {
    appId: process.env.PRIVY_APP_ID!,
    appSecret: process.env.PRIVY_APP_SECRET!,
    walletId: process.env.PRIVY_WALLET_ID || undefined,
  },
  hyperliquid: {
    masterPrivateKey: process.env.HL_MASTER_PRIVATE_KEY! as `0x${string}`,
    network: (process.env.HL_NETWORK || 'mainnet') as 'mainnet' | 'testnet',
  },
} as const;

export const getHyperliquidConfig = () => {
  const isMainnet = config.hyperliquid.network === 'mainnet';
  return {
    hyperliquidChain: (isMainnet ? 'Mainnet' : 'Testnet') as 'Mainnet' | 'Testnet',
  };
};

export const validateConfig = () => {
  const required = [
    ['PRIVY_APP_ID', config.privy.appId],
    ['PRIVY_APP_SECRET', config.privy.appSecret],
    ['HL_MASTER_PRIVATE_KEY', config.hyperliquid.masterPrivateKey],
  ] as const;

  const missing = required.filter(([_, value]) => !value).map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};
