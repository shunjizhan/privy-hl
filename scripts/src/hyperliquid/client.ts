import { HttpTransport, InfoClient, ExchangeClient } from '@nktkas/hyperliquid';
import { formatPrice, formatSize, SymbolConverter } from '@nktkas/hyperliquid/utils';

import { createTradingViemAccount, type TradingWallet } from '../privy';

const transport = new HttpTransport();

// Symbol converter for proper formatting
let symbolConverter: Awaited<ReturnType<typeof SymbolConverter.create>> | null = null;

const getSymbolConverter = async () => {
  if (!symbolConverter) {
    symbolConverter = await SymbolConverter.create({ transport });
  }
  return symbolConverter;
};

/**
 * Info client for read-only operations (prices, account state, etc.)
 */
export const infoClient = new InfoClient({ transport });

/**
 * Get mid prices for all assets
 */
export const getMidPrices = async (): Promise<Record<string, string>> => {
  return infoClient.allMids();
};

/**
 * Get account state including withdrawable balance
 */
export const getAccountState = async (address: string) => {
  return infoClient.clearinghouseState({ user: address });
};

/**
 * Get withdrawable balance for an account
 */
export const getWithdrawableBalance = async (address: string): Promise<string> => {
  const state = await getAccountState(address);
  return state.withdrawable;
};

/**
 * Create an exchange client using the trading wallet
 * This wallet IS the Hyperliquid account (not an agent)
 */
export const createExchangeClient = (tradingWallet: TradingWallet) => {
  const account = createTradingViemAccount(tradingWallet);
  return new ExchangeClient({ transport, wallet: account });
};

/**
 * Place a market order using the trading wallet
 */
export const placeMarketOrder = async (
  tradingWallet: TradingWallet,
  params: {
    asset: number;
    isBuy: boolean;
    sizeUsd: number;
  }
) => {
  const client = createExchangeClient(tradingWallet);
  const mids = await getMidPrices();
  const converter = await getSymbolConverter();

  const assetMap: Record<number, string> = {
    0: 'BTC',
    1: 'ETH',
    2: 'ATOM',
    3: 'MATIC',
    4: 'DYDX',
    5: 'SOL',
    6: 'AVAX',
    7: 'BNB',
    8: 'APE',
    9: 'OP',
  };

  const symbol = assetMap[params.asset] || 'BTC';
  const midPrice = parseFloat(mids[symbol] || '0');

  if (midPrice === 0) {
    throw new Error(`Could not get mid price for ${symbol}`);
  }

  const szDecimals = converter.getSzDecimals(symbol) ?? 5;
  const sizeInAsset = params.sizeUsd / midPrice;

  // 1% slippage for IOC execution
  const slippage = 0.01;
  const execPrice = params.isBuy
    ? midPrice * (1 + slippage)
    : midPrice * (1 - slippage);

  const formattedPrice = formatPrice(execPrice.toString(), szDecimals);
  const formattedSize = formatSize(sizeInAsset.toString(), szDecimals);

  console.log(`\n📊 Order Details:`);
  console.log(`   Trading Wallet: ${tradingWallet.address}`);
  console.log(`   Asset: ${symbol} (index: ${params.asset})`);
  console.log(`   Side: ${params.isBuy ? 'LONG' : 'SHORT'}`);
  console.log(`   Size (USD): $${params.sizeUsd}`);
  console.log(`   Size (${symbol}): ${formattedSize}`);
  console.log(`   Mid Price: $${midPrice.toFixed(2)}`);
  console.log(`   Exec Price: $${formattedPrice}`);

  return client.order({
    orders: [
      {
        a: params.asset,
        b: params.isBuy,
        p: formattedPrice,
        s: formattedSize,
        r: false,
        t: { limit: { tif: 'Ioc' } },
      },
    ],
    grouping: 'na',
  });
};

/**
 * Withdraw USDC from Hyperliquid to Arbitrum
 * The trading wallet signs the withdrawal
 */
export const withdraw = async (
  tradingWallet: TradingWallet,
  params: {
    destination: `0x${string}`;
    amount: string;
  }
) => {
  const client = createExchangeClient(tradingWallet);

  console.log(`\n💸 Withdrawal Details:`);
  console.log(`   From: ${tradingWallet.address}`);
  console.log(`   To: ${params.destination}`);
  console.log(`   Amount: $${params.amount} USDC`);

  return client.withdraw3({
    destination: params.destination,
    amount: params.amount,
  });
};

/**
 * Reap all USDC from trading wallet to EOA
 * Withdraws the entire withdrawable balance
 */
export const reapUsdc = async (
  tradingWallet: TradingWallet,
  destination: `0x${string}`
) => {
  // Get withdrawable balance
  const withdrawable = await getWithdrawableBalance(tradingWallet.address);
  const balance = parseFloat(withdrawable);

  console.log(`\n🌾 Reap USDC Details:`);
  console.log(`   From: ${tradingWallet.address}`);
  console.log(`   To: ${destination}`);
  console.log(`   Withdrawable Balance: $${balance.toFixed(2)} USDC`);

  if (balance <= 0) {
    throw new Error('No withdrawable balance available');
  }

  // Hyperliquid has a minimum withdrawal of $1
  if (balance < 1) {
    throw new Error(`Withdrawable balance ($${balance.toFixed(2)}) is below minimum ($1)`);
  }

  const client = createExchangeClient(tradingWallet);

  return client.withdraw3({
    destination,
    amount: withdrawable,
  });
};
