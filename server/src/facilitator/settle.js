import { createWalletClient, createPublicClient, http, hexToSignature } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { config } from '../config.js';
import { arc, USDC_ABI } from '../utils/arc.js';
import { logger } from '../utils/logger.js';

const ARC_MIN_FEE_FLOOR = 20_000_000_000n;

const account = privateKeyToAccount(config.facilitatorPrivateKey);

export const walletClient = createWalletClient({
  account,
  chain: arc,
  transport: http(config.arcRpcUrl),
});

export const publicClient = createPublicClient({
  chain: arc,
  transport: http(config.arcRpcUrl),
});

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export async function settleOnChain(payment) {
  const { from, to, value, validAfter, validBefore, nonce, signature } = payment;

  const { v, r, s } = hexToSignature(signature);

  const normalizedV = Number(v) < 27 ? Number(v) + 27 : Number(v);

  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info(
        { from, to, value, nonce, attempt, v: normalizedV },
        'Submitting transferWithAuthorization to Arc'
      );

      let currentGasPrice;
      try {
        currentGasPrice = await publicClient.getGasPrice();
      } catch {
        currentGasPrice = ARC_MIN_FEE_FLOOR;
      }
      const effectiveGasFee = currentGasPrice > ARC_MIN_FEE_FLOOR ? currentGasPrice : ARC_MIN_FEE_FLOOR;

      const txHash = await walletClient.writeContract({
        address: config.usdcAddress,
        abi: USDC_ABI,
        functionName: 'transferWithAuthorization',
        args: [
          from,
          to,
          BigInt(value),
          BigInt(validAfter),
          BigInt(validBefore),
          nonce,
          normalizedV,
          r,
          s,
        ],
        maxFeePerGas: effectiveGasFee,
        maxPriorityFeePerGas: effectiveGasFee,
      });

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 30_000,
      });

      if (receipt.status === 'reverted') {
        throw new Error(`Transaction reverted on-chain: ${txHash}`);
      }

      const result = {
        txHash,
        blockNumber: Number(receipt.blockNumber),
        gasUsed: receipt.gasUsed.toString(),
      };

      logger.info(result, 'Settlement confirmed on Arc mainnet');
      return result;

    } catch (err) {
      lastError = err;
      logger.warn(
        { err: err.message, attempt, maxRetries: MAX_RETRIES },
        'Settlement attempt failed'
      );

      if (err.message?.includes('reverted')) {
        throw err;
      }

      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Settlement failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

export async function getFacilitatorBalance() {
  try {
    const balance = await publicClient.getBalance({
      address: account.address,
    });
    return balance.toString();
  } catch {
    return null;
  }
}
