/**
 * Create Vault Flow
 *
 * Handles vault creation via the gateway.
 */

import type { OperatorConfig } from '../signer';
import {
  loadOperatorConfig,
  saveOperatorConfig,
  getConfigFilePath,
} from './config';
import { prompt } from './terminal';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';
const WHITELISTED_ADDRESS = '0x36CD9238Fd87901661d74c6E7d817DEBbEd034d4';

interface CreateVaultResponse {
  success: boolean;
  operatorConfig?: OperatorConfig;
  error?: string;
  message?: string;
}

/**
 * Create a new vault via the gateway
 */
export const createVaultViaGateway = async (): Promise<OperatorConfig> => {
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

  console.log('[Create] Creating vault via gateway...');
  console.log(`  Gateway: ${GATEWAY_URL}`);
  console.log(`  Whitelist: ${WHITELISTED_ADDRESS}`);

  const response = await fetch(`${GATEWAY_URL}/v1/vault/create`, {
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
