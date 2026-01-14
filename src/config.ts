import { cleanEnv, str } from 'envalid';

export const config = cleanEnv(process.env, {
  PRIVY_APP_ID: str(),
  PRIVY_APP_SECRET: str(),
  PRIVY_WALLET_ID: str({ default: '' }),
  HL_MASTER_PRIVATE_KEY: str(),
});
