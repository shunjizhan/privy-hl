/**
 * Privy + Hyperliquid PoC
 *
 * Architecture:
 * - EOA Wallet: User's own wallet, authenticated via SIWE (Sign-In With Ethereum)
 * - Trading Wallet: Privy server wallet that IS the Hyperliquid account
 *
 * Flow:
 * 1. User authenticates by signing a SIWE message with their EOA private key
 * 2. System creates/retrieves a trading wallet linked to that EOA
 * 3. User can place orders on Hyperliquid using the trading wallet
 * 4. User can withdraw from Hyperliquid or reap USDC on Arbitrum
 *
 * Usage:
 *   bun run index.ts
 */

import * as readline from 'readline';

import { authenticateEoa, type AuthSession } from './src/auth';
import {
  getOrCreateTradingWallet,
  getTradingWallet,
  type TradingWallet,
} from './src/privy';
import {
  getMidPrices,
  placeMarketOrder,
  withdraw,
  ASSETS,
} from './src/hyperliquid';
import { getUsdcBalance, reapUsdcOnArbitrum } from './src/arbitrum';

// ============================================================
// Configuration
// ============================================================

const TRADE_SIZE_USD = 100;
const ASSET = ASSETS.BTC;
const WITHDRAW_AMOUNT = '10';

// ============================================================
// Terminal Menu
// ============================================================

const prompt = (question: string): Promise<string> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
};

const showMenu = async (): Promise<'create' | 'buy' | 'withdraw' | 'reap' | 'exit'> => {
  console.log('\n📋 Select an action:');
  console.log('   1. Create/View Trading Wallet');
  console.log('   2. Place Order (Long $100 BTC)');
  console.log('   3. Withdraw USDC from Hyperliquid ($10 to EOA)');
  console.log('   4. Reap USDC (Transfer ALL USDC on Arbitrum to EOA)');
  console.log('   5. Exit');

  const choice = await prompt('\nEnter choice (1-5): ');

  switch (choice) {
    case '1':
      return 'create';
    case '2':
      return 'buy';
    case '3':
      return 'withdraw';
    case '4':
      return 'reap';
    case '5':
      return 'exit';
    default:
      console.log('Invalid choice, please try again.');
      return showMenu();
  }
};

// ============================================================
// Flow Functions
// ============================================================

const initialize = async (): Promise<AuthSession> => {
  console.log('='.repeat(60));
  console.log('  Privy + Hyperliquid PoC');
  console.log('='.repeat(60));

  console.log('\n🔐 Authenticating with EOA...');
  const session = await authenticateEoa();

  console.log(`   EOA Address: ${session.eoaAddress}`);
  console.log(`   Session expires: ${session.expiresAt.toISOString()}`);
  console.log('   (Authenticated via SIWE signature)');

  return session;
};

const createOrViewTradingWallet = async (
  eoaAddress: string
): Promise<TradingWallet> => {
  console.log('\n📝 Setting up trading wallet...');

  const wallet = await getOrCreateTradingWallet(eoaAddress);

  console.log('\n✅ Trading Wallet Details:');
  console.log(`   Address: ${wallet.address}`);
  console.log(`   Linked EOA: ${wallet.eoaAddress}`);
  console.log(`   Wallet ID: ${wallet.id}`);
  console.log('\n💡 Deposit USDC to this address on Hyperliquid to start trading');

  return wallet;
};

const executeTrade = async (tradingWallet: TradingWallet) => {
  // Fetch market data
  console.log('\n💰 Fetching market data...');
  const mids = await getMidPrices();
  const btcPrice = parseFloat(mids['BTC'] || '0');
  console.log(`   BTC Mid Price: $${btcPrice.toLocaleString()}`);

  // Place order
  console.log('\n📈 Placing BTC LONG order...');
  console.log(`   Target Position: $${TRADE_SIZE_USD} USD`);

  const result = await placeMarketOrder(tradingWallet, {
    asset: ASSET,
    isBuy: true,
    sizeUsd: TRADE_SIZE_USD,
  });

  return result;
};

const executeWithdraw = async (
  tradingWallet: TradingWallet,
  eoaAddress: string
) => {
  console.log('\n💸 Initiating withdrawal...');
  console.log(`   Withdrawing $${WITHDRAW_AMOUNT} USDC to EOA on Arbitrum`);

  const result = await withdraw(tradingWallet, {
    destination: eoaAddress as `0x${string}`,
    amount: WITHDRAW_AMOUNT,
  });

  return result;
};

