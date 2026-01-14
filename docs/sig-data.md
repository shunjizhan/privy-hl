withdraw payload
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