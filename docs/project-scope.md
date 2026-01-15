# Smart Vault
Smart vault is a product that an operator can trade on behave of users.

Essentially, there will be an hyperliquid account (trading account), that the funds will be deposited into, and there are two parties that can do operations on the vault:
- Operator, by either UI or programmatically
- Biconomy (us), only by programmatically

## Requirements
### permissions
Both of the parties can only control the vault under permissions, for example, only can place an order (sign an hash?), or withdraw to whitelisted addresses (restricted by 712 typed data, see example withdraw payload below). Any other actions should be denied.

Each of the party should be able to execute under permission at anytime, which means there shouldn't be 2-2 quorum or similar stuff.

Both party should/can have exactly the same permissions. Both should at least be able to withdraw to whitelisted addresses and trade.

Non of the party can have sudo permission (such as updating policy or remove the other party etc). They can only do things under their permissions.

If absolutely necessary, there could be a super admin for the vault. We could burn the permission for the super admin after the vault is created (can we?).

**Permissions should be ideally controlled by Privy policies, and not by our own backend.**

### wallet management
We will mainly use Privy to manage the wallets, and permissions should be set by Privy policies if possible. If not possible at all, we might need our own backend as another layer, but not preferred.

### interaction
When use programmatic way, it's preferred (not a must) that hyperliquid sdk can be used directly. i.e. we can construct a viem wallet via privy (or any other ways). Programmatic way is more important, so if we cannot satisfy both way for operator, programmatic way should be prioritized.

### privy app secret
we cannot share the app secret with the operator, or any one else.

## Flow
The operator should be able to login using privy to our frontend, and click "creat vault" button, to create the vault, which is basically an hyperliquid account for trading or depoisting to hyperliquid vault. Users will be able to deposit funds to the vault (not related to this system)

After the vault is created, the operator should be able to trade or withdraw to whitelisted addresses programmatically or via UI (optional). We (Biconomy) should also be able to trade or withdraw to whitelisted addresses programmatically.

## Key findings on privy
- Policies restrict wallet actions (the things the wallet signs/executes). They do NOT restrict Privy API administrative calls.
- So we cannot use 1-2 quorum for the owner, because the owner can update the policy itself. We need to use signers instead, who does not have admin privilege.

## Appendix: example withdraw payload
```
{
    "domain": {
        "name": "HyperliquidSignTransaction",
        "version": "1",
        "chainId": 42161,
        "verifyingContract": "0x0000000000000000000000000000000000000000"
    },
    "message": {
        "destination": "0x36cd9238fd87901661d74c6e7d817debbed034d4",
        "amount": "61.364996",
        "time": 1768384169086,
        "type": "withdraw3",
        "signatureChainId": "0xa4b1",
        "hyperliquidChain": "Mainnet"
    },
    "primaryType": "HyperliquidTransaction:Withdraw",
    "types": {
        "EIP712Domain": [
            {
                "name": "name",
                "type": "string"
            },
            {
                "name": "version",
                "type": "string"
            },
            {
                "name": "chainId",
                "type": "uint256"
            },
            {
                "name": "verifyingContract",
                "type": "address"
            }
        ],
        "HyperliquidTransaction:Withdraw": [
            {
                "name": "hyperliquidChain",
                "type": "string"
            },
            {
                "name": "destination",
                "type": "string"
            },
            {
                "name": "amount",
                "type": "string"
            },
            {
                "name": "time",
                "type": "uint64"
            }
        ]
    }
}
```
