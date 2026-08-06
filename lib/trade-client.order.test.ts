import { describe, it, expect, vi, beforeEach } from "vitest";

// Polymarket tightens a market's tick as its price nears 0/1. `serverTick` is
// the live value; each fake client caches it on first use, exactly like the SDK.
const exchange = vi.hoisted(() => ({ serverTick: "0.01" }));

vi.mock("@polymarket/clob-client-v2", () => ({
  ClobClient: class {
    private cachedTick: string | null = null;

    async createOrDeriveApiKey() {
      return { key: "k", secret: "s", passphrase: "p" };
    }

    async createAndPostMarketOrder(order: { price: number; amount: number }) {
      this.cachedTick ??= exchange.serverTick;
      const tick = Number.parseFloat(this.cachedTick);
      if (order.price < tick || order.price > 1 - tick) {
        throw new Error(
          `invalid price (${order.price}), min: ${tick} - max: ${1 - tick}`,
        );
      }
      const decimals = Math.round(-Math.log10(tick));
      const filled = Math.floor(order.price * 10 ** decimals) / 10 ** decimals;
      return {
        success: true,
        makingAmount: String(order.amount),
        takingAmount: String(order.amount / filled),
      };
    }
  },
  AssetType: { COLLATERAL: "COLLATERAL" },
  Chain: { POLYGON: 137 },
  OrderType: { FAK: "FAK", GTC: "GTC" },
  Side: { BUY: "BUY", SELL: "SELL" },
}));

vi.mock("ethers", () => ({ Wallet: class {} }));

import { executeTrade } from "./trade-client";

describe("executeTrade tick-size freshness", () => {
  beforeEach(() => {
    exchange.serverTick = "0.01";
  });

  it("uses the current tick after the market switches to 0.001", async () => {
    const coarse = await executeTrade("token-1", 0.98, 10);
    expect(coarse.success).toBe(true);

    exchange.serverTick = "0.001";

    const fine = await executeTrade("token-1", 0.993, 10);
    expect(fine.error).toBeUndefined();
    expect(fine.success).toBe(true);
  });

  it("does not round a 3-decimal limit down off the book", async () => {
    exchange.serverTick = "0.001";

    const result = await executeTrade("token-1", 0.988, 10);
    expect(result.success).toBe(true);
    expect(result.avgPrice).toBeCloseTo(0.988, 6);
  });
});
