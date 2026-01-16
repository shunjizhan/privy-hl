/**
 * Admin Trade Action
 *
 * Places trades on Hyperliquid as admin.
 */

import { HttpTransport, ExchangeClient, InfoClient } from '@nktkas/hyperliquid';
import { formatPrice, formatSize, SymbolConverter } from '@nktkas/hyperliquid/utils';

import { createAdminAccount, type AdminConfig } from '../account';

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
 * Place a $11 BTC long order as admin
 */
export const adminTrade = async (config: AdminConfig) => {
  console.log('\n[Admin Trade] Placing $11 BTC long order...');

  const account = createAdminAccount(config);
  const client = new ExchangeClient({ transport, wallet: account });
  const converter = await getSymbolConverter();

  const mids = await infoClient.allMids();
  const btcPrice = parseFloat(mids['BTC'] || '100000');
  const sizeUsd = 11;
  const sizeInBtc = sizeUsd / btcPrice;
  const szDecimals = converter.getSzDecimals('BTC') ?? 5;

  const slippage = 0.01;
  const execPrice = btcPrice * (1 + slippage);
  const formattedPrice = formatPrice(execPrice.toString(), szDecimals);
  const formattedSize = formatSize(sizeInBtc.toString(), szDecimals);

  console.log(`  BTC Price: $${btcPrice.toFixed(2)}`);
  console.log(`  Size: ${formattedSize} BTC (~$${sizeUsd})`);
  console.log(`  Exec Price: $${formattedPrice}`);

  const result = await client.order({
    orders: [
      {
        a: 0,
        b: true,
        p: formattedPrice,
        s: formattedSize,
        r: false,
        t: { limit: { tif: 'Ioc' } },
      },
    ],
    grouping: 'na',
  });

  console.log('\n[OK] Order executed!');
  console.log(`  Result: ${JSON.stringify(result, null, 2)}`);
};
