/**
 * Terminal Helpers
 *
 * Utilities for terminal interaction, menus, and help text.
 */

import * as readline from 'readline';

export type OperatorAction =
  | 'create'
  | 'trade'
  | 'withdraw'
  | 'deny'
  | 'status'
  | 'exit'
  | 'help';

export type AdminAction =
  | 'deposit'
  | 'trade'
  | 'close'
  | 'send-all'
  | 'status'
  | 'exit'
  | 'help';

export const OPERATOR_ACTIONS: Record<string, OperatorAction> = {
  '1': 'create',
  '2': 'trade',
  '3': 'withdraw',
  '4': 'deny',
  '5': 'status',
  '6': 'exit',
  create: 'create',
  trade: 'trade',
  withdraw: 'withdraw',
  deny: 'deny',
  status: 'status',
  exit: 'exit',
  help: 'help',
  '--help': 'help',
  '-h': 'help',
};

export const ADMIN_ACTIONS: Record<string, AdminAction> = {
  '1': 'deposit',
  '2': 'trade',
  '3': 'close',
  '4': 'send-all',
  '5': 'status',
  '6': 'exit',
  deposit: 'deposit',
  trade: 'trade',
  close: 'close',
  'send-all': 'send-all',
  sendall: 'send-all',
  status: 'status',
  exit: 'exit',
  help: 'help',
  '--help': 'help',
  '-h': 'help',
};

/**
 * Prompt user for input
 */
export const prompt = (question: string): Promise<string> => {
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

/**
 * Show help text
 */
export const showHelp = (isAdmin: boolean) => {
  if (isAdmin) {
    console.log(`
Usage: bun run index.ts --admin [action]

Admin Actions:
  deposit   Deposit USDC from Arbitrum to Hyperliquid
  trade     Place a test trade ($11 BTC long)
  close     Close all positions (market sell)
  send-all  Send all USDC to whitelisted address (internal HL transfer)
  status    Show vault account status

Options:
  --help, -h  Show this help message

Examples:
  bun run index.ts --admin           # Interactive admin menu
  bun run index.ts --admin deposit   # Deposit USDC to Hyperliquid
  bun run index.ts --admin trade     # Place test trade as admin
  bun run index.ts --admin send-all  # Send all USDC
`);
  } else {
    console.log(`
Usage: bun run index.ts [action]

Operator Actions:
  create    Create a new vault via gateway
  trade     Place a test trade ($11 BTC long)
  withdraw  Test withdrawal to whitelisted address
  deny      Test denied operations (policy enforcement)
  status    Show vault account status

Admin Mode:
  bun run index.ts --admin [action]  # Run as admin

Options:
  --help, -h  Show this help message

Examples:
  bun run index.ts              # Interactive menu
  bun run index.ts create       # Create vault
  bun run index.ts trade        # Place test trade
`);
  }
};

/**
 * Show operator action menu
 */
export const showOperatorMenu = async (): Promise<OperatorAction> => {
  console.log('\n--- Operator Actions ---');
  console.log('  1. create    Create a new vault');
  console.log('  2. trade     Place test trade ($10 BTC long)');
  console.log('  3. withdraw  Test withdrawal to whitelisted');
  console.log('  4. deny      Test denied operations');
  console.log('  5. status    Show account status');
  console.log('  6. exit      Exit');

  const choice = await prompt('\nEnter choice (1-6 or action name): ');
  const action = OPERATOR_ACTIONS[choice.toLowerCase()];

  if (!action) {
    console.log('Invalid choice, please try again.');
    return showOperatorMenu();
  }

  return action;
};

/**
 * Show admin action menu
 */
export const showAdminMenu = async (): Promise<AdminAction> => {
  console.log('\n--- Admin Actions ---');
  console.log('  1. deposit   Deposit USDC from Arbitrum to Hyperliquid');
  console.log('  2. trade     Place test trade ($10 BTC long)');
  console.log('  3. close     Close all positions');
  console.log('  4. send-all  Send all USDC to whitelisted (internal HL)');
  console.log('  5. status    Show account status');
  console.log('  6. exit      Exit');

  const choice = await prompt('\nEnter choice (1-6 or action name): ');
  const action = ADMIN_ACTIONS[choice.toLowerCase()];

  if (!action) {
    console.log('Invalid choice, please try again.');
    return showAdminMenu();
  }

  return action;
};
