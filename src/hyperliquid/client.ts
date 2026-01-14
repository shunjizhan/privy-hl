import { HttpTransport, InfoClient, ExchangeClient } from '@nktkas/hyperliquid';
import { formatPrice, formatSize, SymbolConverter } from '@nktkas/hyperliquid/utils';
import { privateKeyToAccount } from 'viem/accounts';

import { config } from '../config';
import { createPrivyViemAccount, type PrivyWallet } from '../privy';

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
 * Get the master account address from private key
 */
export const getMasterAddress = (): `0x${string}` => {
  const account = privateKeyToAccount(config.HL_MASTER_PRIVATE_KEY as `0x${string}`);
  return account.address;
};

/**
 * Create an exchange client for the master account (using private key)
 */
export const createMasterExchangeClient = () => {
  const masterAccount = privateKeyToAccount(config.HL_MASTER_PRIVATE_KEY as `0x${string}`);
  return new ExchangeClient({ transport, wallet: masterAccount });
};

/**
 * Register a Privy wallet as an agent for the master account
 */
export const registerAgent = async (
  agentAddress: `0x${string}`,
  agentName?: string
) => {
  const masterClient = createMasterExchangeClient();
  return masterClient.approveAgent({
    agentAddress,
    agentName: agentName || null,
  });
};

/**
 * Create an exchange client using Privy wallet as an agent
 */
export const createAgentExchangeClient = (privyWallet: PrivyWallet) => {
  const agentAccount = createPrivyViemAccount(privyWallet);
  return new ExchangeClient({ transport, wallet: agentAccount });
};

/**
 * Create trading client with market order helper
 */
export const createTradingClient = (privyWallet: PrivyWallet) => {
  const client = createAgentExchangeClient(privyWallet);

  return {
    client,

    placeMarketOrder: async (params: {
      asset: number;
      isBuy: boolean;
      sizeUsd: number;
    }) => {
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
    },

    placeLimitOrder: async (params: {
      asset: number;
      isBuy: boolean;
      price: string;
      size: string;
    }) => {
      return client.order({
        orders: [
          {
            a: params.asset,
            b: params.isBuy,
            p: params.price,
            s: params.size,
            r: false,
            t: { limit: { tif: 'Gtc' } },
          },
        ],
        grouping: 'na',
      });
    },
  };
};
