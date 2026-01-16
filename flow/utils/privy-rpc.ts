/**
 * Shared Privy RPC Utilities
 *
 * Common utilities for calling Privy API for signing operations.
 */

import type { Hex, TypedDataDefinition } from 'viem';
import axios from 'axios';
import {
  generateAuthorizationSignature,
  type WalletApiRequestSignatureInput,
} from '@privy-io/node';

export const PRIVY_API_BASE = 'https://api.privy.io';

/**
 * Convert viem TypedDataDefinition to Privy format
 * viem uses camelCase (primaryType), Privy uses snake_case (primary_type)
 */
export const toPrivyTypedData = (
  viemTypedData: TypedDataDefinition | Record<string, unknown>
): object => {
  const { primaryType, ...rest } = viemTypedData as Record<string, unknown>;
  return {
    ...rest,
    primary_type: primaryType,
  };
};

export const buildSignatureInput = (
  privyAppId: string,
  walletId: string,
  body: object
): WalletApiRequestSignatureInput => ({
  version: 1,
  url: `${PRIVY_API_BASE}/v1/wallets/${walletId}/rpc`,
  method: 'POST',
  headers: { 'privy-app-id': privyAppId },
  body,
});

export interface CallPrivyRpcParams {
  walletId: string;
  body: object;
  authorizationPrivateKey: string;
  privyAppId: string;
  privyAppSecret?: string;
  backendUrl?: string;
}

/**
 * Call Privy API directly (for Admin) or via Backend (for Operator)
 */
export const callPrivyRpc = async (params: CallPrivyRpcParams): Promise<Hex> => {
  const {
    walletId,
    body,
    authorizationPrivateKey,
    privyAppId,
    privyAppSecret,
    backendUrl,
  } = params;

  const signature = generateAuthorizationSignature({
    input: buildSignatureInput(privyAppId, walletId, body),
    authorizationPrivateKey,
  });

  // Admin calls Privy directly, Operator goes through Backend
  if (privyAppSecret) {
    const basicAuth = Buffer.from(`${privyAppId}:${privyAppSecret}`).toString(
      'base64'
    );
    const response = await axios.post(
      `${PRIVY_API_BASE}/v1/wallets/${walletId}/rpc`,
      body,
      {
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'privy-app-id': privyAppId,
          'privy-authorization-signature': signature,
        },
        validateStatus: () => true,
      }
    );

    if (response.status !== 200) {
      const error = response.data;
      throw new Error(
        `RPC failed: ${error?.message || error?.error || JSON.stringify(error) || response.status}`
      );
    }

    if (!response.data?.data?.signature) {
      throw new Error('No signature returned from Privy');
    }

    return response.data.data.signature as Hex;
  }

  // Operator path - via Backend
  const response = await axios.post(
    `${backendUrl}/v1/vault/${walletId}/rpc`,
    body,
    {
      headers: { 'x-privy-authorization-signature': signature },
      validateStatus: () => true,
    }
  );

  if (response.status !== 200) {
    const error = response.data;
    throw new Error(
      `Vault operation failed: ${error?.message || error?.error || response.status}`
    );
  }

  if (!response.data?.data?.signature) {
    throw new Error('No signature returned from Privy');
  }

  return response.data.data.signature as Hex;
};
