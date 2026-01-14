import { cleanEnv, str } from 'envalid';

export const config = cleanEnv(process.env, {
  // Privy Configuration
  PRIVY_APP_ID: str(),
  PRIVY_APP_SECRET: str(),

  // EOA private key for SIWE authentication
  // In production, this would be handled by a secure wallet connection
  EOA_PRIVATE_KEY: str({ desc: 'User EOA private key (hex with 0x prefix)' }),
});
