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
import { Orderbook, SellPreview, OpenOrderView } from "./types";

let signer: Wallet | null = null;
let apiCreds: {
  key: string;
  secret: string;
  passphrase: string;
} | null = null;

function getSigner(): Wallet {
  signer ??= new Wallet(getConfig().api.privateKey);
  return signer;
}

async function getApiCreds() {
  if (apiCreds) return apiCreds;

  const rawCreds = await new ClobClient({
    host: getConfig().api.clobApiUrl,
    chain: Chain.POLYGON,
    signer: getSigner(),
  }).createOrDeriveApiKey();

  apiCreds = {
    key: rawCreds.key,
    secret: rawCreds.secret.replace(/-/g, "+").replace(/_/g, "/"),
    passphrase: rawCreds.passphrase,
  };
  return apiCreds;
}

// A ClobClient caches each token's tick size, fee rate and neg-risk flag for its
// own lifetime with no invalidation. Polymarket tightens a market's tick (0.01 ->
// 0.001) as its price approaches 0 or 1, so a reused client keeps validating and
// rounding prices against the stale grid: prices above 0.99 are rejected outright
// and finer ones are rounded DOWN off the book, matching nothing. Build a fresh
// client per call — only the derived API creds are worth keeping.
async function getClobClient(): Promise<ClobClient> {
  const config = getConfig();
  return new ClobClient({
    host: config.api.clobApiUrl,
    chain: Chain.POLYGON,
    signer: getSigner(),
    creds: await getApiCreds(),
    signatureType: 2, // POLY_GNOSIS_SAFE
    funderAddress: config.api.funderAddress,
  });
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
  // Lowest purchasable ask in the LIVE book, regardless of maxPrice. Lets the
  // UI explain "0 shares" (limit below ask) and seed a sane default ceiling.
  bestAsk: number | null;
}

function lowestPurchasableAsk(
  asks: { price: number; size: number }[],
): number | null {
  // Mirror scanner.getBestAsk: first level with >= 1 share or >= $1 notional.
  for (const ask of asks) {
    if (ask.size >= 1 || ask.price * ask.size >= 1) return ask.price;
  }
  return asks[0]?.price ?? null;
}

export function calculateExecutionPreview(
  orderbook: Orderbook,
  maxPrice: number,
  daysToExpiry: number,
  maxAmount?: number,
): ExecutionPreview {
  const allAsks = orderbook.asks
    .map((a) => ({
      price: Number.parseFloat(a.price),
      size: Number.parseFloat(a.size),
    }))
    .filter((a) => !isNaN(a.price) && !isNaN(a.size))
    .sort((a, b) => a.price - b.price);

  const bestAsk = lowestPurchasableAsk(allAsks);

  const asks = allAsks.filter((a) => a.price <= maxPrice);

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

  return { shares, totalCost, avgPrice, apy, profit, bestAsk };
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
  error?: string;
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
      const reason =
        (result as { errorMsg?: string; error?: string })?.errorMsg ??
        (result as { error?: string })?.error ??
        "order rejected by exchange";
      return {
        success: false,
        sharesBought: 0,
        avgPrice: 0,
        totalCost: 0,
        error: reason,
      };
    }

    const totalCost = Number.parseFloat(result.makingAmount ?? "0");
    const sharesBought = Number.parseFloat(result.takingAmount ?? "0");

    if (sharesBought <= 0 || totalCost <= 0) {
      logger.error(`[Trade] FAK order zero-filled: ${JSON.stringify(result)}`);
      return {
        success: false,
        sharesBought: 0,
        avgPrice: 0,
        totalCost: 0,
        error:
          "order matched nothing — your max price may be below the best ask, or there is no liquidity",
      };
    }

    return {
      success: true,
      sharesBought,
      avgPrice: totalCost / sharesBought,
      totalCost,
    };
  } catch (err) {
    logger.error(`[Trade] FAK order failed: ${err}`);
    return {
      success: false,
      sharesBought: 0,
      avgPrice: 0,
      totalCost: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export type SellResult =
  | {
      success: boolean;
      mode: "market";
      sharesSold: number;
      avgPrice: number;
      proceeds: number;
    }
  | { success: boolean; mode: "limit"; orderId: string };

export async function executeSell(args: {
  tokenId: string;
  mode: "market" | "limit";
  shares: number;
  price: number;
}): Promise<SellResult> {
  const client = await getClobClient();

  if (args.mode === "limit") {
    try {
      const result = await client.createAndPostOrder(
        {
          tokenID: args.tokenId,
          price: args.price,
          size: args.shares,
          side: Side.SELL,
        },
        undefined,
        OrderType.GTC,
      );
      if (!result?.success) {
        logger.error(`[Sell] Limit order rejected: ${JSON.stringify(result)}`);
        return { success: false, mode: "limit", orderId: "" };
      }
      return { success: true, mode: "limit", orderId: result.orderID ?? "" };
    } catch (err) {
      logger.error(`[Sell] Limit order failed: ${err}`);
      return { success: false, mode: "limit", orderId: "" };
    }
  }

  // Market (FAK). `price` is a MIN-price floor: fills only bids >= price.
  try {
    const result = await client.createAndPostMarketOrder(
      {
        tokenID: args.tokenId,
        amount: args.shares,
        price: args.price,
        side: Side.SELL,
        orderType: OrderType.FAK,
      },
      undefined,
      OrderType.FAK,
    );

    logger.info(`[Sell] FAK raw result: ${JSON.stringify(result)}`);

    if (!result?.success) {
      logger.error(`[Sell] FAK order rejected: ${JSON.stringify(result)}`);
      return {
        success: false,
        mode: "market",
        sharesSold: 0,
        avgPrice: 0,
        proceeds: 0,
      };
    }

    // SELL inverts BUY: maker gives shares (makingAmount), takes USDC (takingAmount).
    const sharesSold = Number.parseFloat(result.makingAmount ?? "0");
    const proceeds = Number.parseFloat(result.takingAmount ?? "0");

    if (sharesSold <= 0 || proceeds <= 0) {
      logger.error(`[Sell] FAK order zero-filled: ${JSON.stringify(result)}`);
      return {
        success: false,
        mode: "market",
        sharesSold: 0,
        avgPrice: 0,
        proceeds: 0,
      };
    }

    return {
      success: true,
      mode: "market",
      sharesSold,
      avgPrice: proceeds / sharesSold,
      proceeds,
    };
  } catch (err) {
    logger.error(`[Sell] FAK order failed: ${err}`);
    return {
      success: false,
      mode: "market",
      sharesSold: 0,
      avgPrice: 0,
      proceeds: 0,
    };
  }
}

export async function getOpenOrders(): Promise<OpenOrderView[]> {
  try {
    const client = await getClobClient();
    const orders = await client.getOpenOrders();
    return (orders || []).map((o) => ({
      orderId: o.id,
      tokenId: o.asset_id,
      side: o.side,
      price: Number.parseFloat(o.price),
      originalSize: Number.parseFloat(o.original_size),
      sizeMatched: Number.parseFloat(o.size_matched),
      outcome: o.outcome,
    }));
  } catch (err) {
    logger.error(`[Orders] Error fetching open orders: ${err}`);
    return [];
  }
}

export async function cancelOpenOrder(orderId: string): Promise<boolean> {
  try {
    const client = await getClobClient();
    const result = await client.cancelOrder({ orderID: orderId });
    logger.info(`[Orders] Cancel ${orderId}: ${JSON.stringify(result)}`);
    return true;
  } catch (err) {
    logger.error(`[Orders] Cancel failed: ${err}`);
    return false;
  }
}
