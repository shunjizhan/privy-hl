/**
 * Config Management
 *
 * Handles loading and saving operator and admin configurations.
 */

import * as fs from 'fs';
import * as path from 'path';

import type { AdminConfig } from '../admin';
import type { OperatorConfig } from '../signer';

const CONFIG_FILE = path.join(process.cwd(), '.operator-config.json');
const BACKEND_DATA_DIR = path.join(process.cwd(), '..', 'backend', 'data');

// Privy credentials for admin mode (from env)
const PRIVY_APP_ID = process.env.PRIVY_APP_ID || '';
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET || '';

interface AdminOwnerConfig {
  walletId: string;
  adminPrivateKey: string;
  adminPublicKey: string;
  keyQuorumId: string;
  policyId: string;
  createdAt: string;
}

/**
 * Load operator config from file
 */
export const loadOperatorConfig = (): OperatorConfig | null => {
  if (!fs.existsSync(CONFIG_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    return null;
  }
};

/**
 * Save operator config to file
 */
export const saveOperatorConfig = (config: OperatorConfig) => {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
};

/**
 * Get config file path
 */
export const getConfigFilePath = () => CONFIG_FILE;

/**
 * Load admin config from backend data folder
 * Requires operator config to know the walletId
 */
export const loadAdminConfig = (): AdminConfig | null => {
  const operatorConfig = loadOperatorConfig();
  if (!operatorConfig) return null;

  const adminFile = path.join(
    BACKEND_DATA_DIR,
    `admin-${operatorConfig.walletId}.json`
  );
  if (!fs.existsSync(adminFile)) {
    console.log(`[Warning] Admin config not found: ${adminFile}`);
    return null;
  }

  try {
    const adminOwnerConfig: AdminOwnerConfig = JSON.parse(
      fs.readFileSync(adminFile, 'utf-8')
    );

    if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
      console.log(
        '[Error] PRIVY_APP_ID and PRIVY_APP_SECRET env vars required for admin mode'
      );
      return null;
    }

    return {
      privyAppId: PRIVY_APP_ID,
      privyAppSecret: PRIVY_APP_SECRET,
      walletId: operatorConfig.walletId,
      walletAddress: operatorConfig.walletAddress as `0x${string}`,
      adminPrivateKey: adminOwnerConfig.adminPrivateKey,
    };
  } catch (error) {
    console.log(`[Error] Failed to load admin config: ${error}`);
    return null;
  }
};
