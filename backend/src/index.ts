/**
 * Biconomy Vault Gateway
 *
 * A stateless proxy server that enables Operators to use Privy API
 * without having access to the appSecret.
 *
 * Architecture:
 * - Operator signs requests with their P-256 signer key
 * - Gateway adds appSecret and forwards to Privy
 * - Privy validates both authentication layers
 * - Gateway returns Privy's response
 *
 * Key Properties:
 * - Stateless: no database, no session, no business logic
 * - Transparent: just adds appSecret and forwards
 * - Policy enforcement happens in Privy, not here
 */

import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';

import { config } from './config';
import { vaultRoutes } from './routes/vault';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors());

// Routes
app.route('/v1/vault', vaultRoutes);

// Root endpoint
app.get('/', (c) => {
  return c.json({
    service: 'Biconomy Vault Gateway',
    version: '0.1.0',
    description: 'Stateless proxy for Privy API',
    endpoints: {
      rpc: 'POST /v1/vault/{walletId}/rpc',
      health: 'GET /v1/vault/health',
    },
  });
});

// Start server
const port = config.PORT;

console.log('='.repeat(60));
console.log('  Biconomy Vault Gateway');
console.log('='.repeat(60));
console.log(`  Port: ${port}`);
console.log(`  Privy App ID: ${config.PRIVY_APP_ID}`);
console.log('='.repeat(60));

export default {
  port,
  fetch: app.fetch,
};
