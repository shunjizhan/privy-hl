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

L1 action payload
```
{
  "typed_data": {
    "domain": {
      "name": "Exchange",
      "version": "1",
      "chainId": 1337,
      "verifyingContract": "0x0000000000000000000000000000000000000000"
    },
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
      "Agent": [
        {
          "name": "source",
          "type": "string"
        },
        {
          "name": "connectionId",
          "type": "bytes32"
        }
      ]
    },
    "message": {
      "source": "a",
      "connectionId": "0x1b5226e2d328a893808e7cfde4a4c651a5a86d20b9f45eaa8a5ff3c561dc3806"
    },
    "primary_type": "Agent"
  }
}
}
```