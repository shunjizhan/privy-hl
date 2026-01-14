import { HttpTransport, InfoClient, ExchangeClient } from '@nktkas/hyperliquid';
import { formatPrice, formatSize, SymbolConverter } from '@nktkas/hyperliquid/utils';
import { privateKeyToAccount } from 'viem/accounts';

import { getHyperliquidConfig, config } from '../config';
import { createPrivyViemAccount, type PrivyWallet } from '../privy';

// Symbol converter for proper formatting
let symbolConverter: Awaited<ReturnType<typeof SymbolConverter.create>> | null = null;

const getSymbolConverter = async () => {
  if (!symbolConverter) {
    symbolConverter = await SymbolConverter.create({ transport });
  }
  return symbolConverter;
};

const hlConfig = getHyperliquidConfig();
const isTestnet = hlConfig.hyperliquidChain === 'Testnet';
const transport = new HttpTransport({ isTestnet });

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
 * Get the master account address from private key
 */
export const getMasterAddress = (): `0x${string}` => {
  const account = privateKeyToAccount(config.hyperliquid.masterPrivateKey);
  return account.address;
};

/**
 * Create an exchange client for the master account (using private key)
 */
export const createMasterExchangeClient = () => {
  const masterAccount = privateKeyToAccount(config.hyperliquid.masterPrivateKey);

  return new ExchangeClient({
    transport,
    wallet: masterAccount,
    isTestnet,
  });
};

/**
 * Register a Privy wallet as an agent for the master account
 * Uses the master's private key to approve the agent
 */
export const registerAgent = async (
  agentAddress: `0x${string}`,
  agentName?: string
) => {
  const masterClient = createMasterExchangeClient();

  // Use the SDK's built-in approveAgent method
  const result = await masterClient.approveAgent({
    agentAddress,
    agentName: agentName || null,
  });

  return result;
};

/**
 * Create an exchange client using Privy wallet as an agent
 * The wallet must be pre-approved as an agent on Hyperliquid
 */
export const createAgentExchangeClient = (privyWallet: PrivyWallet) => {
  // Create viem-compatible account from Privy wallet
  const agentAccount = createPrivyViemAccount(privyWallet);

  // Create exchange client with the Privy account
  const client = new ExchangeClient({
    transport,
    wallet: agentAccount,
    isTestnet,
  });

  return client;
};

/**
 * Helper to create exchange client and place a market order
 */
export const createTradingClient = (privyWallet: PrivyWallet) => {
  const client = createAgentExchangeClient(privyWallet);

  return {
    client,

    /**
     * Place a market order (using IOC limit with aggressive price)
     */
    placeMarketOrder: async (params: {
      asset: number;
      isBuy: boolean;
      sizeUsd: number; // Size in USD
    }) => {
      const mids = await getMidPrices();
      const converter = await getSymbolConverter();

      // Map asset index to symbol
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

      // Get size decimals from converter
      const szDecimals = converter.getSzDecimals(symbol);

      // Calculate size based on USD amount
      const sizeInAsset = params.sizeUsd / midPrice;

      // Set aggressive price for IOC execution (1% slippage)
      const slippage = 0.01;
      const execPrice = params.isBuy
        ? midPrice * (1 + slippage)
        : midPrice * (1 - slippage);

      // Use SDK formatting utilities for proper tick size compliance
      const formattedPrice = formatPrice(execPrice.toString(), szDecimals);
      const formattedSize = formatSize(sizeInAsset.toString(), szDecimals);

      console.log(`\n📊 Order Details:`);
      console.log(`   Asset: ${symbol} (index: ${params.asset})`);
      console.log(`   Side: ${params.isBuy ? 'LONG' : 'SHORT'}`);
      console.log(`   Size (USD): $${params.sizeUsd}`);
      console.log(`   Size (${symbol}): ${formattedSize}`);
      console.log(`   Mid Price: $${midPrice.toFixed(2)}`);
      console.log(`   Exec Price: $${formattedPrice}`);

      const result = await client.order({
        orders: [
          {
            a: params.asset,
            b: params.isBuy,
            p: formattedPrice,
            s: formattedSize,
            r: false, // Not reduce-only
            t: { limit: { tif: 'Ioc' } }, // Immediate or Cancel
          },
        ],
        grouping: 'na',
      });

      return result;
    },

    /**
     * Place a limit order
     */
    placeLimitOrder: async (params: {
      asset: number;
      isBuy: boolean;
      price: string;
      size: string;
    }) => {
      const result = await client.order({
        orders: [
          {
            a: params.asset,
            b: params.isBuy,
            p: params.price,
            s: params.size,
            r: false,
            t: { limit: { tif: 'Gtc' } }, // Good till cancelled
          },
        ],
        grouping: 'na',
      });

      return result;
    },
  };
};
