/**
 * Operator Close Action
 *
 * Closes all positions on Hyperliquid as operator (via backend).
 */

import { HttpTransport, ExchangeClient, InfoClient } from '@nktkas/hyperliquid';
import { formatPrice, formatSize, SymbolConverter } from '@nktkas/hyperliquid/utils';

import { createOperatorAccount, type OperatorConfig } from '../account';

const transport = new HttpTransport();
const infoClient = new InfoClient({ transport });

let symbolConverter: Awaited<ReturnType<typeof SymbolConverter.create>> | null = null;

const getSymbolConverter = async () => {
  if (!symbolConverter) {
    symbolConverter = await SymbolConverter.create({ transport });
  }
  return symbolConverter;
};

/**
 * Close all positions on Hyperliquid as operator
 */
export const closeAllPositions = async (config: OperatorConfig) => {
  console.log('\n[Operator Close] Closing all positions...');

  const account = createOperatorAccount(config);
  const client = new ExchangeClient({ transport, wallet: account });
  const converter = await getSymbolConverter();

  // Get current positions
  const state = await infoClient.clearinghouseState({ user: config.walletAddress });
  const positions = state.assetPositions.filter(
    (p) => parseFloat(p.position.szi) !== 0
  );

  if (positions.length === 0) {
    console.log('  No positions to close.');
    return;
  }

  for (const pos of positions) {
    const coin = pos.position.coin;
    const size = parseFloat(pos.position.szi);
    const isLong = size > 0;
    const absSize = Math.abs(size);
    const szDecimals = converter.getSzDecimals(coin) ?? 5;

    console.log(`\n  Closing ${coin}: ${isLong ? 'LONG' : 'SHORT'} ${absSize}`);

    const mids = await infoClient.allMids();
    const midPrice = parseFloat(mids[coin] || '0');
    const slippage = 0.01;

    // To close: sell if long, buy if short
    const execPrice = isLong
      ? midPrice * (1 - slippage)
      : midPrice * (1 + slippage);
    const formattedPrice = formatPrice(execPrice.toString(), szDecimals);
    const formattedSize = formatSize(absSize.toString(), szDecimals);

    // Get asset index
    const assetIndex = converter.getAssetId(coin);
    if (assetIndex === undefined) {
      console.log(`  [Error] Unknown asset: ${coin}`);
      continue;
    }

    const result = await client.order({
      orders: [
        {
          a: assetIndex,
          b: !isLong, // buy to close short, sell to close long
          p: formattedPrice,
          s: formattedSize,
          r: true, // reduce only
          t: { limit: { tif: 'Ioc' } },
        },
      ],
      grouping: 'na',
    });

    console.log(`  Result: ${JSON.stringify(result, null, 2)}`);
  }

  console.log('\n[OK] All positions closed!');
};
