import { arc } from 'viem/chains';
import { keccak256, encodePacked } from 'viem';
import { config } from '../config.js';
import { logger } from './logger.js';

// Export Arc chain configuration directly from viem built-in
export { arc };

// USDC ERC-20 contract ABI on Arc (0x3600000000000000000000000000000000000000)
export const USDC_ABI = [
  {
    name: 'transferWithAuthorization',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from',        type: 'address' },
      { name: 'to',          type: 'address' },
      { name: 'value',       type: 'uint256' },
      { name: 'validAfter',  type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce',       type: 'bytes32' },
      { name: 'v',           type: 'uint8'   },
      { name: 'r',           type: 'bytes32' },
      { name: 's',           type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'authorizationState',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'authorizer', type: 'address' },
      { name: 'nonce',      type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'name',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    name: 'version',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
];

// EIP-3009 TransferWithAuthorization typed data definition
export const TRANSFER_WITH_AUTH_TYPES = {
  TransferWithAuthorization: [
    { name: 'from',        type: 'address' },
    { name: 'to',          type: 'address' },
    { name: 'value',       type: 'uint256' },
    { name: 'validAfter',  type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce',       type: 'bytes32' },
  ],
};

// Cached dynamic EIP-712 domain (Correction 3)
// Verified on Arc mainnet: contract name is "USDC", version is "2", chain ID is 5042.
let cachedDomain = {
  name: 'USDC',
  version: '2',
  chainId: config.arcChainId,
  verifyingContract: config.usdcAddress,
};

/**
 * Initializes and dynamically verifies EIP-712 domain against the live USDC contract.
 * @param {import('viem').PublicClient} publicClient
 */
export async function initUsdcDomain(publicClient) {
  try {
    const [name, version] = await Promise.all([
      publicClient.readContract({
        address: config.usdcAddress,
        abi: USDC_ABI,
        functionName: 'name',
      }),
      publicClient.readContract({
        address: config.usdcAddress,
        abi: USDC_ABI,
        functionName: 'version',
      }),
    ]);

    cachedDomain = {
      name,
      version,
      chainId: config.arcChainId,
      verifyingContract: config.usdcAddress,
    };

    logger.info(cachedDomain, 'USDC EIP-712 domain verified from live contract');
    return cachedDomain;
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to query USDC contract dynamically; using verified default domain (USDC v2)');
    return cachedDomain;
  }
}

/**
 * Returns the current EIP-712 domain separator object.
 */
export function getUsdcDomain() {
  return cachedDomain;
}

/**
 * Computes a cryptographically bound EIP-3009 nonce.
 * Binds a 16-byte random salt to the HTTP method and endpoint path.
 * (Correction 6: Request binding)
 */
export function computeBoundNonce(saltHex, method, path) {
  const cleanPath = path.split('?')[0].replace(/\/$/, '') || '/';
  const cleanSalt = saltHex.startsWith('0x') ? saltHex.slice(0, 34) : `0x${saltHex}`.slice(0, 34);
  return keccak256(
    encodePacked(
      ['bytes16', 'string'],
      [cleanSalt, `${method.toUpperCase()}:${cleanPath}`]
    )
  );
}
