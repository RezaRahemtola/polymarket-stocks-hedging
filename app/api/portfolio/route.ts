import { NextResponse } from "next/server";
import axios from "axios";
import { getConfig } from "@/lib/config";
import { getBalance } from "@/lib/trade-client";

export async function GET() {
  const config = getConfig();

  try {
    const [positionsRes, balance] = await Promise.all([
      axios.get("https://data-api.polymarket.com/positions", {
        params: {
          user: config.api.funderAddress,
          limit: 100,
          sizeThreshold: 0.1,
          sortBy: "CURRENT_VALUE",
          sortDirection: "DESC",
        },
        timeout: 10000,
      }),
      getBalance(),
    ]);

    // Filter to only positions with actual value (not resolved/empty)
    const positions = (positionsRes.data || []).filter(
      (p: any) => p.currentValue > 0.01,
    );
    const totalValue = positions.reduce(
      (sum: number, p: any) => sum + (p.currentValue || 0),
      0,
    );

    // Group positions by market for pie chart
    const positionsByMarket = positions.map((p: any) => ({
      title: p.title || "Unknown",
      image: p.icon || p.image || "",
      value: p.currentValue || 0,
      outcome: p.outcome || "",
      avgPrice: p.avgPrice || 0,
    }));

    return NextResponse.json({
      positionsValue: totalValue,
      balance,
      positionCount: positions.length,
      positions: positionsByMarket,
    });
  } catch (err) {
    console.error("[Portfolio] Error fetching:", err);
    return NextResponse.json({
      positionsValue: 0,
      balance: 0,
      positionCount: 0,
    });
  }
}
