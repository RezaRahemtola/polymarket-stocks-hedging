import { NextResponse } from "next/server";
import axios from "axios";
import { getConfig } from "@/lib/config";
import { logger } from "@/lib/logger";
import { getBalance } from "@/lib/trade-client";

interface PolymarketPosition {
  current_value: number;
  title?: string;
  icon?: string;
  outcome?: string;
  avg_price?: number;
  current_price?: number;
  token_id?: string;
  current_size?: number;
  unrealized_pnl?: number;
  percent_pnl?: number;
  redeemable?: boolean;
}

// Data API v2 serves one lifecycle status per call; held positions are OPEN plus REDEEMABLE.
async function fetchPositions(
  user: string,
  status: "OPEN" | "REDEEMABLE",
): Promise<PolymarketPosition[]> {
  const res = await axios.get("https://data-api.polymarket.com/v2/positions", {
    params: {
      user,
      status,
      limit: 100,
      filter_type: "TOKENS",
      filter_amount: 0.1,
      sort_by: "CURRENT_VALUE",
      sort_direction: "DESC",
    },
    timeout: 10000,
  });
  return (res.data?.data || []) as PolymarketPosition[];
}

export async function GET() {
  const config = getConfig();

  try {
    const [positionsRes, balanceRes] = await Promise.allSettled([
      Promise.all([
        fetchPositions(config.api.funderAddress, "OPEN"),
        fetchPositions(config.api.funderAddress, "REDEEMABLE"),
      ]).then(([open, redeemable]) => [...open, ...redeemable]),
      getBalance(),
    ]);

    if (positionsRes.status === "rejected") {
      logger.error(
        `[Portfolio] Error fetching positions: ${positionsRes.reason}`,
      );
    }
    if (balanceRes.status === "rejected") {
      logger.error(`[Portfolio] Error fetching balance: ${balanceRes.reason}`);
    }

    const rawPositions =
      positionsRes.status === "fulfilled" ? positionsRes.value : [];
    const balance = balanceRes.status === "fulfilled" ? balanceRes.value : 0;

    // Filter to only positions with actual value (not resolved/empty)
    const positions = rawPositions.filter((p) => p.current_value > 0.01);
    const totalValue = positions.reduce(
      (sum, p) => sum + (p.current_value || 0),
      0,
    );

    // Group positions by market for pie chart
    const positionsByMarket = positions.map((p) => ({
      title: p.title || "Unknown",
      image: p.icon || "",
      value: p.current_value || 0,
      outcome: p.outcome || "",
      avgPrice: p.avg_price || 0,
      curPrice: p.current_price || 0,
      tokenId: p.token_id || "",
      size: p.current_size || 0,
      cashPnl: p.unrealized_pnl || 0,
      percentPnl: p.percent_pnl || 0,
      redeemable: p.redeemable || false,
    }));

    return NextResponse.json({
      positionsValue: totalValue,
      balance,
      positionCount: positions.length,
      positions: positionsByMarket,
    });
  } catch (err) {
    logger.error(`[Portfolio] Error fetching: ${err}`);
    return NextResponse.json({
      positionsValue: 0,
      balance: 0,
      positionCount: 0,
    });
  }
}
