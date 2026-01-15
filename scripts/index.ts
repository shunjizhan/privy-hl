/**
 * Vault Gateway Test Script
 *
 * Tests the vault gateway functionality with Hyperliquid integration.
 *
 * Usage:
 *   bun run index.ts                    # Interactive menu (operator mode)
 *   bun run index.ts --admin            # Interactive menu (admin mode)
 *   bun run index.ts <action>           # Direct action (operator mode)
 *   bun run index.ts --admin <action>   # Direct action (admin mode)
 *
 * Operator Actions:
 *   create   - Create a new vault via gateway
 *   trade    - Place a test trade ($10 BTC long)
 *   withdraw - Test withdrawal to whitelisted address
 *   deny     - Test denied operations (policy enforcement)
 *   status   - Show vault account status
 *
 * Admin Actions (--admin flag):
 *   deposit  - Deposit USDC to Hyperliquid from Arbitrum
 *   trade    - Place a test trade ($10 BTC long)
 *   withdraw - Withdraw funds from Hyperliquid
 *   status   - Show vault account status
 */

import {
  adminTrade,
  adminCloseAllPositions,
  adminSendAllUsdc,
  showStatus,
} from './src/admin';

import {
  placeTrade,
  testWithdrawal,
  testDeniedOperations,
} from './src/signer';

import {
  loadOperatorConfig,
  loadAdminConfig,
  prompt,
  showHelp,
  showOperatorMenu,
  showAdminMenu,
  createVaultViaGateway,
  adminDeposit,
  OPERATOR_ACTIONS,
  ADMIN_ACTIONS,
  type OperatorAction,
  type AdminAction,
} from './src/flow';

// ============================================================================
// Configuration
// ============================================================================

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';

// ============================================================================
// Action Executors
// ============================================================================

const executeOperatorAction = async (action: OperatorAction): Promise<boolean> => {
  if (action === 'exit') {
    console.log('\nGoodbye!');
    return false;
  }

  if (action === 'help') {
    showHelp(false);
    return true;
  }

  if (action === 'create') {
    try {
      await createVaultViaGateway();
    } catch (error) {
      if (error instanceof Error && error.message.includes('cancelled')) {
        return true; // User cancelled, continue gracefully
      }
      throw error;
    }
    return true;
  }

  // All other actions require existing config
  const config = loadOperatorConfig();
  if (!config) {
    console.log('\n[Error] No vault config found.');
    console.log('  Run: bun run index.ts create');
    return true;
  }

  try {
    if (action === 'status') await showStatus(config.walletAddress);
    if (action === 'trade') await placeTrade(config);
    if (action === 'withdraw') await testWithdrawal(config);
    if (action === 'deny') await testDeniedOperations(config);
  } catch (error) {
    console.error('\n[Error]', error instanceof Error ? error.message : error);
  }

  return true;
};

const executeAdminAction = async (action: AdminAction): Promise<boolean> => {
  if (action === 'exit') {
    console.log('\nGoodbye!');
    return false;
  }

  if (action === 'help') {
    showHelp(true);
    return true;
  }

  // All admin actions require config
  const config = loadAdminConfig();
  if (!config) {
    console.log('\n[Error] No admin config found.');
    console.log('  Make sure:');
    console.log('    1. Vault was created (bun run index.ts create)');
    console.log('    2. PRIVY_APP_ID and PRIVY_APP_SECRET env vars are set');
    return true;
  }

  try {
    if (action === 'deposit') await adminDeposit(config);
    if (action === 'status') await showStatus(config.walletAddress);
    if (action === 'trade') await adminTrade(config);
    if (action === 'close') await adminCloseAllPositions(config);
    if (action === 'send-all') await adminSendAllUsdc(config);
  } catch (error) {
    console.error('\n[Error]', error instanceof Error ? error.message : error);
  }

  return true;
};

// ============================================================================
// Main
// ============================================================================

const main = async () => {
  const args = process.argv.slice(2);
  const isAdmin = args[0] === '--admin';
  const actionArgs = isAdmin ? args.slice(1) : args;

  if (actionArgs[0] === '--help' || actionArgs[0] === '-h' || actionArgs[0] === 'help') {
    showHelp(isAdmin);
    process.exit(0);
  }

  console.log('='.repeat(50));
  console.log(`  Vault Gateway Test Script ${isAdmin ? '(ADMIN MODE)' : '(Operator Mode)'}`);
  console.log(`  Gateway: ${GATEWAY_URL}`);
  console.log('='.repeat(50));

  if (isAdmin) {
    // Admin mode
    if (actionArgs[0]) {
      const action = ADMIN_ACTIONS[actionArgs[0].toLowerCase()];
      if (!action) {
        console.log(`\n[Error] Unknown admin action: ${actionArgs[0]}`);
        showHelp(true);
        process.exit(1);
      }
      await executeAdminAction(action);
      process.exit(0);
    }

    // Interactive admin loop
    let running = true;
    while (running) {
      const action = await showAdminMenu();
      running = await executeAdminAction(action);
    }
  } else {
    // Operator mode
    if (actionArgs[0]) {
      const action = OPERATOR_ACTIONS[actionArgs[0].toLowerCase()];
      if (!action) {
        console.log(`\n[Error] Unknown action: ${actionArgs[0]}`);
        showHelp(false);
        process.exit(1);
      }
      await executeOperatorAction(action);
      process.exit(0);
    }

    // Interactive operator loop
    let running = true;
    while (running) {
      const action = await showOperatorMenu();
      running = await executeOperatorAction(action);
    }
  }
};

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