const executeReap = async (
  tradingWallet: TradingWallet,
  eoaAddress: string
) => {
  console.log('\n🌾 Initiating reap (transfer all USDC on Arbitrum)...');

  // Show current balance first
  const balance = await getUsdcBalance(tradingWallet.address);
  console.log(`   Current USDC balance on Arbitrum: $${parseFloat(balance).toFixed(2)}`);

  const result = await reapUsdcOnArbitrum(tradingWallet, eoaAddress as `0x${string}`);

  return result;
};

const handleTradeResult = (result: { status: string; response: unknown }) => {
  console.log('\n✅ Order Result:');
  console.log(JSON.stringify(result, null, 2));

  if (result.status === 'ok') {
    console.log('\n🎉 Trade executed successfully!');

    const response = result.response as {
      type: string;
      data?: {
        statuses?: Array<{ filled?: { totalSz: string; avgPx: string } }>;
      };
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

const handleWithdrawResult = (result: { status: string; response?: unknown }) => {
  console.log('\n✅ Withdrawal Result:');
  console.log(JSON.stringify(result, null, 2));

  if (result.status === 'ok') {
    console.log('\n🎉 Withdrawal initiated successfully!');
    console.log('   Note: Withdrawals typically take a few minutes to process.');
  } else {
    console.log('\n⚠️ Withdrawal may have failed. Check the response above.');
  }
};

const handleReapResult = (result: { status: string; txHash: string; amount: string }) => {
  console.log('\n✅ Reap Result:');

  if (result.status === 'ok') {
    console.log('\n🎉 USDC transferred successfully!');
    console.log(`   Amount: $${parseFloat(result.amount).toFixed(2)} USDC`);
    console.log(`   Transaction: https://arbiscan.io/tx/${result.txHash}`);
  } else {
    console.log('\n⚠️ Transfer may have failed.');
  }
};

// ============================================================
// Main
// ============================================================

const main = async () => {
  // 1. Initialize (authenticate with EOA via SIWE)
  const session = await initialize();
  const eoaAddress = session.eoaAddress;

  // 2. Show menu and execute action
  const action = await showMenu();

  if (action === 'exit') {
    console.log('\n👋 Goodbye!');
    process.exit(0);
  }

  if (action === 'create') {
    await createOrViewTradingWallet(eoaAddress);
  }

  if (action === 'buy') {
    // Get existing trading wallet
    const tradingWallet = await getTradingWallet(eoaAddress);

    if (!tradingWallet) {
      console.log('\n❌ No trading wallet found for this EOA.');
      console.log('   Please create a trading wallet first (option 1).');
      process.exit(1);
    }

    console.log(`\n🔑 Using trading wallet: ${tradingWallet.address}`);

    try {
      const result = await executeTrade(tradingWallet);
      handleTradeResult(result);
    } catch (error) {
      console.error('\n❌ Order failed:', error);
      console.log('\n💡 Possible reasons:');
      console.log('   - Insufficient balance in trading wallet');
      console.log('   - Minimum order size not met');
    }
  }

  if (action === 'withdraw') {
    // Get existing trading wallet
    const tradingWallet = await getTradingWallet(eoaAddress);

    if (!tradingWallet) {
      console.log('\n❌ No trading wallet found for this EOA.');
      console.log('   Please create a trading wallet first (option 1).');
      process.exit(1);
    }

    console.log(`\n🔑 Using trading wallet: ${tradingWallet.address}`);

    try {
      const result = await executeWithdraw(tradingWallet, eoaAddress);
      handleWithdrawResult(result);
    } catch (error) {
      console.error('\n❌ Withdrawal failed:', error);
      console.log('\n💡 Possible reasons:');
      console.log('   - Insufficient balance');
      console.log('   - Minimum withdrawal not met');
    }
  }

  if (action === 'reap') {
    // Get existing trading wallet
    const tradingWallet = await getTradingWallet(eoaAddress);

    if (!tradingWallet) {
      console.log('\n❌ No trading wallet found for this EOA.');
      console.log('   Please create a trading wallet first (option 1).');
      process.exit(1);
    }

    console.log(`\n🔑 Using trading wallet: ${tradingWallet.address}`);

    try {
      const result = await executeReap(tradingWallet, eoaAddress);
      handleReapResult(result);
    } catch (error) {
      console.error('\n❌ Reap failed:', error);
      console.log('\n💡 Possible reasons:');
      console.log('   - No USDC balance on Arbitrum');
      console.log('   - Insufficient ETH for gas');
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('  PoC Complete');
  console.log('='.repeat(60));
};

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
