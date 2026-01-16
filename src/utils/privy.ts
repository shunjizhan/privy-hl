/**
 * Privy SDK Client
 */

import { PrivyClient } from '@privy-io/node';

import { config } from '../config';

export const privyClient = new PrivyClient({
  appId: config.PRIVY_APP_ID,
  appSecret: config.PRIVY_APP_SECRET,
});

export const PRIVY_API_BASE = 'https://api.privy.io';
