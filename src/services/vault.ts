/**
 * Vault Service
 *
 * Business logic for vault creation and management.
 *
 * 3-Party Architecture:
 * - Admin (Owner): Full control over wallet, can modify policies and signers
 * - Operator (Customer): Trading entity, constrained by policy rules
 * - Backend (Us): Service provider, also constrained by same policy rules
 *
 * On vault creation, we generate 3 key pairs and return the Operator config
 * to the caller. Admin and Backend configs are stored securely on server.
 */

import { generateP256KeyPair } from '@privy-io/node';

import { config } from '../config';
import {
  privyClient,
  saveBiconomySignerConfig,
  saveAdminOwnerConfig,
  loadAdminOwnerConfig,
  type BiconomySignerConfig,
  type AdminOwnerConfig,
} from '../utils';

/**
 * Config returned to Operator after vault creation
 * Contains everything the Operator needs to sign requests through the backend
 */
export interface OperatorConfig {
  /** Smart Vault Backend URL */
  backendUrl: string;
  /** Privy App ID (public, not sensitive) */
  privyAppId: string;
  /** Privy Wallet ID */
  walletId: string;
  /** Wallet address on Hyperliquid */
  walletAddress: string;
  /** Operator's P-256 private key for signing requests */
  signerPrivateKey: string;
  /** Operator's P-256 public key (registered with Privy) */
  signerPublicKey: string;
  /** Key quorum ID in Privy */
  keyQuorumId: string;
  /** Policy ID constraining this signer */
  policyId: string;
  /** Whitelisted withdrawal addresses */
  withdrawWhitelist: string[];
}

export interface CreateVaultResult {
  operatorConfig: OperatorConfig;
  walletId: string;
  walletAddress: string;
}

/**
 * Typed data schemas for Hyperliquid operations (ALLOWLIST approach)
 * Only operations with matching schemas will be allowed
 *
 * Hyperliquid has two signing mechanisms:
 * 1. L1 Actions (orders, cancels, leverage, etc.): Use Agent typed data
 *    - SDK hashes the action and puts it in `connectionId`
 *    - Each L1 action requires a new Agent signature
 * 2. User-Signed Actions (withdrawals, transfers): Use HyperliquidTransaction typed data
 *    - Direct EIP-712 signing with specific action type
 */

// Agent typed data - used for each L1 action (orders, cancels, position updates, etc.)
// The connectionId field contains the hash of the specific action being authorized
// Types must match EXACTLY between policy and request, including EIP712Domain
const AGENT_TYPED_DATA = {
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
    Agent: [
      { name: 'source', type: 'string' },
      { name: 'connectionId', type: 'bytes32' },
    ],
  },
  primary_type: 'Agent',
};

// Withdrawal typed data - User-Signed action for withdrawing to L1
// Domain: HyperliquidSignTransaction with chainId 42161 (Arbitrum mainnet)
// Types must match EXACTLY between policy and request, including EIP712Domain
const WITHDRAW_TYPED_DATA = {
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
    'HyperliquidTransaction:Withdraw': [
      { name: 'hyperliquidChain', type: 'string' },
      { name: 'destination', type: 'string' },
      { name: 'amount', type: 'string' },
      { name: 'time', type: 'uint64' },
    ],
  },
  primary_type: 'HyperliquidTransaction:Withdraw',
};

