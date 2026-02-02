import { runScanner } from "./scanner";
import { saveOpportunities } from "./persistence";
import { getConfig } from "./config";
import { logger } from "./logger";
import { getPositionRedeemer } from "./position-redeemer";

let intervalId: ReturnType<typeof setInterval> | null = null;

export async function runScan() {
  logger.info("[Scheduler] Running scan...");
  try {
    const opportunities = await runScanner();
    saveOpportunities(opportunities);
    logger.info(`[Scheduler] Found ${opportunities.length} events`);
  } catch (err) {
    logger.error(`[Scheduler] Scan failed: ${err}`);
  }

  // Check for redeemable positions
  try {
    const redeemer = getPositionRedeemer();
    await redeemer.checkAndRedeemPositions();
  } catch (err) {
    logger.error(`[Scheduler] Redemption check failed: ${err}`);
  }
}

export function startScheduler() {
  if (intervalId) return;

  const config = getConfig();
  const intervalMs = config.scanner.intervalMinutes * 60 * 1000;

  logger.info(
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
    logger.info("[Scheduler] Stopped");
  }
}
