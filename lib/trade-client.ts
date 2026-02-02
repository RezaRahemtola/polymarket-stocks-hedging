import {
  AssetType,
  ClobClient,
  OrderType,
  Side,
} from "@polymarket/clob-client";
import { Wallet } from "ethers";
import { getConfig } from "./config";
import { logger } from "./logger";
import { Orderbook } from "./types";

let clobClient: ClobClient | null = null;

async function getClobClient(): Promise<ClobClient> {
  if (clobClient) return clobClient;

  const config = getConfig();
  const wallet = new Wallet(config.api.privateKey);
  const host = config.api.clobApiUrl;
  const chainId = 137;

  const rawCreds = await new ClobClient(host, chainId, wallet).deriveApiKey();
  const apiCreds = {
    key: rawCreds.key,
    secret: rawCreds.secret.replace(/-/g, "+").replace(/_/g, "/"),
    passphrase: rawCreds.passphrase,
  };

  clobClient = new ClobClient(
    host,
    chainId,
    wallet,
    apiCreds,
    2, // signatureType
    config.api.funderAddress,
  );

  return clobClient;
}

export async function getOrderbook(tokenId: string): Promise<Orderbook | null> {
  const config = getConfig();
  try {
    const res = await fetch(
      `${config.api.clobApiUrl}/book?token_id=${tokenId}`,
    );
    return await res.json();
  } catch {
    return null;
  }
}

export async function getBalance(): Promise<number> {
  try {
    const client = await getClobClient();
    const balances = await client.getBalanceAllowance({
      asset_type: AssetType.COLLATERAL,
    });
    // USDC has 6 decimals
    return Number.parseFloat(balances?.balance || "0") / 1e6;
  } catch (err) {
    logger.error(`[Balance] Error: ${err}`);
    return 0;
  }
}

export interface ExecutionPreview {
  shares: number;
  totalCost: number;
  avgPrice: number;
  apy: number;
  profit: number;
}

export function calculateExecutionPreview(
  orderbook: Orderbook,
  maxPrice: number,
  daysToExpiry: number,
  maxAmount?: number,
): ExecutionPreview {
  const asks = orderbook.asks
    .map((a) => ({
      price: Number.parseFloat(a.price),
      size: Number.parseFloat(a.size),
    }))
    .filter((a) => a.price <= maxPrice)
    .sort((a, b) => a.price - b.price);

  let shares = 0;
  let totalCost = 0;

  for (const ask of asks) {
    const costForThisLevel = ask.price * ask.size;

    if (maxAmount !== undefined && totalCost + costForThisLevel > maxAmount) {
      // Only take what we can afford at this price level
      const remainingBudget = maxAmount - totalCost;
      const affordableShares = remainingBudget / ask.price;
      if (affordableShares > 0) {
        shares += affordableShares;
        totalCost += ask.price * affordableShares;
      }
      break;
    }

    shares += ask.size;
    totalCost += costForThisLevel;
  }

  const avgPrice = shares > 0 ? totalCost / shares : 0;
  const yieldPerShare = 1 - avgPrice;
  const profit = yieldPerShare * shares;
  const apy =
    avgPrice > 0 && daysToExpiry > 0
      ? (yieldPerShare / avgPrice) * (365 / daysToExpiry) * 100
      : 0;

  return { shares, totalCost, avgPrice, apy, profit };
}

export async function executeTrade(
  noTokenId: string,
  maxPrice: number,
  maxAmount?: number,
): Promise<{
  success: boolean;
  sharesBought: number;
  avgPrice: number;
  totalCost: number;
}> {
  const client = await getClobClient();
  const orderbook = await getOrderbook(noTokenId);
  if (!orderbook) throw new Error("Failed to fetch orderbook");

  const asks = orderbook.asks
    .map((a) => ({
      price: Number.parseFloat(a.price),
      size: Number.parseFloat(a.size),
    }))
    .filter((a) => a.price <= maxPrice)
    .sort((a, b) => a.price - b.price);

  if (asks.length === 0) {
    return { success: false, sharesBought: 0, avgPrice: 0, totalCost: 0 };
  }

  let totalShares = 0;
  let totalCost = 0;
  let remainingBudget = maxAmount;

  // Place orders at each price level
  for (const ask of asks) {
    const roundedPrice = Math.round(ask.price * 100) / 100;
    let shares = Math.floor(ask.size);
    if (shares <= 0) continue;

    // Limit shares if we have a budget constraint
    if (remainingBudget !== undefined) {
      const maxAffordableShares = Math.floor(remainingBudget / roundedPrice);
      shares = Math.min(shares, maxAffordableShares);
      if (shares <= 0) break;
    }

    // Min order size is $1
    const orderCost = roundedPrice * shares;
    if (orderCost < 1) {
      logger.debug(`[Trade] Skipping order: $${orderCost.toFixed(2)} < $1 min`);
      continue;
    }

    try {
      const tickSize = await client.getTickSize(noTokenId);
      const negRisk = await client.getNegRisk(noTokenId);

      const order = await client.createOrder(
        {
          tokenID: noTokenId,
          price: roundedPrice,
          side: Side.BUY,
          size: shares,
          feeRateBps: 0,
        },
        { tickSize, negRisk },
      );

      const result = await client.postOrder(order, OrderType.GTC);
      if (!result?.success) {
        logger.error(`[Trade] Order rejected: ${JSON.stringify(result)}`);
        continue;
      }
      totalShares += shares;
      totalCost += orderCost;
      if (remainingBudget !== undefined) {
        remainingBudget -= orderCost;
      }
    } catch (err) {
      logger.error(`[Trade] Order failed: ${err}`);
    }
  }

  return {
    success: totalShares > 0,
    sharesBought: totalShares,
    avgPrice: totalShares > 0 ? totalCost / totalShares : 0,
    totalCost,
  };
}