/**
 * Build policy rules for Hyperliquid trading with whitelisted withdrawals
 *
 * ALLOWLIST APPROACH: Only explicitly allowed operations pass
 *
 * Rules are evaluated in order (first match wins):
 * 1. ALLOW Agent typed data (L1 actions: orders, cancels, leverage, etc.)
 * 2. ALLOW withdrawals to whitelisted addresses only (User-Signed actions)
 * 3. DENY everything else
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const buildPolicyRules = (withdrawWhitelist: string[]): any[] => {
  // Normalize addresses to lowercase for case-insensitive matching
  // Hyperliquid sends lowercase addresses in requests
  const normalizedWhitelist = withdrawWhitelist.map((addr) => addr.toLowerCase());

  return [
  // ==========================================================================
  // PRODUCTION POLICY - L1 Actions + Whitelisted Withdrawals
  // Privy defaults to DENY if no rule matches, so we only need ALLOW rules
  // ==========================================================================

  // Rule 1: Allow L1 Actions (Agent typed data)
  // Hyperliquid uses Agent typed data for orders, cancels, leverage, etc.
  {
    name: 'Allow L1 Actions (Agent)',
    method: 'eth_signTypedData_v4',
    conditions: [
      {
        field_source: 'ethereum_typed_data_message',
        typed_data: AGENT_TYPED_DATA,
        field: 'source',
        operator: 'eq',
        value: 'a', // Hyperliquid mainnet
      },
    ],
    action: 'ALLOW',
  },

  // Rule 2: Allow Withdrawals to whitelisted addresses only
  {
    name: 'Allow Whitelisted Withdrawals',
    method: 'eth_signTypedData_v4',
    conditions: [
      {
        field_source: 'ethereum_typed_data_message',
        typed_data: WITHDRAW_TYPED_DATA,
        field: 'destination',
        operator: 'in',
        value: normalizedWhitelist,
      },
    ],
    action: 'ALLOW',
  },
];
};

/**
 * Create a new vault with admin, operator, and Biconomy signers
 */
export const createVault = async (withdrawWhitelist: string[]): Promise<CreateVaultResult> => {
  console.log('='.repeat(60));
  console.log('Creating new vault...');
  console.log('Withdrawal whitelist:', withdrawWhitelist);
  console.log('='.repeat(60));

  // 1. Generate P-256 key pairs
  const adminKey = await generateP256KeyPair();
  const operatorKey = await generateP256KeyPair();
  const biconomyKey = await generateP256KeyPair();
  console.log('[1/6] Generated P-256 key pairs');

  // 2. Register key quorums with Privy
  const adminKeyQuorum = await privyClient.keyQuorums().create({
    public_keys: [adminKey.publicKey],
    display_name: 'Vault Admin Owner',
    authorization_threshold: 1,
  });
  console.log('[2/6] Admin key quorum registered:', adminKeyQuorum.id);

  const operatorKeyQuorum = await privyClient.keyQuorums().create({
    public_keys: [operatorKey.publicKey],
    display_name: 'Operator Signer',
    authorization_threshold: 1,
  });
  console.log('      Operator key quorum registered:', operatorKeyQuorum.id);

  const biconomyKeyQuorum = await privyClient.keyQuorums().create({
    public_keys: [biconomyKey.publicKey],
    display_name: 'Biconomy Signer',
    authorization_threshold: 1,
  });
  console.log('      Biconomy key quorum registered:', biconomyKeyQuorum.id);

  // 3. Create policy
  const policyRules = buildPolicyRules(withdrawWhitelist);
  const policy = await privyClient.policies().create({
    version: '1.0',
    name: 'Hyperliquid Trading + Whitelisted Withdrawals',
    chain_type: 'ethereum',
    owner_id: adminKeyQuorum.id,
    rules: policyRules,
  });
  console.log('[3/6] Policy created:', policy.id);

  // 4. Create wallet
  const wallet = await privyClient.wallets().create({
    chain_type: 'ethereum',
    owner_id: adminKeyQuorum.id,
  });
  console.log('[4/6] Wallet created:', wallet.id, wallet.address);

  // 5. Add signers with policy
  // NOTE: Do NOT set policy_ids at wallet level - that would constrain the owner too
  // Only additional_signers have override_policy_ids, so only they are constrained
  await privyClient.wallets().update(wallet.id, {
    additional_signers: [
      { signer_id: operatorKeyQuorum.id, override_policy_ids: [policy.id] },
      { signer_id: biconomyKeyQuorum.id, override_policy_ids: [policy.id] },
    ],
    authorization_context: {
      authorization_private_keys: [adminKey.privateKey],
    },
  });
  console.log('[5/6] Wallet updated with signers (policy only on operators)');

  // 6. Save configs (Admin and Biconomy keys stay on backend)
  const biconomySignerConfig: BiconomySignerConfig = {
    walletId: wallet.id,
    walletAddress: wallet.address,
    signerPrivateKey: biconomyKey.privateKey,
    signerPublicKey: biconomyKey.publicKey,
    keyQuorumId: biconomyKeyQuorum.id,
    policyId: policy.id,
    withdrawWhitelist,
    createdAt: new Date().toISOString(),
  };
  saveBiconomySignerConfig(biconomySignerConfig);

  const adminOwnerConfig: AdminOwnerConfig = {
    walletId: wallet.id,
    adminPrivateKey: adminKey.privateKey,
    adminPublicKey: adminKey.publicKey,
    keyQuorumId: adminKeyQuorum.id,
    policyId: policy.id,
    createdAt: new Date().toISOString(),
  };
  saveAdminOwnerConfig(adminOwnerConfig);
  console.log('[6/6] Configs saved (Admin + Biconomy on backend)');

  const operatorConfig: OperatorConfig = {
    backendUrl: `http://localhost:${config.PORT}`,
    privyAppId: config.PRIVY_APP_ID,
    walletId: wallet.id,
    walletAddress: wallet.address,
    signerPrivateKey: operatorKey.privateKey,
    signerPublicKey: operatorKey.publicKey,
    keyQuorumId: operatorKeyQuorum.id,
    policyId: policy.id,
    withdrawWhitelist,
  };

  console.log('='.repeat(60));
  console.log('Vault created successfully!');
  console.log('Wallet ID:', wallet.id);
  console.log('Wallet Address:', wallet.address);
  console.log('='.repeat(60));

  return {
    operatorConfig,
    walletId: wallet.id,
    walletAddress: wallet.address,
  };
};

