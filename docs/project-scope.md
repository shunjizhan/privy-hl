# Vault Product v1 – Scope & Plan

We’re compiling v1 of the Vault product, and for the first release we’ll focus on two core strategies only:
1. Index LLP
USDC will be deposited into native market-making (MM) vaults across multiple perp DEXs.
Goal: diversified, passive exposure to perp DEX MM yields via a single vault.

2. Delta-Neutral Strategy
Provide multi-DEX execution capabilities for API traders.
Focused on neutral positioning with execution abstracted across venues.
Architecture

Base chain: Arbitrum
A single vault is deployed on Arbitrum, which then connects to accounts on multiple perp DEXs.
This architecture is similar to Morpho v2, where capital is centralized but execution is distributed.

## Key Requirements
For v1, we need to ensure:
- Vault security (fund safety, permissioning, risk isolation)
- Automation & interoperability (cross-DEX coordination, strategy automation)
-Reliable trade execution (latency, correctness, failure handling)
