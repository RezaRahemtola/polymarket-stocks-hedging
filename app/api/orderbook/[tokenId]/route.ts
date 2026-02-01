import { NextResponse } from "next/server";
import { getOrderbook, calculateExecutionPreview } from "@/lib/trade-client";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tokenId: string }> },
) {
  const { tokenId } = await params;
  const url = new URL(request.url);
  const maxPriceParam = url.searchParams.get("maxPrice");
  const daysParam = url.searchParams.get("daysToExpiry");
  const maxAmountParam = url.searchParams.get("maxAmount");

  const orderbook = await getOrderbook(tokenId);
  if (!orderbook) {
    return NextResponse.json(
      { error: "Failed to fetch orderbook" },
      { status: 500 },
    );
  }

  const maxPrice = maxPriceParam ? parseFloat(maxPriceParam) : 1;
  const daysToExpiry = daysParam ? parseFloat(daysParam) : 30;
  const maxAmount = maxAmountParam ? parseFloat(maxAmountParam) : undefined;

  const preview = calculateExecutionPreview(
    orderbook,
    maxPrice,
    daysToExpiry,
    maxAmount,
  );

  return NextResponse.json({ orderbook, preview });
}