export interface UpdatePolicyResult {
  policyId: string;
  rulesUpdated: number;
  rules: Array<{ id: string; name: string }>;
}

/**
 * Update policy rules for an existing vault
 * Requires admin authorization (owner of the policy)
 */
export const updatePolicy = async (walletId: string): Promise<UpdatePolicyResult> => {
  console.log('='.repeat(60));
  console.log('Updating policy for wallet:', walletId);
  console.log('='.repeat(60));

  // 1. Load admin config
  const adminConfig = loadAdminOwnerConfig(walletId);
  if (!adminConfig) {
    throw new Error(`Admin config not found for wallet: ${walletId}`);
  }
  console.log('[1/4] Loaded admin config, policy:', adminConfig.policyId);

  // 2. Get current policy
  const currentPolicy = await privyClient.policies().get(adminConfig.policyId);
  console.log('[2/4] Current policy has', currentPolicy.rules?.length ?? 0, 'rules');

  // 3. Delete existing rules (need admin authorization)
  const existingRules = currentPolicy.rules ?? [];
  for (const rule of existingRules) {
    console.log(`      Deleting rule: ${rule.id} (${rule.name})`);
    await privyClient.policies().deleteRule(rule.id, {
      policy_id: adminConfig.policyId,
      authorization_context: {
        authorization_private_keys: [adminConfig.adminPrivateKey],
      },
    });
  }
  console.log('[3/4] Deleted', existingRules.length, 'existing rules');

  // 4. Create new rules with current logic
  const withdrawWhitelist = [config.WHITELISTED_ADDRESS];
  const newRules = buildPolicyRules(withdrawWhitelist);

  const createdRules: Array<{ id: string; name: string }> = [];
  for (const rule of newRules) {
    const created = await privyClient.policies().createRule(adminConfig.policyId, {
      ...rule,
      authorization_context: {
        authorization_private_keys: [adminConfig.adminPrivateKey],
      },
    });
    createdRules.push({ id: created.id, name: created.name });
    console.log(`      Created rule: ${created.id} (${created.name})`);
  }
  console.log('[4/4] Created', createdRules.length, 'new rules');

  console.log('='.repeat(60));
  console.log('Policy updated successfully!');
  console.log('='.repeat(60));

  return {
    policyId: adminConfig.policyId,
    rulesUpdated: createdRules.length,
    rules: createdRules,
  };
};
