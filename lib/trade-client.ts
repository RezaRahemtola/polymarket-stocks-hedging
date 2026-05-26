import {
  AssetType,
  Chain,
  ClobClient,
  OrderType,
  Side,
} from "@polymarket/clob-client-v2";
import { Wallet } from "ethers";
import { getConfig } from "./config";
import { logger } from "./logger";
import { Orderbook, SellPreview } from "./types";

let clobClient: ClobClient | null = null;

async function getClobClient(): Promise<ClobClient> {
  if (clobClient) return clobClient;

  const config = getConfig();
  const wallet = new Wallet(config.api.privateKey);
  const host = config.api.clobApiUrl;
  const chain = Chain.POLYGON;

  const rawCreds = await new ClobClient({
    host,
    chain,
    signer: wallet,
  }).createOrDeriveApiKey();
  const apiCreds = {
    key: rawCreds.key,
    secret: rawCreds.secret.replace(/-/g, "+").replace(/_/g, "/"),
    passphrase: rawCreds.passphrase,
  };

  clobClient = new ClobClient({
    host,
    chain,
    signer: wallet,
    creds: apiCreds,
    signatureType: 2, // POLY_GNOSIS_SAFE
    funderAddress: config.api.funderAddress,
  });

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

export function calculateSellPreview(
  orderbook: Orderbook,
  shares: number,
  minPrice = 0,
): SellPreview {
  const bids = orderbook.bids
    .map((b) => ({
      price: Number.parseFloat(b.price),
      size: Number.parseFloat(b.size),
    }))
    .filter((b) => b.price >= minPrice)
    .sort((a, b) => b.price - a.price);

  let fillableShares = 0;
  let proceeds = 0;
  let remaining = shares;

  for (const bid of bids) {
    if (remaining <= 0) break;
    const fill = Math.min(remaining, bid.size);
    fillableShares += fill;
    proceeds += bid.price * fill;
    remaining -= fill;
  }

  const avgPrice = fillableShares > 0 ? proceeds / fillableShares : 0;
  return { fillableShares, proceeds, avgPrice };
}

export async function executeTrade(
  noTokenId: string,
  maxPrice: number,
  amount: number,
): Promise<{
  success: boolean;
  sharesBought: number;
  avgPrice: number;
  totalCost: number;
}> {
  const client = await getClobClient();
  const roundedMaxPrice = maxPrice;

  try {
    const result = await client.createAndPostMarketOrder(
      {
        tokenID: noTokenId,
        price: roundedMaxPrice,
        amount,
        // V2 fees are operator-set at match time and charged on top of `amount`
        // unless `userUSDCBalance` is provided. Pass the budget so the SDK
        // shrinks the order to fit fees and avoids insufficient-balance reverts.
        userUSDCBalance: amount,
        side: Side.BUY,
        orderType: OrderType.FAK,
      },
      undefined,
      OrderType.FAK,
    );

    if (!result?.success) {
      logger.error(`[Trade] FAK order rejected: ${JSON.stringify(result)}`);
      return { success: false, sharesBought: 0, avgPrice: 0, totalCost: 0 };
    }

    const totalCost = Number.parseFloat(result.makingAmount ?? "0");
    const sharesBought = Number.parseFloat(result.takingAmount ?? "0");

    if (sharesBought <= 0 || totalCost <= 0) {
      logger.error(`[Trade] FAK order zero-filled: ${JSON.stringify(result)}`);
      return { success: false, sharesBought: 0, avgPrice: 0, totalCost: 0 };
    }

    return {
      success: true,
      sharesBought,
      avgPrice: totalCost / sharesBought,
      totalCost,
    };
  } catch (err) {
    logger.error(`[Trade] FAK order failed: ${err}`);
    return { success: false, sharesBought: 0, avgPrice: 0, totalCost: 0 };
  }
}
