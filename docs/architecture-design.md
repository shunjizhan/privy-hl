# Smart Vault Architecture Design

## Requirements Summary

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| R1 | Both parties (Operator & Biconomy) are **policy-constrained** | Must | ✅ Achievable |
| R2 | Each party can act **independently** (no 2-of-2 quorum for operations) | Must | ✅ Achievable |
| R3 | Permissions: **trading allowed**, **withdrawals to whitelist only** | Must | ✅ Achievable |
| R4 | **Compatible with existing tools and flows** (viem wallet, SDKs) | Must | ✅ Achievable |
| R5 | **No full control** - ideally no one has unrestricted vault access | Should | ✅ Achievable |

---

## Signer Flow

Signers (Operator or Biconomy) follow the same flow to sign requests:

```
Signer            Backend           Privy
   │                 │                │
   │  request +      │                │
   │  auth sig       │                │
   │  (P-256)        │                │
   │────────────────>│                │
   │                 │  + appSecret   │
   │                 │───────────────>│
   │                 │                │  validate
   │                 │                │  policy check
   │                 │                │  sign in TEE
   │                 │  vault sig     │
   │                 │  (secp256k1)   │
   │                 │<───────────────│
   │  vault sig      │                │
   │<────────────────│                │
   │                 │                │

• Auth sig (P-256): Signs the Privy API request (which contains the 712 data)
• Vault sig (secp256k1): Signs the actual Hyperliquid 712 data - submitted to Hyperliquid
```

---

## Architecture: Vault Backend

### Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         VAULT BACKEND ARCHITECTURE                   │
│                                                                          │
│  ┌─────────────────────┐                                                │
│  │   Operator Server   │                                                │
│  │                     │                                                │
│  │   Has:              │                                                │
│  │   ✓ operatorAuthKey │  (P-256 private key)                          │
│  │   ✗ appSecret       │  (NOT shared)                                 │
│  └──────────┬──────────┘                                                │
│             │                                                            │
│             │  1. Construct Privy request payload                       │
│             │  2. Sign payload with operatorAuthKey                     │
│             │  3. Send to Vault Backend                              │
│             ▼                                                            │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                     VAULT BACKEND                             │    │
│  │                     (Stateless Proxy)                            │    │
│  │                                                                  │    │
│  │   Responsibilities:                                              │    │
│  │   • Receive Operator's pre-signed request                       │    │
│  │   • Validate request format (NOT business logic)                │    │
│  │   • Add appSecret for Privy authentication                      │    │
│  │   • Forward to Privy API                                        │    │
│  │   • Return Privy response to Operator                           │    │
│  │                                                                  │    │
│  │   Does NOT:                                                      │    │
│  │   • Evaluate policies (Privy does this)                         │    │
│  │   • Store state                                                  │    │
│  │   • Make business decisions                                      │    │
│  │                                                                  │    │
│  │   Has:                                                           │    │
│  │   ✓ appSecret (for Privy auth)                                  │    │
│  │   ✓ biconomyAuthKey (for Biconomy's own operations)             │    │
│  └──────────────────────────┬──────────────────────────────────────┘    │
│                             │                                            │
│                             │  4. Forward to Privy with appSecret       │
│                             ▼                                            │
│                    ┌─────────────────┐                                   │
│                    │    Privy API    │                                   │
│                    │                 │                                   │
│                    │  Verifies:      │                                   │
│                    │  1. appSecret ✓ │                                   │
│                    │  2. Auth key ✓  │ (Operator's signature)           │
│                    │  3. Policy ✓    │ (Whitelist, etc.)                │
│                    └────────┬────────┘                                   │
│                             │                                            │
│                             ▼                                            │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                        VAULT WALLET                               │   │
│  │                                                                   │   │
│  │  Owner: 2-of-2 Key Quorum (Cold Keys)                            │   │
│  │         ├── Biconomy Admin Key (offline/HSM)                     │   │
│  │         └── Third Party Key (auditor/legal)                      │   │
│  │                                                                   │   │
│  │  Signers (policy-constrained, can have different policies):      │   │
│  │  ┌─────────────────────────┐  ┌─────────────────────────────┐    │   │
│  │  │   Signer: Operator      │  │   Signer: Biconomy          │    │   │
│  │  │   Policy: OPERATOR_OPS  │  │   Policy: BICONOMY_OPS      │    │   │
│  │  │   (defined per vault)   │  │   (defined per vault)       │    │   │
│  │  └─────────────────────────┘  └─────────────────────────────┘    │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### How Signers Use Exchange SDKs

The critical challenge: Exchange SDKs expect a viem-compatible account, but Operator can't use Privy's `createViemAccount` because it requires `appSecret`.

**Solution**: Create a custom viem-compatible account that routes through the backend transparently.

**Key Insight**: We abstract at the wallet signing level (`signTypedData`, `signMessage`), not at the exchange API level. Any SDK that accepts a viem-compatible account works out of the box - Hyperliquid, dYdX, GMX, or any other exchange. The SDK doesn't care HOW signing is implemented, it just calls the method and expects a signature back.

**Extensibility**: Adding support for a new exchange requires zero changes to the signer SDK or backend - just use the new exchange's SDK with the same vault account.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    OPERATOR USING HYPERLIQUID SDK                           │
│                                                                             │
│  // Operator's code - looks exactly like normal Hyperliquid usage!         │
│  const client = new hl.ExchangeClient({ wallet: vaultAccount });           │
│  await client.order({ orders: [...], grouping: 'na' });                    │
│                                                                             │
│       │                                                                     │
│       │ Hyperliquid SDK calls vaultAccount.signTypedData(typedData)        │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  CUSTOM VIEM ACCOUNT (vaultAccount)                                 │   │
│  │                                                                      │   │
│  │  signTypedData(typedData) {                                         │   │
│  │    1. Construct Privy API request payload                           │   │
│  │    2. Format for authorization signature (Privy utility)            │   │
│  │    3. Sign with Operator's P-256 signer key                         │   │
│  │    4. POST to Vault Backend                                      │   │
│  │    5. Return signature from response                                │   │
│  │  }                                                                   │   │
│  └──────────────────────────────┬──────────────────────────────────────┘   │
│                                 │                                           │
│                                 ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  VAULT BACKEND                                                    │   │
│  │                                                                      │   │
│  │  1. Receive: payload + operator's privy-authorization-signature     │   │
│  │  2. Add: Authorization: Basic (appId:appSecret)                     │   │
│  │  3. Forward to: https://api.privy.io/v1/wallets/{id}/rpc           │   │
│  │  4. Return: Privy's response                                        │   │
│  └──────────────────────────────┬──────────────────────────────────────┘   │
│                                 │                                           │
│                                 ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  PRIVY API                                                           │   │
│  │                                                                      │   │
│  │  1. Validate appSecret ✓ (from backend's Basic Auth header)         │   │
│  │  2. Validate authorization signature ✓ (Operator's P-256 sig)       │   │
│  │  3. Verify signer has permission on wallet ✓                        │   │
│  │  4. Evaluate policy ✓ (whitelist check for withdrawals)             │   │
│  │  5. Execute signing in TEE                                          │   │
│  │  6. Return wallet signature                                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Signer SDK: High-Level Flow

The signer SDK creates a viem-compatible account that handles signing transparently:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SIGNER SDK FLOW                                      │
│                                                                              │
│  ┌──────────────────┐                                                       │
│  │  Hyperliquid SDK │                                                       │
│  │                  │                                                       │
│  │  client.order()  │                                                       │
│  │  client.cancel() │                                                       │
│  │  client.withdraw()                                                       │
│  └────────┬─────────┘                                                       │
│           │                                                                  │
│           │ Calls account.signTypedData(typedData)                          │
│           ▼                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  VIEM ACCOUNT WRAPPER                                                 │   │
│  │                                                                       │   │
│  │  Step 1: Construct Privy request payload                             │   │
│  │          { method: 'eth_signTypedData_v4', params: { typed_data } }  │   │
│  │                                                                       │   │
│  │  Step 2: Format request for signing (Privy utility)                  │   │
│  │          formatRequestForAuthorizationSignature(request)             │   │
│  │                                                                       │   │
│  │  Step 3: Sign with P-256 signer key                                  │   │
│  │          authSignature = signP256(signerKey, formattedRequest)       │   │
│  │                                                                       │   │
│  │  Step 4: Send to Vault Backend                                       │   │
│  │          POST /v1/vault/{walletId}/rpc                               │   │
│  │          Headers: X-Privy-Authorization-Signature                    │   │
│  └────────────────────────────┬──────────────────────────────────────────┘   │
│                               │                                              │
│                               ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  VAULT BACKEND                                                        │   │
│  │                                                                       │   │
│  │  • Adds appSecret (Basic Auth)                                       │   │
│  │  • Forwards to Privy API                                             │   │
│  └────────────────────────────┬──────────────────────────────────────────┘   │
│                               │                                              │
│                               ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  PRIVY API                                                            │   │
│  │                                                                       │   │
│  │  1. Validate appSecret ✓                                             │   │
│  │  2. Validate P-256 authorization signature ✓                         │   │
│  │  3. Verify signer has permission on wallet ✓                         │   │
│  │  4. Evaluate policy rules ✓                                          │   │
│  │  5. Sign in TEE → Return wallet signature (secp256k1)                │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Points:**
- Hyperliquid SDK is unaware of the routing - it just calls `signTypedData()`
- P-256 signature proves the signer authorized the request
- Policy evaluation happens in Privy, not in the backend
- Final wallet signature (secp256k1) is returned to the SDK

---

### Operator Usage: Complete Example

```typescript
// operator-trading-bot.ts

import { HttpTransport, ExchangeClient, InfoClient } from '@nktkas/hyperliquid';

import { createOperatorAccount, type OperatorConfig } from './signer/account';

// Configuration provided by Biconomy during vault setup (one-time onboarding)
const config: OperatorConfig = {
  backendUrl: 'https://vault.biconomy.io',
  privyAppId: 'clxxxxxx',  // Biconomy's Privy app ID (public)
  walletId: 'wallet-abc123',
  walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
  signerPrivateKey: process.env.OPERATOR_P256_SIGNER_KEY!  // Generated during vault creation
};

async function main() {
  const transport = new HttpTransport();

  // 1. Create vault account (routes through backend)
  const account = createOperatorAccount(config);

  // 2. Use with Hyperliquid SDK - works exactly like a normal wallet!
  const client = new ExchangeClient({ transport, wallet: account });

  // 3. Place orders - SDK calls account.signTypedData() internally
  const orderResult = await client.order({
    orders: [{
      a: 0,  // Asset index (0 = BTC)
      b: true,  // isBuy
      p: '50000',  // limit price
      s: '0.001',  // size
      r: false,  // reduceOnly
      t: { limit: { tif: 'Gtc' } }
    }],
    grouping: 'na'
  });
  console.log('Order placed:', orderResult);

  // 4. Cancel orders
  await client.cancel({
    cancels: [{ a: 0, o: orderResult.response.data.statuses[0].resting.oid }]
  });

  // 5. Withdraw to whitelisted address - policy enforced by Privy
  await client.withdraw3({
    destination: '0xWhitelistedColdWallet...',  // Must be in policy whitelist
    amount: '100'
  });
  // Withdraw to non-whitelisted address would fail at Privy policy check

  // 6. Get account info (read-only, no signature needed)
  const infoClient = new InfoClient({ transport });
  const state = await infoClient.clearinghouseState({ user: account.address });
  console.log('Account state:', state);
}

main().catch(console.error);
```

---

### What Biconomy Provides to Operator

During vault onboarding, Biconomy generates all credentials and provides them to the Operator (one-time):

| Item | Value | Security |
|------|-------|----------|
| `backendUrl` | `https://vault.biconomy.io` | Public |
| `privyAppId` | `clxxxxxx` | Public (safe to share) |
| `walletId` | `wallet-abc123` | Public |
| `walletAddress` | `0x1234...` | Public |
| `signerPrivateKey` | P-256 private key (base64) | **SECRET - Operator must keep secure** |

### Vault Creation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      VAULT CREATION FLOW (ONE-TIME)                          │
│                                                                              │
│  ┌────────────────┐                              ┌──────────────┐           │
│  │ Vault Backend  │                              │    Privy     │           │
│  └───────┬────────┘                              └──────┬───────┘           │
│          │                                              │                    │
│          │ ═══════════════════════════════════════════════════════════════  │
│          │  STEP 1: Generate P-256 Key Pairs (Admin, Operator, Biconomy)    │
│          │ ═══════════════════════════════════════════════════════════════  │
│          │                                              │                    │
│          │  generateP256KeyPair() × 3                   │                    │
│          │  • adminKey (publicKey, privateKey)          │                    │
│          │  • operatorKey (publicKey, privateKey)       │                    │
│          │  • biconomyKey (publicKey, privateKey)       │                    │
│          │                                              │                    │
│          │ ═══════════════════════════════════════════════════════════════  │
│          │  STEP 2: Register Key Quorums                                    │
│          │ ═══════════════════════════════════════════════════════════════  │
│          │                                              │                    │
│          │  Create key quorums ─────────────────────────>│                   │
│          │  • Admin quorum (threshold: 1)               │                    │
│          │  • Operator quorum (threshold: 1)            │                    │
│          │  • Biconomy quorum (threshold: 1)            │                    │
│          │                                     Returns: │                    │
│          │  <─────────────────────────────── quorum IDs │                    │
│          │                                              │                    │
│          │ ═══════════════════════════════════════════════════════════════  │
│          │  STEP 3: Create Policy                                           │
│          │ ═══════════════════════════════════════════════════════════════  │
│          │                                              │                    │
│          │  Create policy with rules ───────────────────>│                   │
│          │  • Allow L1 Actions (Agent typed data)       │                    │
│          │  • Allow Withdrawals (whitelist only)        │                    │
│          │  • Default: DENY everything else             │                    │
│          │                                     Returns: │                    │
│          │  <─────────────────────────────── policy ID  │                    │
│          │                                              │                    │
│          │ ═══════════════════════════════════════════════════════════════  │
│          │  STEP 4: Create Wallet                                           │
│          │ ═══════════════════════════════════════════════════════════════  │
│          │                                              │                    │
│          │  Create wallet ──────────────────────────────>│                   │
│          │  • owner_id: adminKeyQuorum.id               │                    │
│          │                                     Returns: │                    │
│          │  <─────────────────── wallet ID + address    │                    │
│          │                                              │                    │
│          │ ═══════════════════════════════════════════════════════════════  │
│          │  STEP 5: Add Signers with Policy                                 │
│          │ ═══════════════════════════════════════════════════════════════  │
│          │                                              │                    │
│          │  Update wallet (signed by Admin) ────────────>│                   │
│          │  additional_signers: [                       │                    │
│          │    { signer_id: operatorQuorum,              │                    │
│          │      override_policy_ids: [policyId] },      │                    │
│          │    { signer_id: biconomyQuorum,              │                    │
│          │      override_policy_ids: [policyId] }       │                    │
│          │  ]                                           │                    │
│          │                                              │                    │
│          │ ═══════════════════════════════════════════════════════════════  │
│          │  STEP 6: Save & Distribute Configs                               │
│          │ ═══════════════════════════════════════════════════════════════  │
│          │                                              │                    │
│          │  BACKEND keeps:                              │                    │
│          │  ├── Admin config (adminPrivateKey, etc.)    │                    │
│          │  └── Biconomy config (biconomyPrivateKey)    │                    │
│          │                                              │                    │
│          │  OPERATOR receives:                          │                    │
│          │  └── OperatorConfig {                        │                    │
│          │        backendUrl,                           │                    │
│          │        privyAppId,                           │                    │
│          │        walletId,                             │                    │
│          │        walletAddress,                        │                    │
│          │        signerPrivateKey  ◄── SECRET          │                    │
│          │      }                                       │                    │
│          ▼                                              │                    │
│  ┌──────────────┐                                       │                    │
│  │   Operator   │                                       │                    │
│  │              │                                       │                    │
│  │  Can now:    │                                       │                    │
│  │  • Trade     │  (L1 actions via Agent typed data)    │                    │
│  │  • Withdraw  │  (to whitelisted addresses only)      │                    │
│  │              │                                       │                    │
│  │  Cannot:     │                                       │                    │
│  │  • Change policy (requires Admin)                    │                    │
│  │  • Add/remove signers (requires Admin)               │                    │
│  └──────────────┘                                       │                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Notes**:
- Privy signers use **P-256** keys, not Ethereum EOA keys (secp256k1). Operators cannot use their existing EOA wallet as a signer.
- Admin keys are kept on the backend for policy updates but are not used for day-to-day operations.
- Operator's private key is only provided once during vault creation - Backend should not retain it.

---

### Biconomy Direct Access

Biconomy's own server can call Privy directly (has appSecret):

```typescript
// Biconomy's server - direct Privy access
import { PrivyClient } from '@privy-io/node';
import { createViemAccount } from '@privy-io/node/viem';

const privy = new PrivyClient({
  appId: APP_ID,
  appSecret: APP_SECRET  // Biconomy has this
});

const biconomyAccount = await createViemAccount(privy, {
  walletId: vaultWalletId,
  address: vaultAddress,
  authorizationContext: {
    authorization_private_keys: [BICONOMY_AUTH_KEY]
  }
});

// Direct Hyperliquid SDK usage
const hlClient = new hl.ExchangeClient({
  transport: new hl.HttpTransport(),
  wallet: biconomyAccount
});

await hlClient.order({ orders: [...], grouping: 'na' });
```

---

## Security Analysis

### What the Backend CAN Do

| Action | Backend Can Do? | Notes |
|--------|----------------|-------|
| Forward Operator's signed requests | ✅ Yes | This is its purpose |
| Forward Biconomy's signed requests | ✅ Yes | For Biconomy's operations |
| Reject malformed requests | ✅ Yes | Basic validation |
| Log requests for audit | ✅ Yes | Transparency |

### What the Backend CANNOT Do

| Action | Backend Can Do? | Why Not |
|--------|----------------|---------|
| Forge Operator's signature | ❌ No | Should not retain Operator's private key after onboarding |
| Trade on Operator's behalf without Operator signing | ❌ No | Privy requires valid auth key signature |
| Withdraw to non-whitelisted address | ❌ No | Privy policy enforcement |
| Change the policy | ❌ No | Requires 2-of-2 owner quorum |

**Note**: Biconomy generates and provides the Operator's signer key during onboarding. Biconomy should delete the key after providing it to ensure Operator has sole control.

### Trust Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           TRUST MODEL                                   │
│                                                                          │
│  Operator trusts:                                                       │
│  • Privy's TEE for key security and policy enforcement                 │
│  • Vault Backend for availability (can't trade if backend is down)  │
│  • Biconomy NOT to log/leak Operator's trading activity                │
│  • Biconomy to delete Operator's signer key after onboarding           │
│                                                                          │
│  Operator does NOT need to trust:                                       │
│  • Biconomy to enforce policy (Privy does this)                        │
│  • Biconomy to not forge signatures (if key is deleted after onboard)  │
│                                                                          │
│  Biconomy trusts:                                                       │
│  • Privy's TEE for key security and policy enforcement                 │
│  • Operator to use their auth key responsibly                          │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Comparison: Thin Proxy vs Stateful Backend

| Aspect | Thin Proxy (Our Approach) | Stateful Backend |
|--------|------------------|--------------|
| Business logic | ❌ None (in Privy) | ✅ In backend |
| Database | ❌ None | ✅ Required |
| Policy enforcement | Privy | Backend |
| State management | ❌ None | ✅ Required |
| Complexity | Low | High |
| Trust required | Low (just availability) | High (logic correctness) |

The thin proxy approach keeps all business logic in Privy policies, reducing complexity and trust requirements.

---

## Appendix: Privy's Owner vs Signer Model

### Key Insight: Policies Only Restrict Wallet Actions

| Action | Controlled By |
|--------|---------------|
| Sign messages (`eth_signTypedData_v4`) | Policy rules |
| Send transactions (`eth_sendTransaction`) | Policy rules |
| **Update policies** | Owner/Signer ROLE (not policy) |
| **Update signers** | Owner/Signer ROLE (not policy) |
| **Export wallet** | Owner/Signer ROLE (not policy) |

**Source**: [Privy Permissions Docs](https://docs.privy.io/transaction-management/models/permissions)

> "Signers cannot update a wallet's owner, signers, or policies and cannot export the wallet's private key. They can only take actions (signatures and transactions) with the wallet subject to their policies."

### Why Signers, Not Owners

If Operator were an **owner** (even in a 1-of-2 quorum):
- They could update policies to allow any withdrawal destination
- R3 (no full control) would NOT be satisfied

By making both parties **signers**:
- Neither can change policies
- Policy updates require 2-of-2 cold owner quorum
- R3 IS satisfied

---

## Appendix: Hyperliquid Action Types

| Action | primaryType | Allowed? |
|--------|-------------|----------|
| Place Order | `HyperliquidTransaction:Order` | ✅ Yes |
| Cancel Order | `HyperliquidTransaction:Cancel` | ✅ Yes |
| Update Leverage | `HyperliquidTransaction:UpdateLeverage` | ✅ Yes |
| Withdraw | `HyperliquidTransaction:Withdraw` | ✅ Whitelist only |
| Transfer | `HyperliquidTransaction:Transfer` | ❌ Denied |
| Approve Agent | `HyperliquidTransaction:ApproveAgent` | ❌ Denied |

