import { NextResponse } from "next/server";
import { addRejection } from "@/lib/persistence";
import { getConfig } from "@/lib/config";
import { Rejection } from "@/lib/types";

export async function POST(request: Request) {
  const { marketId, strikePrice, type } = await request.json();

  if (!marketId || strikePrice === undefined || !type) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  const config = getConfig();
  const rejection: Rejection = {
    marketId,
    strikePrice,
    type,
    createdAt: Date.now(),
    expiresAt:
      type === "soft"
        ? Date.now() + config.rejections.softRejectHours * 60 * 60 * 1000
        : undefined,
  };

  addRejection(rejection);

  return NextResponse.json({ success: true });
}
