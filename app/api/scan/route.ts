import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { runScanner } from "@/lib/scanner";
import { saveOpportunities } from "@/lib/persistence";

export async function POST() {
  logger.info("[Scan] Starting scan...");
  try {
    const opportunities = await runScanner();
    saveOpportunities(opportunities);
    logger.info(
      `[Scan] Complete: ${opportunities.length} events, ${opportunities.reduce((sum, o) => sum + o.brackets.length, 0)} brackets`,
    );
    return NextResponse.json({ success: true, count: opportunities.length });
  } catch (err) {
    logger.error(`[Scan] Error: ${err}`);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 },
    );
  }
}
