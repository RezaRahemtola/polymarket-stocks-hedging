import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EventOpportunity, Rejection, Trade } from "./types";

const DATA_DIR = join(process.cwd(), "data");

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

// Opportunities
export function saveOpportunities(opportunities: EventOpportunity[]) {
  ensureDataDir();
  writeFileSync(
    join(DATA_DIR, "opportunities.json"),
    JSON.stringify(opportunities, null, 2),
  );
}

export function loadOpportunities(): EventOpportunity[] {
  const path = join(DATA_DIR, "opportunities.json");
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf-8"));
}

// Rejections
export function saveRejections(rejections: Rejection[]) {
  ensureDataDir();
  writeFileSync(
    join(DATA_DIR, "rejections.json"),
    JSON.stringify(rejections, null, 2),
  );
}

export function loadRejections(): Rejection[] {
  const path = join(DATA_DIR, "rejections.json");
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function addRejection(rejection: Rejection) {
  const rejections = loadRejections();
  rejections.push(rejection);
  saveRejections(rejections);
}

export function isRejected(marketId: string, strikePrice: number): boolean {
  const rejections = loadRejections();
  const now = Date.now();

  return rejections.some((r) => {
    if (r.marketId !== marketId || r.strikePrice !== strikePrice) return false;
    if (r.type === "hard") return true;
    if (r.type === "soft" && r.expiresAt && r.expiresAt > now) return true;
    return false;
  });
}

// Trades
export function saveTrade(trade: Trade) {
  ensureDataDir();
  const path = join(DATA_DIR, "trades.json");
  const trades = existsSync(path)
    ? JSON.parse(readFileSync(path, "utf-8"))
    : [];
  trades.push(trade);
  writeFileSync(path, JSON.stringify(trades, null, 2));
}

export function loadTrades(): Trade[] {
  const path = join(DATA_DIR, "trades.json");
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf-8"));
}
