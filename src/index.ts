/**
 * Smart Vault Backend
 *
 * A proof-of-concept demonstrating how to use Privy Server Wallets
 * to control Hyperliquid trading accounts under policy constraints.
 *
 * This backend handles:
 * - Vault creation with three-party custody (Admin, Operator, Backend)
 * - Request forwarding to Privy API (adds appSecret for Operators)
 * - Policy-controlled trading and whitelisted withdrawals
 *
 * Key Properties:
 * - Stateless: no database, no session, no business logic
 * - Policy enforcement happens in Privy, not here
 * - Operators can only perform allowed actions (trade, withdraw to whitelist)
 */

import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';

import { config } from './config';
import { vaultRoutes } from './routes/vault';

const app = new Hono();

// Custom logger format: ==> for incoming, <== for response
const customLogger = (message: string, ...rest: string[]) => {
  const formatted = message
    .replace(' --> ', ' ==> ')
    .replace(' <-- ', ' <== ');
  console.log(formatted, ...rest);
};

// Middleware
app.use('*', logger(customLogger));
app.use('*', cors());

// Routes
app.route('/v1/vault', vaultRoutes);

// Root endpoint
app.get('/', (c) => {
  return c.json({
    service: 'Smart Vault Backend',
    version: '0.1.0',
    description: 'Privy Server Wallets + Hyperliquid POC',
    endpoints: {
      create: 'POST /v1/vault',
      rpc: 'POST /v1/vault/{walletId}/rpc',
      health: 'GET /v1/vault/health',
    },
  });
});

// Start server
const port = config.PORT;

console.log('='.repeat(60));
console.log('  Smart Vault Backend');
console.log('  Privy Server Wallets + Hyperliquid POC');
console.log('='.repeat(60));
console.log(`  Port: ${port}`);
console.log(`  Privy App ID: ${config.PRIVY_APP_ID}`);
console.log('='.repeat(60));

export default {
  port,
  fetch: app.fetch,
};
