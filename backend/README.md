# Vault Gateway

Stateless proxy server that enables Operators to use Privy API without having access to the appSecret.

## Setup

```bash
cd backend
bun install
```

## Environment Variables

Create a `.env` file:

```env
PORT=3000
PRIVY_APP_ID=your-privy-app-id
PRIVY_APP_SECRET=your-privy-app-secret
```

## Run

```bash
# Development (with hot reload)
bun dev

# Production
bun start
```

## API Endpoints

### POST /v1/vault/create

Creates a new vault with admin owner, operator signer, and Biconomy signer.

**Request Body:**
```json
{
  "withdrawWhitelist": ["0x36CD9238Fd87901661d74c6E7d817DEBbEd034d4"]
}
```

**Response:**
```json
{
  "success": true,
  "operatorConfig": {
    "gatewayUrl": "http://localhost:3000",
    "privyAppId": "clxxxxxx",
    "walletId": "wallet-abc123",
    "walletAddress": "0x1234...",
    "signerPrivateKey": "base64-encoded-p256-private-key",
    "signerPublicKey": "base64-encoded-p256-public-key",
    "keyQuorumId": "quorum-id",
    "policyId": "policy-id",
    "withdrawWhitelist": ["0x36CD9238Fd87901661d74c6E7d817DEBbEd034d4"]
  },
  "message": "Vault created successfully..."
}
```

### GET /v1/vault/list

List all vaults created by this gateway.

**Response:**
```json
{
  "vaults": [
    {
      "walletId": "wallet-abc123",
      "walletAddress": "0x1234...",
      "policyId": "policy-id",
      "withdrawWhitelist": ["0x36CD9238Fd87901661d74c6E7d817DEBbEd034d4"],
      "createdAt": "2025-01-15T00:00:00.000Z"
    }
  ]
}
```

### GET /v1/vault/{walletId}/biconomy-config

Get Biconomy's signer configuration for a vault.

### POST /v1/vault/{walletId}/rpc

Proxy endpoint for Privy wallet RPC operations.

**Headers:**
- `Content-Type: application/json`
- `X-Privy-App-Id: <privy-app-id>`
- `X-Privy-Authorization-Signature: <base64-p256-signature>`

**Body:**
```json
{
  "method": "eth_signTypedData_v4",
  "params": {
    "typed_data": { ... }
  }
}
```

### GET /v1/vault/health

Health check endpoint.

## Architecture

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
```

The gateway is intentionally simple - a "dumb pipe" that adds authentication.
All business logic (policy enforcement, whitelist validation) happens in Privy.

## Data Storage

The gateway stores signer configurations locally in the `data/` directory:
- `data/biconomy-signer-{walletId}.json` - Biconomy's signer credentials
- `data/admin-{walletId}.json` - Admin key for policy updates

**Important:** In production, these should be stored in a secure secrets manager.
