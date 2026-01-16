# Smart Vault Architecture Design

## Requirements Summary

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| R1 | Both parties (Operator & Biconomy) have **same permissions** | Must | ✅ Achievable |
| R2 | Each party can act **independently** (no 2-of-2 quorum for operations) | Must | ⚠️ Partial |
| R3 | **No full control** - ideally no one has unrestricted vault access | Should | ✅ Achievable |
| R4 | Permissions: **trading allowed**, **withdrawals to whitelist only** | Must | ✅ Achievable |
| R5 | **Pure Privy** solution (no custom backend) | Should | ❌ Not Possible |
| R6 | **Hyperliquid SDK** compatible (viem wallet) | Must | ✅ Achievable |

---

## Critical Constraint: appSecret Cannot Be Shared

**Decision**: The Privy `appSecret` cannot be shared with Operator.

**Implication**: Operator cannot call Privy API directly. All Operator requests must go through Biconomy's backend.

---

## Operator Signing Flow

```
Operator          Gateway           Privy
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

## Why a Backend is Required

### Privy's Two-Layer Authentication Model

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PRIVY API REQUEST ANATOMY                        │
│                                                                      │
│  Layer 1: App Authentication (REQUIRED for every API call)          │
│  ─────────────────────────────────────────────────────────          │
│  curl -u "appId:appSecret" https://api.privy.io/...                 │
│                                                                      │
│  • Authenticates which Privy app is making the request              │
│  • appSecret is a credential that MUST stay on backend              │
│  • Without this, Privy rejects the request entirely                 │
│                                                                      │
│  Layer 2: Action Authorization (For wallet operations)              │
│  ─────────────────────────────────────────────────────              │
│  authorization_context: { authorization_private_keys: [KEY] }       │
│                                                                      │
│  • Determines which signer is authorizing the wallet action         │
│  • Policy evaluation happens at this layer                          │
│  • Each party has their own authorization key                       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Source**: [Privy API Authentication](https://docs.privy.io/authentication/overview)

> "App Secret: A secret key used to authenticate API requests. **Do not expose it outside of your backend server.**"

### The Problem

```
Without appSecret sharing:

Operator Server                          Privy API
     │                                       │
     │  ──── Request (no appSecret) ────►    │
     │                                       │
     │  ◄──── 401 Unauthorized ────────      │
     │                                       │

Operator has authorization key, but cannot authenticate to Privy API.
```

### The Solution: Biconomy Gateway

```
Operator Server          Biconomy Gateway           Privy API
     │                         │                        │
     │  ─── Signed Request ──► │                        │
     │      (auth key sig)     │                        │
     │                         │  ─── Request ────────► │
     │                         │      (+ appSecret)     │
     │                         │      (+ auth key sig)  │
     │                         │                        │
     │                         │  ◄─── Response ─────── │
     │  ◄─── Response ──────── │                        │
     │                         │                        │
```

---

## Architecture: Biconomy Gateway

### Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         BICONOMY GATEWAY ARCHITECTURE                   │
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
│             │  3. Send to Biconomy Gateway                              │
│             ▼                                                            │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                     BICONOMY GATEWAY                             │    │
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
│  │  Signers (both with VAULT_OPS policy):                           │   │
│  │  ┌─────────────────────────┐  ┌─────────────────────────────┐    │   │
│  │  │   Signer: Operator      │  │   Signer: Biconomy          │    │   │
│  │  │   ✓ Trade               │  │   ✓ Trade                   │    │   │
│  │  │   ✓ Withdraw (whitelist)│  │   ✓ Withdraw (whitelist)    │    │   │
│  │  └─────────────────────────┘  └─────────────────────────────┘    │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Gateway API Design

The gateway should be as thin as possible - a "dumb pipe" that adds authentication.

#### Endpoint: Execute Wallet RPC

```
POST /v1/vault/{walletId}/rpc

Headers:
  Content-Type: application/json
  X-Privy-App-Id: <privy-app-id>
  X-Privy-Authorization-Signature: <base64-encoded-p256-signature>

Body:
{
  "method": "eth_signTypedData_v4",
  "params": {
    "typed_data": { ... }
  }
}
```

#### Gateway Implementation (Pseudocode)

```typescript
// Biconomy Gateway - Stateless proxy
// Environment variables (secrets)
const PRIVY_APP_ID = process.env.PRIVY_APP_ID!;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET!;

