import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { addRejection } from "@/lib/persistence";
import { getConfig } from "@/lib/config";
import { Rejection } from "@/lib/types";

const AUTH_COOKIE = "trade_auth";

export async function POST(request: Request) {
  const readonlyMode = process.env.READONLY_MODE !== "false";

  if (readonlyMode) {
    const cookieStore = await cookies();
    const authCookie = cookieStore.get(AUTH_COOKIE);
    if (authCookie?.value !== "authenticated") {
      return NextResponse.json(
        { error: "Authentication required in readonly mode" },
        { status: 401 },
      );
    }
  }

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
