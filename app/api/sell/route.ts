import { NextResponse } from "next/server";
import { executeSell } from "@/lib/trade-client";
import { isAuthenticated } from "@/lib/auth";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    logger.warn("[Sell] Not authenticated");
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { tokenId, mode, shares, price } = await request.json();

  if (mode !== "market" && mode !== "limit") {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }
  if (!tokenId || !shares || shares <= 0) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }
  if (mode === "limit" && !price) {
    return NextResponse.json(
      { error: "Limit price required" },
      { status: 400 },
    );
  }

  logger.info(
    `[Sell] ${mode} ${shares} shares of ${tokenId} @ ${price ?? "mkt"}`,
  );

  try {
    const result = await executeSell({
      tokenId,
      mode,
      shares: Number(shares),
      price: price ? Number(price) : 0,
    });
    logger.info(`[Sell] Result: ${JSON.stringify(result)}`);
    return NextResponse.json(result);
  } catch (err) {
    logger.error(`[Sell] Error: ${err}`);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 },
    );
  }
}
