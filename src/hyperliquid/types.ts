/**
 * Asset index mapping for Hyperliquid perpetuals
 */
export const ASSETS = {
  BTC: 0,
  ETH: 1,
  ATOM: 2,
  MATIC: 3,
  DYDX: 4,
  SOL: 5,
  AVAX: 6,
  BNB: 7,
  APE: 8,
  OP: 9,
} as const;

export type AssetSymbol = keyof typeof ASSETS;
export type AssetIndex = (typeof ASSETS)[AssetSymbol];

/**
 * Order wire format for Hyperliquid API
 */
export interface OrderWire {
  a: number; // asset index
  b: boolean; // isBuy
  p: string; // price
  s: string; // size
  r: boolean; // reduceOnly
  t:
    | { limit: { tif: 'Gtc' | 'Ioc' | 'Alo' } }
    | { trigger: { triggerPx: string; isMarket: boolean; tpsl: 'tp' | 'sl' } };
  c?: string; // cloid (client order id)
}

/**
 * Order response from Hyperliquid
 */
export interface OrderResponse {
  status: 'ok' | 'err';
  response:
    | {
        type: 'order';
        data: {
          statuses: Array<{
            resting?: { oid: number };
            filled?: { totalSz: string; avgPx: string; oid: number };
            error?: string;
          }>;
        };
      }
    | { type: 'error'; message: string };
}
