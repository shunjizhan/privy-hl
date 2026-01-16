/**
 * Storage utilities for vault configs
 *
 * Vault Architecture (3-party system):
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                          Privy Wallet                          │
 * │  (Holds funds, enforces policy rules on all signing requests)  │
 * └─────────────────────────────────────────────────────────────────┘
 *                    ▲              ▲              ▲
 *                    │              │              │
 *              ┌─────┴─────┐ ┌─────┴─────┐ ┌─────┴─────┐
 *              │   Admin   │ │  Operator │ │  Backend  │
 *              │  (Owner)  │ │ (Customer)│ │   (Us)    │
 *              └───────────┘ └───────────┘ └───────────┘
 *
 * - Admin: Full control - can modify policies, add/remove signers
 * - Operator: Trading entity - constrained by policy (trades + whitelisted withdrawals)
 * - Backend: Service provider - also constrained by same policy
 */

import { writeFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'data');

/**
 * Backend signer config - stored securely on the server
 * Used by the backend to sign requests on behalf of operators
 */
export interface BiconomySignerConfig {
  walletId: string;
  walletAddress: string;
  signerPrivateKey: string;
  signerPublicKey: string;
  keyQuorumId: string;
  policyId: string;
  withdrawWhitelist: string[];
  createdAt: string;
}

/**
 * Admin (Owner) config - stored securely, ideally in HSM for production
 * Has full control over the wallet and can modify policies
 */
export interface AdminOwnerConfig {
  walletId: string;
  adminPrivateKey: string;
  adminPublicKey: string;
  keyQuorumId: string;
  policyId: string;
  createdAt: string;
}

export interface VaultSummary {
  walletId: string;
  walletAddress: string;
  policyId: string;
  withdrawWhitelist: string[];
  createdAt: string;
}

const ensureDataDir = () => {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
};

export const saveBiconomySignerConfig = (config: BiconomySignerConfig): void => {
  ensureDataDir();
  writeFileSync(
    join(DATA_DIR, `biconomy-signer-${config.walletId}.json`),
    JSON.stringify(config, null, 2)
  );
};

export const saveAdminOwnerConfig = (config: AdminOwnerConfig): void => {
  ensureDataDir();
  writeFileSync(
    join(DATA_DIR, `admin-${config.walletId}.json`),
    JSON.stringify(config, null, 2)
  );
};

export const loadBiconomySignerConfig = (walletId: string): BiconomySignerConfig | null => {
  const configPath = join(DATA_DIR, `biconomy-signer-${walletId}.json`);
  if (!existsSync(configPath)) {
    return null;
  }
  return JSON.parse(readFileSync(configPath, 'utf-8'));
};

export const loadAdminOwnerConfig = (walletId: string): AdminOwnerConfig | null => {
  const configPath = join(DATA_DIR, `admin-${walletId}.json`);
  if (!existsSync(configPath)) {
    return null;
  }
  return JSON.parse(readFileSync(configPath, 'utf-8'));
};

export const listVaults = (): VaultSummary[] => {
  if (!existsSync(DATA_DIR)) {
    return [];
  }

  return readdirSync(DATA_DIR)
    .filter((f) => f.startsWith('biconomy-signer-'))
    .map((f) => {
      const data = JSON.parse(readFileSync(join(DATA_DIR, f), 'utf-8'));
      return {
        walletId: data.walletId,
        walletAddress: data.walletAddress,
        policyId: data.policyId,
        withdrawWhitelist: data.withdrawWhitelist,
        createdAt: data.createdAt,
      };
    });
};
