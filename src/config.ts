import { cleanEnv, str, port, makeValidator } from 'envalid';

// Custom validator that lowercases Ethereum addresses
const ethAddress = makeValidator((input) => {
  if (!/^0x[a-fA-F0-9]{40}$/.test(input)) {
    throw new Error('Must be a valid Ethereum address (0x followed by 40 hex chars)');
  }
  return input.toLowerCase();
});

export const config = cleanEnv(process.env, {
  // Server Configuration
  PORT: port({ default: 3000 }),

  // Privy Configuration
  PRIVY_APP_ID: str({ desc: 'Privy App ID' }),
  PRIVY_APP_SECRET: str({ desc: 'Privy App Secret (keep secure!)' }),

  // Policy Configuration
  WHITELISTED_ADDRESS: ethAddress({ desc: 'Whitelisted withdrawal address' }),
});
