import { runScanner } from "./scanner";
import { saveOpportunities } from "./persistence";
import { getConfig } from "./config";
import { getPositionRedeemer } from "./position-redeemer";

let intervalId: ReturnType<typeof setInterval> | null = null;

export async function runScan() {
  console.log("[Scheduler] Running scan...");
  try {
    const opportunities = await runScanner();
    saveOpportunities(opportunities);
    console.log(`[Scheduler] Found ${opportunities.length} events`);
  } catch (err) {
    console.error("[Scheduler] Scan failed:", err);
  }

  // Check for redeemable positions
  try {
    const redeemer = getPositionRedeemer();
    await redeemer.checkAndRedeemPositions();
  } catch (err) {
    console.error("[Scheduler] Redemption check failed:", err);
  }
}

export function startScheduler() {
  if (intervalId) return;

  const config = getConfig();
  const intervalMs = config.scanner.intervalMinutes * 60 * 1000;

  console.log(
    `[Scheduler] Starting with ${config.scanner.intervalMinutes}min interval`,
  );

  // Run immediately on start
  runScan();

  // Then run on interval
  intervalId = setInterval(runScan, intervalMs);
}

export function stopScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[Scheduler] Stopped");
  }
}
