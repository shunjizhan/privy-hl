/**
 * Vault Service
 *
 * Business logic for vault creation and management.
 *
 * 3-Party Architecture:
 * - Admin (Owner): Full control over wallet, can modify policies and signers
 * - Operator (Customer): Trading entity, constrained by policy rules
 * - Biconomy (Us): Gateway provider, also constrained by same policy rules
 *
 * On vault creation, we generate 3 key pairs and return the Operator config
 * to the caller. Admin and Biconomy configs are stored securely on backend.
 */

import { generateP256KeyPair } from '@privy-io/node';

import { config } from '../config';
import {
  privyClient,
  saveBiconomySignerConfig,
  saveAdminOwnerConfig,
  type BiconomySignerConfig,
  type AdminOwnerConfig,
} from '../utils';

/**
 * Config returned to Operator after vault creation
 * Contains everything the Operator needs to sign requests through the Gateway
 */
export interface OperatorConfig {
  /** Biconomy Gateway URL */
  gatewayUrl: string;
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
 * Withdrawal typed data schema for Hyperliquid
 * From sig-data.md - HyperliquidSignTransaction uses verifyingContract = 0x0
 */
const WITHDRAW_TYPED_DATA = {
  types: {
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
 * Zero address used by HyperliquidSignTransaction domain (non-trading operations)
 * Exchange (trading) operations use a non-zero verifyingContract
 */
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Build policy rules for Hyperliquid trading with whitelisted withdrawals
 *
 * Rules are evaluated in order (first match wins):
 * 1. ALLOW withdrawals to whitelisted addresses
 * 2. DENY ALL HyperliquidSignTransaction operations (verifyingContract = 0x0)
 * 3. ALLOW Exchange operations (trading) - has non-zero verifyingContract
 * 4. DENY all other methods
 *
 * Note: Deposits are NOT allowed for signers - only Admin can deposit
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const buildPolicyRules = (withdrawWhitelist: string[]): any[] => [
  // Rule 1: Allow withdrawals ONLY to whitelisted addresses
  {
    name: 'Allow Whitelisted Withdrawals',
    method: 'eth_signTypedData_v4',
    conditions: [
      {
        field_source: 'ethereum_typed_data_message',
        typed_data: WITHDRAW_TYPED_DATA,
        field: 'destination',
        operator: 'in',
        value: withdrawWhitelist,
      },
    ],
    action: 'ALLOW',
  },
  // Rule 2: Deny ALL HyperliquidSignTransaction operations (verifyingContract = 0x0)
  // This catches: non-whitelisted withdrawals, USD sends, spot transfers, etc.
  {
    name: 'Deny All HyperliquidSignTransaction',
    method: 'eth_signTypedData_v4',
    conditions: [
      {
        field_source: 'ethereum_typed_data_domain',
        field: 'verifyingContract',
        operator: 'eq',
        value: ZERO_ADDRESS,
      },
    ],
    action: 'DENY',
  },
  // Rule 3: Allow Exchange operations (trading)
  // Only reaches here if verifyingContract != 0x0 (i.e., Exchange domain)
  {
    name: 'Allow Trading Operations',
    method: 'eth_signTypedData_v4',
    conditions: [
      {
        field_source: 'system',
        field: 'current_unix_timestamp',
        operator: 'lt',
        value: '4102444800', // Always true - only reached for Exchange operations
      },
    ],
    action: 'ALLOW',
  },
  // Rule 4: Deny all other operations (deposits, eth_sendTransaction, etc.)
  {
    name: 'Deny All Other Operations',
    method: '*',
    conditions: [
      {
        field_source: 'system',
        field: 'current_unix_timestamp',
        operator: 'lt',
        value: '4102444800', // Always true
      },
    ],
    action: 'DENY',
  },
];

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
  const policy = await privyClient.policies().create({
    version: '1.0',
    name: 'Hyperliquid Trading + Whitelisted Withdrawals',
    chain_type: 'ethereum',
    owner_id: adminKeyQuorum.id,
    rules: buildPolicyRules(withdrawWhitelist),
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
    gatewayUrl: `http://localhost:${config.PORT}`,
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
