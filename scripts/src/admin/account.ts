/**
 * Admin Account
 *
 * Creates a viem-compatible account for Admin (Owner) to interact with Hyperliquid.
 * Admin has FULL control - not constrained by policy rules.
 * Admin calls Privy API directly (requires appSecret).
 */

import type { LocalAccount, Hex, TypedDataDefinition, SignableMessage } from 'viem';
import { toAccount } from 'viem/accounts';

import { callPrivyRpc, toPrivyTypedData } from '../utils';

/**
 * Configuration for Admin (Owner) to interact with the vault
 * Stored securely on backend, used for testing/admin operations
 */
export interface AdminConfig {
  /** Privy App ID (public, not sensitive) */
  privyAppId: string;
  /** Privy App Secret (required for direct API calls) */
  privyAppSecret: string;
  /** Privy Wallet ID */
  walletId: string;
  /** Wallet address on Hyperliquid */
  walletAddress: `0x${string}`;
  /** Admin's P-256 private key (owner key) */
  adminPrivateKey: string;
}

/**
 * Create Admin account that calls Privy API directly
 * Admin has FULL control - not constrained by policy rules
 */
export const createAdminAccount = (config: AdminConfig): LocalAccount => {
  const { privyAppId, privyAppSecret, walletId, walletAddress, adminPrivateKey } =
    config;

  return toAccount({
    address: walletAddress,

    async signTypedData<
      const typedData extends TypedDataDefinition | Record<string, unknown>,
    >(parameters: typedData): Promise<Hex> {
      const body = {
        method: 'eth_signTypedData_v4',
        params: { typed_data: toPrivyTypedData(parameters) },
      };

      return callPrivyRpc({
        walletId,
        body,
        authorizationPrivateKey: adminPrivateKey,
        privyAppId,
        privyAppSecret,
      });
    },

    async signMessage({ message }: { message: SignableMessage }): Promise<Hex> {
      const messageStr =
        typeof message === 'string'
          ? message
          : 'raw' in message
            ? message.raw
            : String(message);

      const body = {
        method: 'personal_sign',
        params: { message: messageStr, encoding: 'utf-8' },
      };

      return callPrivyRpc({
        walletId,
        body,
        authorizationPrivateKey: adminPrivateKey,
        privyAppId,
        privyAppSecret,
      });
    },

    async signTransaction(): Promise<Hex> {
      throw new Error(
        'signTransaction not supported - use signTypedData for Hyperliquid'
      );
    },
  });
};
