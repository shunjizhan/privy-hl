/**
 * Privy + Hyperliquid PoC
 *
 * This script demonstrates:
 * 1. Creating/retrieving a Privy server wallet
 * 2. Registering it as an agent on Hyperliquid
 * 3. Placing a BTC long trade using the agent
 *
 * Based on: https://docs.privy.io/recipes/hyperliquid-guide
 *
 * Usage:
 *   bun run index.ts
 */

import { getOrCreateWallet, type PrivyWallet } from './src/privy';
import {
  getMasterAddress,
  getMidPrices,
  registerAgent,
  createTradingClient,
  ASSETS,
} from './src/hyperliquid';

// ============================================================
// Configuration
// ============================================================

const TRADE_SIZE_USD = 100;
const ASSET = ASSETS.BTC;

// ============================================================
// Flow Functions
// ============================================================

const initialize = () => {
  console.log('='.repeat(60));
  console.log('  Privy + Hyperliquid PoC');
  console.log('='.repeat(60));

  const masterAddress = getMasterAddress();
  console.log(`\n📋 Master Account: ${masterAddress}`);

  return { masterAddress };
};

const setupPrivyWallet = async (): Promise<PrivyWallet> => {
  console.log('\n🔐 Setting up Privy server wallet...');

  const wallet = await getOrCreateWallet();
  console.log(`   Privy Wallet Address: ${wallet.address}`);
  console.log(`   Privy Wallet ID: ${wallet.id}`);

  return wallet;
};

const setupAgent = async (agentAddress: `0x${string}`) => {
  console.log('\n📝 Registering Privy wallet as agent...');

  // Agent name max 17 chars
  const shortId = Date.now().toString().slice(-6);
  const agentName = `privy_${shortId}`;

  const result = await registerAgent(agentAddress, agentName);

  if (result.status === 'ok') {
    console.log('   ✅ Agent registered successfully');
  } else {
    console.log('   ⚠️ Agent may already be registered');
  }

  return result;
};

const executeTrade = async (wallet: PrivyWallet) => {
  // Fetch market data
  console.log('\n💰 Fetching market data...');
  const mids = await getMidPrices();
  const btcPrice = parseFloat(mids['BTC'] || '0');
  console.log(`   BTC Mid Price: $${btcPrice.toLocaleString()}`);

  // Create trading client
  console.log('\n🚀 Creating trading client with Privy agent...');
  const tradingClient = createTradingClient(wallet);

  // Place order
  console.log('\n📈 Placing BTC LONG order...');
  console.log(`   Target Position: $${TRADE_SIZE_USD} USD`);

  const result = await tradingClient.placeMarketOrder({
    asset: ASSET,
    isBuy: true,
    sizeUsd: TRADE_SIZE_USD,
  });

  return result;
};

const handleTradeResult = (result: { status: string; response: unknown }) => {
  console.log('\n✅ Order Result:');
  console.log(JSON.stringify(result, null, 2));

  if (result.status === 'ok') {
    console.log('\n🎉 Trade executed successfully!');

    const response = result.response as {
      type: string;
      data?: { statuses?: Array<{ filled?: { totalSz: string; avgPx: string } }> };
    };

    if (response.type === 'order' && response.data?.statuses?.[0]?.filled) {
      const fill = response.data.statuses[0].filled;
      console.log(`   Filled Size: ${fill.totalSz} BTC`);
      console.log(`   Average Price: $${parseFloat(fill.avgPx).toFixed(2)}`);
    }
  } else {
    console.log('\n⚠️ Order may have failed. Check the response above.');
  }
};

// ============================================================
// Main
// ============================================================

const main = async () => {
  // 1. Initialize
  initialize();

  // 2. Setup Privy wallet
  const wallet = await setupPrivyWallet();

  // 3. Register as agent (idempotent)
  try {
    await setupAgent(wallet.address as `0x${string}`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('already')) {
      console.log('   ℹ️ Agent already registered, continuing...');
    } else {
      console.error('   ⚠️ Agent registration error:', msg);
    }
  }

  // 4. Execute trade
  try {
    const result = await executeTrade(wallet);
    handleTradeResult(result);
  } catch (error) {
    console.error('\n❌ Order failed:', error);
    console.log('\n💡 Possible reasons:');
    console.log('   - Insufficient balance in master account');
    console.log('   - Agent not properly registered');
    console.log('   - Minimum order size not met');
  }

  console.log('\n' + '='.repeat(60));
  console.log('  PoC Complete');
  console.log('='.repeat(60));
};

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
