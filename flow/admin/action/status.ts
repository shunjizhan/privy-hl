/**
 * Status Action
 *
 * Shows account status on Hyperliquid.
 * Shared between admin and operator modes.
 */

import { HttpTransport, InfoClient } from '@nktkas/hyperliquid';

const transport = new HttpTransport();
const infoClient = new InfoClient({ transport });

export interface AccountStatus {
  accountValue: string;
  withdrawable: string;
  positions: Array<{
    position: {
      coin: string;
      szi: string;
      unrealizedPnl: string;
    };
  }>;
}

/**
 * Get account status from Hyperliquid
 */
export const getAccountStatus = async (address: string): Promise<AccountStatus> => {
  const state = await infoClient.clearinghouseState({ user: address });
  return {
    accountValue: state.marginSummary.accountValue,
    withdrawable: state.withdrawable,
    positions: state.assetPositions.filter(
      (p) => parseFloat(p.position.szi) !== 0
    ),
  };
};

/**
 * Display account status
 */
export const showStatus = async (address: string) => {
  console.log('\n[Status] Fetching account status...');
  console.log(`  Address: ${address}`);

  const status = await getAccountStatus(address);

  console.log(
    `\n  Account Value: $${parseFloat(status.accountValue).toFixed(2)}`
  );
  console.log(`  Withdrawable: $${parseFloat(status.withdrawable).toFixed(2)}`);

  if (status.positions.length > 0) {
    console.log('  Positions:');
    for (const pos of status.positions) {
      const size = parseFloat(pos.position.szi);
      const pnl = parseFloat(pos.position.unrealizedPnl);
      console.log(
        `    - ${pos.position.coin}: ${size > 0 ? 'LONG' : 'SHORT'} ${Math.abs(size)} (PnL: $${pnl.toFixed(2)})`
      );
    }
  } else {
    console.log('  Positions: None');
  }
};
