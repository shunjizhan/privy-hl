/**
 * Create Vault Flow
 *
 * Handles vault creation via the backend.
 */

import type { OperatorConfig } from '../signer';
import {
  loadOperatorConfig,
  saveOperatorConfig,
  getConfigFilePath,
  WHITELISTED_ADDRESS,
  validateWhitelistConfig,
} from './config';
import { prompt } from './terminal';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

interface CreateVaultResponse {
  success: boolean;
  operatorConfig?: OperatorConfig;
  error?: string;
  message?: string;
}

/**
 * Create a new vault via the backend
 */
export const createVaultViaBackend = async (): Promise<OperatorConfig> => {
  // Validate whitelisted address is configured
  if (!validateWhitelistConfig()) {
    throw new Error('WHITELISTED_ADDRESS env var is required');
  }

  // Check if config already exists
  const existingConfig = loadOperatorConfig();
  if (existingConfig) {
    console.log('\n[Warning] Existing vault config found!');
    console.log(`  Wallet ID: ${existingConfig.walletId}`);
    console.log(`  Address: ${existingConfig.walletAddress}`);
    console.log(`  Config file: ${getConfigFilePath()}`);

    const answer = await prompt('\nOverwrite existing config? (yes/no): ');
    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
      console.log('\n[Cancelled] Vault creation aborted.');
      throw new Error('Vault creation cancelled by user');
    }
    console.log('');
  }

  console.log('[Create] Creating vault via backend...');
  console.log(`  Backend: ${BACKEND_URL}`);
  console.log(`  Whitelist: ${WHITELISTED_ADDRESS}`);

  const response = await fetch(`${BACKEND_URL}/v1/vault/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ withdrawWhitelist: [WHITELISTED_ADDRESS] }),
  });

  const result = (await response.json()) as CreateVaultResponse;

  if (!response.ok || !result.success || !result.operatorConfig) {
    throw new Error(
      `Failed to create vault: ${result.error || 'Unknown error'}`
    );
  }

  console.log('\n[OK] Vault created!');
  console.log(`  Wallet ID: ${result.operatorConfig.walletId}`);
  console.log(`  Address: ${result.operatorConfig.walletAddress}`);
  console.log('');
  console.log('  *** DEPOSIT ADDRESS ***');
  console.log(
    `  Send USDC on Arbitrum to: ${result.operatorConfig.walletAddress}`
  );
  console.log('  (via Hyperliquid bridge or direct transfer)');

  saveOperatorConfig(result.operatorConfig);
  console.log(`\n  Config saved to: ${getConfigFilePath()}`);

  return result.operatorConfig;
};
