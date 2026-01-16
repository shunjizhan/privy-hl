/**
 * Operator Account
 *
 * Creates a viem-compatible account for Operators to interact with Hyperliquid
 * through the Smart Vault Backend. This allows Operators to trade without having
 * access to the Privy appSecret.
 *
 * Architecture (3-party system):
 * - Admin: Wallet owner with full control (can modify policies, signers)
 * - Operator: Trading entity (customer) - constrained by policy rules
 * - Backend: Service provider - also constrained by same policy rules
 *
 * The Operator receives this config from the Backend after vault creation
 * and uses it to sign trading operations through the Backend.
 */

import type { LocalAccount, Hex, TypedDataDefinition, SignableMessage } from 'viem';
import { toAccount } from 'viem/accounts';

import { callPrivyRpc, toPrivyTypedData } from '../utils';

/**
 * Configuration for Operator to interact with the vault
 * Received from Backend after vault creation
 */
export interface OperatorConfig {
  /** Smart Vault Backend URL */
  backendUrl: string;
  /** Privy App ID (public, not sensitive) */
  privyAppId: string;
  /** Privy Wallet ID */
  walletId: string;
  /** Wallet address on Hyperliquid */
  walletAddress: `0x${string}`;
  /** Operator's P-256 private key for signing requests */
  signerPrivateKey: string;
}

/**
 * Create Operator account that calls Backend API
 * Operator is constrained by policy rules
 */
export const createOperatorAccount = (config: OperatorConfig): LocalAccount => {
  const { backendUrl, privyAppId, walletId, walletAddress, signerPrivateKey } =
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
        authorizationPrivateKey: signerPrivateKey,
        privyAppId,
        backendUrl,
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
        authorizationPrivateKey: signerPrivateKey,
        privyAppId,
        backendUrl,
      });
    },

    async signTransaction(): Promise<Hex> {
      throw new Error(
        'signTransaction not supported - use signTypedData for Hyperliquid'
      );
    },
  });
};
