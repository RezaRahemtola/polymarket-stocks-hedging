import { NextResponse } from "next/server";
import { executeTrade } from "@/lib/trade-client";
import { saveTrade } from "@/lib/persistence";
import { isAuthenticated } from "@/lib/auth";
import { Trade } from "@/lib/types";

export async function POST(request: Request) {
  // Check authentication
  if (!(await isAuthenticated())) {
    console.log("[Trade] Error: Not authenticated");
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { marketId, noTokenId, strikePrice, maxPrice, maxAmount } =
    await request.json();

  console.log(
    `[Trade] Executing: strike=$${strikePrice} maxPrice=${maxPrice} maxAmount=${maxAmount || "unlimited"}`,
  );

  if (!noTokenId || !maxPrice) {
    console.log("[Trade] Error: Missing required fields");
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  try {
    const result = await executeTrade(noTokenId, maxPrice, maxAmount);

    if (result.success) {
      const trade: Trade = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        marketId,
        noTokenId,
        strikePrice,
        sharesBought: result.sharesBought,
        avgPrice: result.avgPrice,
        totalCost: result.totalCost,
        executedAt: Date.now(),
      };
      saveTrade(trade);
      console.log(
        `[Trade] Success: ${result.sharesBought.toFixed(2)} shares @ $${result.avgPrice.toFixed(3)} = $${result.totalCost.toFixed(2)}`,
      );
    } else {
      console.log("[Trade] Failed: No shares bought");
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[Trade] Error:", err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 },
    );
  }
}
