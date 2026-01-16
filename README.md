# Smart Vault Backend

A **proof-of-concept** demonstrating how to use [Privy Server Wallets](https://docs.privy.io/) to control [Hyperliquid](https://hyperliquid.xyz/) trading accounts under policy constraints.

## What This Demonstrates

This POC shows how to implement **policy-controlled trading** where:

1. **Trading is allowed** - Operators can place orders, cancel orders, adjust leverage
2. **Withdrawals are restricted** - Funds can only go to pre-approved addresses
3. **Signers are policy-constrained** - Signer keys can only perform allowed operations

```
                    ┌─────────────────────────────────────────┐
                    │           Privy Server Wallet           │
                    │  (Holds funds, enforces policy rules)   │
                    └─────────────────────────────────────────┘
                           ▲           ▲           ▲
                           │           │           │
                    ┌──────┴───┐ ┌─────┴────┐ ┌────┴─────┐
                    │  Admin   │ │ Operator │ │ Backend  │
                    │ (Owner)  │ │(Customer)│ │   (Us)   │
                    └──────────┘ └──────────┘ └──────────┘
```

| Party | Role | Permissions |
|-------|------|-------------|
| **Admin (Owner)** | Full wallet control | Modify policies, add/remove signers |
| **Operator (Customer)** | Trading entity | Trade + withdraw to whitelist only |
| **Backend (Us)** | Service provider | Same as Operator (policy-constrained) |

## Design Decisions

### Policy-First Permission Control

Permissions are enforced by **Privy policies in TEE**, not by custom backend logic. This means:

- The backend is a thin RPC proxy - it forwards signed requests without interpreting them
- Policy rules are defined declaratively and enforced cryptographically
- No need to maintain permission logic in application code
- Eliminates an entire class of authorization bugs

### SDK-Compatible Signer Experience

Signers (both Operator and Backend) can use the **existing Hyperliquid SDK** directly. The only change is a small account wrapper that:

1. Signs requests using P-256 keys (required by Privy)
2. Forwards the signature through the backend to Privy for final signing
3. Returns the wallet signature to the SDK

This means:
- **No new endpoints to learn** - signers don't call `/trade` or `/withdraw` endpoints
- **No SDK lock-in** - any tool that works with viem accounts works here
- **Minimal integration effort** - existing trading code needs only a wallet swap

### Why Not Custom Endpoints?

We deliberately avoided building action-specific endpoints like `/v1/vault/trade` or `/v1/vault/withdraw`:

| Custom Endpoints | Generic RPC Proxy |
|-----------------|-------------------|
| Must update backend for each new action | Backend unchanged as Hyperliquid evolves |
| Signers must learn our API | Signers use familiar Hyperliquid SDK |
| Permission logic lives in our code | Permission logic lives in Privy policies |
| More code = more bugs | Thin proxy = less surface area |

The backend's only job is to authenticate requests and forward them to Privy. All the "smart" logic lives in the policy rules.

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) runtime
- Privy account with Server Wallets enabled

### Installation

```bash
git clone https://github.com/example/smart-vault-be.git
cd smart-vault-be
bun install
cp .env.example .env
```

### Configuration

Edit `.env`:

```bash
PORT=3000
PRIVY_APP_ID=your-privy-app-id
PRIVY_APP_SECRET=your-privy-app-secret
BACKEND_URL=http://localhost:3000
WHITELISTED_ADDRESS=0x...  # Required: withdrawal destination (auto-lowercased)
```

### Running

```bash
# Terminal 1: Start the backend server
bun run start

# Terminal 2: Run the CLI
bun run flow          # Operator mode
bun run flow:admin    # Admin mode
```

## Commands

### NPM Scripts

| Command | Description |
|---------|-------------|
| `bun run start` | Start the backend server |
| `bun run dev` | Start with hot reload |
| `bun run flow` | CLI in operator mode |
| `bun run flow:admin` | CLI in admin mode |
| `bun run typecheck` | TypeScript type checking |

### CLI Actions

**Operator Mode:**
| Action | Description |
|--------|-------------|
| `create` | Create a new vault |
| `trade` | Place a $10 BTC long |
| `close` | Close all positions |
| `withdraw` | Withdraw to whitelisted address |
| `status` | Show account status |
| `deny` | Test policy enforcement |

**Admin Mode:**
| Action | Description |
|--------|-------------|
| `deposit` | Deposit USDC from Arbitrum |
| `trade` | Place a trade |
| `close` | Close all positions |
| `send-all` | Send all USDC |
| `status` | Show account status |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Service info |
| `/v1/vault/health` | GET | Health check |
| `/v1/vault/create` | POST | Create new vault |
| `/v1/vault/{walletId}/rpc` | POST | Execute wallet RPC |

## Technical Details

### EIP-712 Typed Data Matching

Privy policies match on EIP-712 typed data. **Important**: The `EIP712Domain` type must be included in the policy schema:

```typescript
const WITHDRAW_TYPED_DATA = {
  types: {
    EIP712Domain: [  // Required!
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
```

### Address Case Sensitivity

Hyperliquid sends addresses in **lowercase**. Whitelist addresses must also be lowercase for the `in` operator to match.

### Hyperliquid Action Types

| Action Type | Signed With | Policy Control |
|------------|-------------|----------------|
| Orders, Cancels, Leverage | `Agent` typed data | Allow all L1 actions |
| Withdrawals | `HyperliquidTransaction:Withdraw` | Whitelist destination |
| Transfers | `HyperliquidTransaction:*` | Deny by default |

## Security Model

### What the Backend CAN Do

- Forward Operator's signed requests
- Forward its own signed requests
- Log requests for audit

### What the Backend CANNOT Do

| Action | Why Not |
|--------|---------|
| Forge Operator signatures | Doesn't have Operator's P-256 key |
| Bypass policy rules | Privy enforces in TEE |
| Withdraw to arbitrary addresses | Policy whitelist enforcement |
| Change policies | Requires Admin owner key |

## Gotchas

1. **EIP712Domain is always required** in policy typed_data schemas
2. **Addresses must be lowercase** in whitelists
3. **`personal_sign` doesn't work** with Privy policies - use `eth_signTypedData_v4`
4. **Privy defaults to DENY** - you only need ALLOW rules

## Resources

- [Privy Documentation](https://docs.privy.io/)
- [Hyperliquid Documentation](https://hyperliquid.gitbook.io/)
- [Architecture Design](./docs/architecture-design.md)
