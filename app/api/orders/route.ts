import { NextResponse } from "next/server";
import { getOpenOrders, cancelOpenOrder } from "@/lib/trade-client";
import { isAuthenticated } from "@/lib/auth";
import { logger } from "@/lib/logger";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const orders = await getOpenOrders();
  return NextResponse.json({ orders });
}

export async function DELETE(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { orderId } = await request.json();
  if (!orderId) {
    return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
  }
  logger.info(`[Orders] Cancelling ${orderId}`);
  const success = await cancelOpenOrder(orderId);
  return NextResponse.json({ success });
}
