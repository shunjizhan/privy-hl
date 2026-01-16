/**
 * Vault request validation schemas
 */

import { z } from 'zod';

const ethAddress = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address');

export const createVaultSchema = z.object({
  withdrawWhitelist: z.array(ethAddress).optional(),
});

export const rpcBodySchema = z.object({
  method: z.string().min(1),
  params: z.unknown().optional(),
});

export const rpcHeadersSchema = z.object({
  'x-privy-authorization-signature': z.string().min(1),
});

export type CreateVaultRequest = z.infer<typeof createVaultSchema>;
export type RpcBody = z.infer<typeof rpcBodySchema>;
export type RpcHeaders = z.infer<typeof rpcHeadersSchema>;
