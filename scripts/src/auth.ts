import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { createSiweMessage, generateSiweNonce, parseSiweMessage } from 'viem/siwe';

import { config } from './config';

export interface AuthSession {
  eoaAddress: string;
  account: PrivateKeyAccount;
  signature: `0x${string}`;
  message: string;
  expiresAt: Date;
}

// Session cache (in production, use Redis or similar)
let cachedSession: AuthSession | null = null;

// Session duration: 24 hours
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

/**
 * Create a viem account from the EOA private key
 */
export const createEoaAccount = (): PrivateKeyAccount => {
  const privateKey = config.EOA_PRIVATE_KEY as `0x${string}`;
  return privateKeyToAccount(privateKey);
};

/**
 * Generate a SIWE message for the EOA to sign
 */
const generateSiweAuthMessage = (address: string): string => {
  const now = new Date();
  const expirationTime = new Date(now.getTime() + SESSION_DURATION_MS);

  return createSiweMessage({
    address: address as `0x${string}`,
    chainId: 42161, // Arbitrum
    domain: 'privy-hl-poc.local',
    nonce: generateSiweNonce(),
    uri: 'https://privy-hl-poc.local',
    version: '1',
    statement: 'Sign in to authorize trading wallet operations',
    issuedAt: now,
    expirationTime,
  });
};

/**
 * Authenticate with EOA using SIWE
 * Signs a message to prove ownership of the EOA
 */
export const authenticateEoa = async (): Promise<AuthSession> => {
  // Check if we have a valid cached session
  if (cachedSession && cachedSession.expiresAt > new Date()) {
    console.log('   Using cached authentication session');
    return cachedSession;
  }

  const account = createEoaAccount();
  const eoaAddress = account.address.toLowerCase();

  console.log('   Creating SIWE authentication...');

  // Generate SIWE message
  const message = generateSiweAuthMessage(account.address);

  // Sign the message with EOA
  const signature = await account.signMessage({ message });

  // Calculate expiration
  const parsed = parseSiweMessage(message);
  const expiresAt = parsed.expirationTime || new Date(Date.now() + SESSION_DURATION_MS);

  // Create session
  cachedSession = {
    eoaAddress,
    account,
    signature,
    message,
    expiresAt,
  };

  console.log('   SIWE signature created successfully');

  return cachedSession;
};

/**
 * Verify an existing SIWE session
 * Returns true if the session is valid and not expired
 */
export const verifySession = (session: AuthSession): boolean => {
  if (session.expiresAt < new Date()) {
    console.log('   Session expired');
    return false;
  }

  // In production, you would verify the signature matches the message
  // For this PoC, we trust the cached session
  return true;
};

/**
 * Clear the cached session (logout)
 */
export const clearSession = () => {
  cachedSession = null;
};

/**
 * Get the current session or null if not authenticated
 */
export const getSession = (): AuthSession | null => {
  if (!cachedSession || cachedSession.expiresAt < new Date()) {
    return null;
  }
  return cachedSession;
};
