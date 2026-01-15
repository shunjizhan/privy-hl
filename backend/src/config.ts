import { cleanEnv, str, port } from 'envalid';

export const config = cleanEnv(process.env, {
  // Server Configuration
  PORT: port({ default: 3000 }),

  // Privy Configuration
  PRIVY_APP_ID: str({ desc: 'Privy App ID' }),
  PRIVY_APP_SECRET: str({ desc: 'Privy App Secret (keep secure!)' }),
});
