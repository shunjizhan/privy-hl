/**
 * Vault Routes
 *
 * Thin HTTP handlers for vault operations.
 */

import { Hono } from 'hono';
import axios from 'axios';

import { config } from '../config';
import { PRIVY_API_BASE, listVaults, loadBiconomySignerConfig } from '../utils';
import { createVault, updatePolicy } from '../services';
import { createVaultSchema, rpcBodySchema, rpcHeadersSchema } from '../schemas';

export const vaultRoutes = new Hono();

const DEFAULT_WHITELIST = ['0x36CD9238Fd87901661d74c6E7d817DEBbEd034d4'];

// ============================================================================
// Routes
// ============================================================================

vaultRoutes.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'vault-gateway' });
});

vaultRoutes.post('/create', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const parsed = createVaultSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ success: false, error: parsed.error.flatten() }, 400);
    }

    const withdrawWhitelist = parsed.data.withdrawWhitelist || DEFAULT_WHITELIST;
    const result = await createVault(withdrawWhitelist);

    return c.json({
      success: true,
      operatorConfig: result.operatorConfig,
      message: 'Vault created successfully. Operator config contains all credentials needed to use the vault.',
    });
  } catch (error) {
    console.error('Vault creation error:', error);
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

vaultRoutes.get('/list', (c) => {
  try {
    return c.json({ vaults: listVaults() });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

vaultRoutes.get('/:walletId/biconomy-config', (c) => {
  const walletId = c.req.param('walletId');

  try {
    const data = loadBiconomySignerConfig(walletId);
    if (!data) {
      return c.json({ error: 'Vault not found' }, 404);
    }
    return c.json(data);
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

/**
 * Admin endpoint: Update policy rules for a vault
 * This allows updating policy rules without creating a new wallet
 */
vaultRoutes.post('/:walletId/admin/update-policy', async (c) => {
  const walletId = c.req.param('walletId');

  try {
    const result = await updatePolicy(walletId);
    return c.json({
      success: true,
      ...result,
      message: 'Policy updated successfully',
    });
  } catch (error) {
    console.error('Policy update error:', error);
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

/**
 * RPC proxy - forwards pre-signed requests to Privy
 */
vaultRoutes.post('/:walletId/rpc', async (c) => {
  const walletId = c.req.param('walletId');

  // Validate headers
  const headers = {
    'x-privy-authorization-signature': c.req.header('x-privy-authorization-signature'),
  };
  const headersResult = rpcHeadersSchema.safeParse(headers);
  if (!headersResult.success) {
    return c.json({ error: headersResult.error.flatten() }, 400);
  }

  // Validate body
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const bodyResult = rpcBodySchema.safeParse(body);
  if (!bodyResult.success) {
    return c.json({ error: bodyResult.error.flatten() }, 400);
  }

  const authorizationSignature = headersResult.data['x-privy-authorization-signature'];
  const basicAuth = Buffer.from(
    `${config.PRIVY_APP_ID}:${config.PRIVY_APP_SECRET}`
  ).toString('base64');

  try {
    const response = await axios.post(
      `${PRIVY_API_BASE}/v1/wallets/${walletId}/rpc`,
      bodyResult.data,
      {
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'privy-app-id': config.PRIVY_APP_ID,
          'privy-authorization-signature': authorizationSignature,
        },
        validateStatus: () => true,
      }
    );

    return c.json(response.data, response.status as 200 | 400 | 401 | 403 | 500);
  } catch (error) {
    console.error('[Gateway] Error forwarding to Privy:', error);
    return c.json({ error: 'Failed to forward request to Privy' }, 500);
  }
});
