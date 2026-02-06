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
        side: Side.BUY,
        feeRateBps: 0,
        orderType: OrderType.FAK,
      },
      undefined,
      OrderType.FAK,
    );

    if (!result?.success) {
      logger.error(`[Trade] FAK order rejected: ${JSON.stringify(result)}`);
      return { success: false, sharesBought: 0, avgPrice: 0, totalCost: 0 };
    }

    const totalCost = amount;
    const sharesBought = totalCost / roundedMaxPrice;

    return {
      success: true,
      sharesBought,
      avgPrice: roundedMaxPrice,
      totalCost,
    };
  } catch (err) {
    logger.error(`[Trade] FAK order failed: ${err}`);
    return { success: false, sharesBought: 0, avgPrice: 0, totalCost: 0 };
  }
}