async function handleVaultRpc(req: Request): Promise<Response> {
  const { walletId } = req.params;
  const privyAppId = req.headers['x-privy-app-id'];
  const authorizationSignature = req.headers['x-privy-authorization-signature'];
  const payload = req.body;

  // 1. Basic validation (format only, not business logic)
  if (!walletId || !authorizationSignature || !payload.method) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // 2. Validate app ID matches (prevent cross-app requests)
  if (privyAppId !== PRIVY_APP_ID) {
    return Response.json({ error: 'Invalid app ID' }, { status: 403 });
  }

  // 3. Forward to Privy with appSecret + operator's signature
  const privyResponse = await fetch(`https://api.privy.io/v1/wallets/${walletId}/rpc`, {
    method: 'POST',
    headers: {
      // Layer 1: App authentication (gateway adds this)
      'Authorization': `Basic ${Buffer.from(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`).toString('base64')}`,
      // Layer 2: Action authorization (operator's signature, passed through)
      'privy-app-id': PRIVY_APP_ID,
      'privy-authorization-signature': authorizationSignature,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  // 4. Return Privy's response directly (including errors)
  const responseData = await privyResponse.json();
  return Response.json(responseData, { status: privyResponse.status });
}
```

**Key Properties:**
- **Stateless** - no database, no session, no business logic
- **Transparent** - just adds appSecret and forwards
- **Policy enforcement in Privy** - gateway doesn't evaluate whitelist
- **Operator signs their own requests** - gateway cannot forge Operator signatures
- **No request modification** - gateway passes payload and auth signature as-is

---

### How Operator Uses Hyperliquid SDK (Key Design)

The critical challenge: Hyperliquid SDK expects a viem-compatible account, but Operator can't use Privy's `createViemAccount` because it requires `appSecret`.

**Solution**: Create a custom viem-compatible account that routes through the gateway transparently.

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
│  │    4. POST to Biconomy Gateway                                      │   │
│  │    5. Return signature from response                                │   │
│  │  }                                                                   │   │
│  └──────────────────────────────┬──────────────────────────────────────┘   │
│                                 │                                           │
│                                 ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  BICONOMY GATEWAY                                                    │   │
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
│  │  1. Validate appSecret ✓ (from gateway's Basic Auth header)         │   │
│  │  2. Validate authorization signature ✓ (Operator's P-256 sig)       │   │
│  │  3. Verify signer has permission on wallet ✓                        │   │
│  │  4. Evaluate policy ✓ (whitelist check for withdrawals)             │   │
│  │  5. Execute signing in TEE                                          │   │
│  │  6. Return wallet signature                                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Insight**: The Hyperliquid SDK doesn't care HOW `signTypedData` is implemented. It just calls the method and expects a signature back. By creating a custom viem account that routes through the gateway, the SDK works transparently.

---

### Operator SDK: Detailed Implementation

Biconomy provides `@biconomy/vault-sdk` for Operators:

```typescript
// @biconomy/vault-sdk

import { formatRequestForAuthorizationSignature } from '@privy-io/server-auth/wallet-api';
import { signP256 } from './crypto';  // P-256 signing utility
import type { Account, Hex, TypedData } from 'viem';

// Configuration provided to Operator during vault onboarding (all generated by Biconomy)
interface VaultAccountConfig {
  gatewayUrl: string;           // e.g., 'https://vault-gateway.biconomy.io'
  privyAppId: string;           // Biconomy's Privy app ID (public, safe to share)
  walletId: string;             // Vault wallet ID
  walletAddress: `0x${string}`; // Vault wallet address
  authPrivateKey: string;       // P-256 private key generated by Biconomy (DER format, base64)
}

/**
 * Creates a viem-compatible account that routes through Biconomy Gateway.
 * This account can be used directly with Hyperliquid SDK.
 */
export function createVaultAccount(config: VaultAccountConfig): Account {
  const { gatewayUrl, privyAppId, walletId, walletAddress, authPrivateKey } = config;

  return {
    address: walletAddress,
    type: 'local',

    /**
     * Sign EIP-712 typed data (used by Hyperliquid for all actions)
     */
    async signTypedData(typedData: TypedData): Promise<Hex> {
      // 1. Construct the Privy API request
      const privyRequestBody = {
        method: 'eth_signTypedData_v4',
        params: { typed_data: typedData }
      };

      const privyRequest = {
        version: 1 as const,
        method: 'POST' as const,
        url: `https://api.privy.io/v1/wallets/${walletId}/rpc`,
        headers: {
          'privy-app-id': privyAppId
        },
        body: privyRequestBody
      };

      // 2. Format the request for authorization signature
      // This utility is from @privy-io/server-auth - does NOT require appSecret!
      const serializedPayload = formatRequestForAuthorizationSignature({
        input: privyRequest
      });

      // 3. Sign with Operator's P-256 signer key (provided by Biconomy during onboarding)
      const authorizationSignature = await signP256(authPrivateKey, serializedPayload);

      // 4. Send to Biconomy Gateway (NOT directly to Privy)
      const response = await fetch(`${gatewayUrl}/v1/vault/${walletId}/rpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Privy-App-Id': privyAppId,
          'X-Privy-Authorization-Signature': authorizationSignature
        },
        body: JSON.stringify(privyRequestBody)
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(`Vault operation failed: ${error.message || response.status}`);
      }

      const result = await response.json();
      return result.data.signature as Hex;
    },

    /**
     * Sign a personal message (personal_sign)
     */
    async signMessage({ message }: { message: string }): Promise<Hex> {
      const privyRequestBody = {
        method: 'personal_sign',
        params: {
          message,
          encoding: 'utf-8'
        }
      };

      const privyRequest = {
        version: 1 as const,
        method: 'POST' as const,
        url: `https://api.privy.io/v1/wallets/${walletId}/rpc`,
        headers: { 'privy-app-id': privyAppId },
        body: privyRequestBody
      };

      const serializedPayload = formatRequestForAuthorizationSignature({
        input: privyRequest
      });
      const authorizationSignature = await signP256(authPrivateKey, serializedPayload);

      const response = await fetch(`${gatewayUrl}/v1/vault/${walletId}/rpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Privy-App-Id': privyAppId,
          'X-Privy-Authorization-Signature': authorizationSignature
        },
        body: JSON.stringify(privyRequestBody)
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(`Sign message failed: ${error.message || response.status}`);
      }

      const result = await response.json();
      return result.data.signature as Hex;
    },

    // signTransaction not typically needed for Hyperliquid (uses signTypedData)
    async signTransaction(): Promise<Hex> {
      throw new Error('signTransaction not supported - use signTypedData for Hyperliquid');
    }
  };
}
```

---

### Operator Usage: Complete Example

```typescript
// operator-trading-bot.ts

import { createVaultAccount } from '@biconomy/vault-sdk';
import * as hl from 'hyperliquid';

// Configuration provided by Biconomy during vault setup (one-time onboarding)
const VAULT_CONFIG = {
  gatewayUrl: 'https://vault-gateway.biconomy.io',
  privyAppId: 'clxxxxxx',  // Biconomy's Privy app ID (public)
  walletId: 'wallet-abc123',
  walletAddress: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
  authPrivateKey: process.env.OPERATOR_P256_AUTH_KEY!  // Generated by Biconomy, provided to Operator
};

async function main() {
  // 1. Create vault account (routes through gateway)
  const vaultAccount = createVaultAccount(VAULT_CONFIG);

  // 2. Use with Hyperliquid SDK - works exactly like a normal wallet!
  const client = new hl.ExchangeClient({
    wallet: vaultAccount  // viem-compatible account
  });

  // 3. Place orders - SDK calls vaultAccount.signTypedData() internally
  const orderResult = await client.order({
    orders: [{
      asset: 'ETH',
      isBuy: true,
      sz: '0.1',
      limitPx: '2000',
      orderType: { limit: { tif: 'Gtc' } }
    }],
    grouping: 'na'
  });
  console.log('Order placed:', orderResult);

  // 4. Cancel orders
  await client.cancel({
    cancels: [{ asset: 'ETH', oid: orderResult.orders[0].oid }]
  });

  // 5. Withdraw to whitelisted address - policy enforced by Privy
  await client.withdraw3({
    destination: '0xWhitelistedColdWallet...',  // Must be in policy whitelist
    amount: '100'
  });
  // Withdraw to non-whitelisted address would fail at Privy policy check

  // 6. Get account info (read-only, no signature needed)
  const info = await client.userState({ user: vaultAccount.address });
  console.log('Account state:', info);
}

main().catch(console.error);
```

---

### P-256 Signing Utility

The Operator SDK needs a P-256 signing function. Example implementation:

```typescript
// @biconomy/vault-sdk/crypto.ts

import { createSign } from 'crypto';

/**
 * Sign a payload with a P-256 (secp256r1) private key.
 * Returns base64-encoded DER signature.
 */
export async function signP256(privateKeyBase64: string, payload: string): Promise<string> {
  // Convert base64 DER to PEM format
  const privateKeyPem = `-----BEGIN EC PRIVATE KEY-----\n${privateKeyBase64}\n-----END EC PRIVATE KEY-----`;

  const sign = createSign('SHA256');
  sign.update(payload);
  sign.end();

  const signature = sign.sign(privateKeyPem);
  return signature.toString('base64');
}

/**
 * Alternative: Using WebCrypto API (browser-compatible)
 */
export async function signP256WebCrypto(
  privateKeyBase64: string,
  payload: string
): Promise<string> {
  // Import the private key
  const privateKeyDer = Uint8Array.from(atob(privateKeyBase64), c => c.charCodeAt(0));
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyDer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  // Sign the payload
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    data
  );

  // Convert to base64
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}
```

---

### What Biconomy Provides to Operator

During vault onboarding, Biconomy generates all credentials and provides them to the Operator (one-time):

| Item | Value | Security |
|------|-------|----------|
| `gatewayUrl` | `https://vault-gateway.biconomy.io` | Public |
| `privyAppId` | `clxxxxxx` | Public (safe to share) |
| `walletId` | `wallet-abc123` | Public |
| `walletAddress` | `0x1234...` | Public |
| `authPrivateKey` | P-256 private key (base64) | **SECRET - Operator must keep secure** |

### Signer Key Generation Flow

1. Biconomy generates P-256 key pair for Operator
2. Biconomy registers the public key as a signer on the vault
3. Biconomy provides the private key to Operator (one-time, during onboarding)
4. Operator stores the private key securely and uses it for signing

**Note**: Privy signers use **P-256** keys, not Ethereum EOA keys (secp256k1). Operators cannot use their existing EOA wallet as a signer.

**Security consideration**: Since Biconomy generates the key, Biconomy has seen the private key at generation time. However, Biconomy should not retain the private key after providing it to the Operator.

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

### Policy Definition (Same as Before)

```typescript
{
  version: '1.0',
  name: 'Vault Operations - Trading + Whitelisted Withdrawals',
  chain_type: 'ethereum',
  rules: [
    {
      name: 'Allow Hyperliquid Trading Actions',
      method: 'eth_signTypedData_v4',
      conditions: [
        {
          field_source: 'ethereum_typed_data_domain',
          field: 'name',
          operator: 'eq',
          value: 'Exchange'
        }
      ],
      action: 'ALLOW'
    },
    {
      name: 'Allow Withdrawals to Whitelist Only',
      method: 'eth_signTypedData_v4',
      conditions: [
        {
          field_source: 'ethereum_typed_data_domain',
          field: 'name',
          operator: 'eq',
          value: 'HyperliquidSignTransaction'
        },
        {
          field_source: 'ethereum_typed_data_message',
          typed_data: {
            types: {
              'HyperliquidTransaction:Withdraw': [
                { name: 'hyperliquidChain', type: 'string' },
                { name: 'destination', type: 'string' },
                { name: 'amount', type: 'string' },
                { name: 'time', type: 'uint64' }
              ]
            },
            primary_type: 'HyperliquidTransaction:Withdraw'
          },
          field: 'destination',
          operator: 'in',
          value: ['0xWhitelistedAddr1...', '0xWhitelistedAddr2...']
        }
      ],
      action: 'ALLOW'
    }
  ]
}
```

**Important limitation:** All Hyperliquid L1 actions (the "Exchange" request types like order/cancel/modify as well as sub-account and vault operations) are signed using the same EIP-712 `Agent` typed data (`domain.name = "Exchange"`). The actual action is only embedded in the `connectionId` hash, so policies cannot distinguish which L1 action is being requested. In practice, allowing the `Agent` typed data allows *all* L1 actions.

**Clarification:** Allowing L1 actions does *not* allow transfers to arbitrary external wallets. Cross-user transfers (e.g., `usdSend`, `spotSend`, `sendAsset`) are **user-signed** actions with `HyperliquidTransaction:*` typed data and are not permitted unless explicitly allowed. L1 actions can still move funds between internal entities (main account ↔ sub-account, wallet ↔ vault).

---

## Security Analysis

### What the Gateway CAN Do

| Action | Gateway Can Do? | Notes |
|--------|----------------|-------|
| Forward Operator's signed requests | ✅ Yes | This is its purpose |
| Forward Biconomy's signed requests | ✅ Yes | For Biconomy's operations |
| Reject malformed requests | ✅ Yes | Basic validation |
| Log requests for audit | ✅ Yes | Transparency |

### What the Gateway CANNOT Do

| Action | Gateway Can Do? | Why Not |
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
│  • Biconomy Gateway for availability (can't trade if gateway is down)  │
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

## Requirements Satisfaction

| Req | Status | Notes |
|-----|--------|-------|
| R1 | ✅ **Satisfied** | Both parties have identical VAULT_OPS policy |
| R2 | ⚠️ **Partial** | Operator routes through gateway, but signs independently with own key |
| R3 | ✅ **Satisfied** | Owner is 2-of-2 cold quorum, neither signer has full control |
| R4 | ✅ **Satisfied** | Policy allows trading + whitelisted withdrawals only |
| R5 | ❌ **Not Satisfied** | Gateway required (but it's stateless/thin) |
| R6 | ✅ **Satisfied** | Custom viem account enables transparent Hyperliquid SDK usage |

### R2 Nuance: "Independent Operation"

The requirement states each party should act independently. With the gateway:

| Aspect | Independent? | Notes |
|--------|-------------|-------|
| Signing authority | ✅ Yes | Each has own auth key, cannot forge other's sig |
| Policy permissions | ✅ Yes | Same policy, no approval needed from other party |
| API access | ❌ No | Operator goes through Biconomy gateway |
| Availability | ❌ No | If gateway down, Operator cannot trade |

**Mitigation**: Gateway should be highly available (multi-region, redundant).

### R6 Nuance: "Hyperliquid SDK Compatible"

The Hyperliquid SDK requires a viem-compatible account with `signTypedData` method.

| Aspect | Compatible? | Notes |
|--------|-------------|-------|
| Biconomy usage | ✅ Full | Uses Privy's `createViemAccount` directly |
| Operator usage | ✅ Full | Uses custom `createVaultAccount` from `@biconomy/vault-sdk` |
| SDK transparency | ✅ Yes | Hyperliquid SDK unaware of gateway routing |
| Code changes | ✅ Minimal | Only account creation differs, SDK usage identical |

**Key Insight**: The custom viem account implements the same interface as Privy's `createViemAccount`. From Hyperliquid SDK's perspective, both are identical - it just calls `signTypedData()` and gets a signature back.

---

## Comparison: Gateway vs Full Backend

| Aspect | Stateless Gateway | Full Backend |
|--------|------------------|--------------|
| Business logic | ❌ None (in Privy) | ✅ In backend |
| Database | ❌ None | ✅ Required |
| Policy enforcement | Privy | Backend |
| State management | ❌ None | ✅ Required |
| Complexity | Low | High |
| Trust required | Low (just availability) | High (logic correctness) |

The gateway approach minimizes the violation of R5 by keeping all business logic in Privy.

---

## Implementation Phases

### Phase 1: Core Gateway
1. Deploy stateless gateway with `/rpc` endpoint
2. Implement Operator SDK wrapper
3. Test with Hyperliquid SDK

### Phase 2: Operational
1. Multi-region deployment for availability
2. Monitoring and alerting
3. Rate limiting (optional, for abuse prevention)

### Phase 3: Transparency
1. Audit logging
2. Open-source gateway code (optional, for Operator trust)
3. SLA guarantees

---

## Open Questions

1. **Gateway SLA**: What availability guarantees does Biconomy provide?
2. **Audit Logs**: Should Operator have access to gateway logs for their requests?
3. **Rate Limiting**: Should the gateway enforce rate limits?
4. **Multiple Vaults**: One gateway for all vaults, or per-vault deployment?
5. **Privy Contact**: Worth asking Privy if they have/plan cross-app wallet access for this use case?

---

## Alternative: Ask Privy for Cross-App Solution

This architecture is constrained by Privy's current model where `appSecret` is required for all API calls. It may be worth asking Privy:

1. **Do they have an enterprise feature for cross-app wallet access?**
2. **Would they consider building one?** (Third-party signer that can call API with their own credentials)
3. **Is there a roadmap for this use case?**

If Privy offers a native solution, it would eliminate the need for the gateway entirely.

---

## Appendix: Privy Authorization Signature Format

The authorization signature is critical for the SDK implementation. Here's how it works:

### Signature Payload Structure

```typescript
// The payload that gets signed with the P-256 key
const signaturePayload = {
  version: 1,                    // Always 1 (current version)
  method: 'POST',                // HTTP method
  url: 'https://api.privy.io/v1/wallets/{walletId}/rpc',  // Full URL
  headers: {
    'privy-app-id': 'clxxxxxx'   // Only Privy-specific headers
  },
  body: {
    method: 'eth_signTypedData_v4',
    params: { typed_data: { ... } }
  }
};
```

### Formatting the Payload

Privy provides a utility function that serializes the payload deterministically:

```typescript
import { formatRequestForAuthorizationSignature } from '@privy-io/server-auth/wallet-api';

const serializedPayload = formatRequestForAuthorizationSignature({
  input: signaturePayload
});
// Returns a string that should be signed with the P-256 key
```

**Important**: This utility is available in `@privy-io/server-auth` and does NOT require `appSecret` to use. Operators can use this package.

### Signing the Payload

```typescript
// Using Node.js crypto
import { createSign } from 'crypto';

function signWithP256(privateKeyDer: string, payload: string): string {
  const pem = `-----BEGIN EC PRIVATE KEY-----\n${privateKeyDer}\n-----END EC PRIVATE KEY-----`;
  const sign = createSign('SHA256');
  sign.update(payload);
  sign.end();
  return sign.sign(pem).toString('base64');
}
```

### Complete Flow

```
1. Operator constructs Privy request → { version, method, url, headers, body }
2. formatRequestForAuthorizationSignature() → serialized string
3. signP256(operatorPrivateKey, serialized) → base64 signature
4. Send to gateway with X-Privy-Authorization-Signature header
5. Gateway forwards to Privy with Authorization: Basic header added
6. Privy validates both app auth AND authorization signature
7. Privy evaluates policy and executes action
```

**Source**: [Privy Sign Requests Documentation](https://docs.privy.io/controls/authorization-keys/using-owners/sign/utility-functions)

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

---

## Appendix: Privy Documentation References

### API Authentication (Critical for Gateway Design)
- [REST API Setup - Authentication](https://docs.privy.io/basics/rest-api/setup) - **"All API endpoints require authentication using Basic Auth"**
- [API Reference Introduction](https://docs.privy.io/api-reference/introduction) - **"Requests missing either of these headers will be rejected"**
- [API Authentication Overview](https://docs.privy.io/authentication/overview) - Two-layer auth model explained

### Authorization Signatures
- [Sign Requests - Utility Functions](https://docs.privy.io/controls/authorization-keys/using-owners/sign/utility-functions) - How to construct and sign requests
- [Signing with Key Quorums](https://docs.privy.io/controls/key-quorum/sign) - REST API examples with both auth layers

### Wallet API
- [eth_signTypedData_v4 API Reference](https://docs.privy.io/api-reference/wallets/ethereum/eth-signtypeddata-v4)
- [personal_sign API Reference](https://docs.privy.io/api-reference/wallets/ethereum/personal-sign)

### Access Control
- [Owners & Signers Overview](https://docs.privy.io/controls/authorization-keys/owners/overview)
- [Permissions (Owner vs Signer)](https://docs.privy.io/transaction-management/models/permissions)
- [Authorization Keys](https://docs.privy.io/controls/authorization-keys/keys/create/key)
- [Key Quorums](https://docs.privy.io/controls/authorization-keys/keys/create/key-quorum)
- [Policies Overview](https://docs.privy.io/controls/policies/overview)
- [Giving Permissions to Third Parties](https://docs.privy.io/controls/authorization-keys/owners/configuration/programmable)
