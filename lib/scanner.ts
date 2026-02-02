import axios from "axios";
import { getConfig } from "./config";
import { BracketOpportunity, EventOpportunity } from "./types";

interface PolymarketEvent {
  id: string;
  title: string;
  slug?: string;
  image?: string;
  endDate: string;
  markets?: PolymarketMarket[];
}

interface PolymarketMarket {
  id: string;
  question?: string;
  groupItemTitle?: string;
  clobTokenIds?: string;
}

interface Orderbook {
  asks?: { price: string; size: string }[];
}

interface ParsedAsk {
  price: number;
  size: number;
}

// Yahoo Finance
async function getStockPrice(ticker: string): Promise<number | null> {
  try {
    const res = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`,
      { headers: { "User-Agent": "Mozilla/5.0" } },
    );
    return res.data?.chart?.result?.[0]?.meta?.regularMarketPrice || null;
  } catch {
    return null;
  }
}

// Polymarket search
async function searchEvents(ticker: string): Promise<PolymarketEvent[]> {
  const config = getConfig();
  try {
    const res = await axios.get(`${config.api.gammaApiUrl}/public-search`, {
      params: { q: ticker, limit_per_type: 50, events_status: "active" },
      timeout: 10000,
    });
    return res.data?.events || [];
  } catch {
    return [];
  }
}

// Orderbook
async function getOrderbook(tokenId: string): Promise<Orderbook | null> {
  const config = getConfig();
  try {
    const res = await axios.get(`${config.api.clobApiUrl}/book`, {
      params: { token_id: tokenId },
      timeout: 5000,
    });
    return res.data;
  } catch {
    return null;
  }
}

function parseStrikePrice(question: string): number | null {
  const match = question.match(/\$([\d,]+(?:\.\d+)?)/);
  if (!match?.[1]) return null;
  return parseFloat(match[1].replace(/,/g, ""));
}

function extractNoTokenId(market: PolymarketMarket): string | null {
  if (market.clobTokenIds) {
    try {
      const tokenIds = JSON.parse(market.clobTokenIds);
      return tokenIds[1] || null;
    } catch {
      return null;
    }
  }
  return null;
}

function getBestAsk(orderbook: Orderbook | null): number | null {
  const asks = orderbook?.asks;
  if (!asks || asks.length === 0) return null;

  // Sort by price ascending
  const sorted: ParsedAsk[] = asks
    .map((a) => ({ price: parseFloat(a.price), size: parseFloat(a.size) }))
    .filter((a) => !isNaN(a.price) && !isNaN(a.size))
    .sort((a, b) => a.price - b.price);

  // Find first ask with purchasable amount (size >= 1 share, or total >= $1)
  for (const ask of sorted) {
    if (ask.size >= 1 || ask.price * ask.size >= 1) {
      return ask.price;
    }
  }
  return null;
}

function calculateAPY(noPrice: number, daysToExpiry: number): number {
  if (noPrice >= 1 || noPrice <= 0 || daysToExpiry <= 0) return 0;
  const yieldPct = 1 - noPrice;
  return (yieldPct / noPrice) * (365 / daysToExpiry) * 100;
}

function calculateMaxNoPrice(
  opportunityAPY: number,
  daysToExpiry: number,
): number {
  const factor = (opportunityAPY * daysToExpiry) / 36500;
  return 1 / (1 + factor);
}

function calculateScore(apy: number, delta: number): number {
  // APY component: 0-30 points (capped at 200%)
  const apyScore = (Math.min(apy, 200) / 200) * 30;

  // Delta component: 0-70 points
  // Higher absolute delta = higher score (further from price = safer NO bet)
  const absDelta = Math.abs(delta);
  const deltaScore = (Math.min(absDelta, 50) / 50) * 70;

  return Math.round(apyScore + deltaScore);
}

export async function runScanner(): Promise<EventOpportunity[]> {
  const config = getConfig();
  const allOpportunities: EventOpportunity[] = [];

  for (const ticker of config.stocks) {
    const stockPrice = await getStockPrice(ticker);
    if (!stockPrice) continue;

    const events = await searchEvents(ticker);
    const seenEventIds = new Set<string>();

    for (const event of events) {
      if (seenEventIds.has(event.id)) continue;

      const title = (event.title || "").toUpperCase();
      if (!title.includes(ticker.toUpperCase())) continue;
      if (
        !title.includes("PRICE") &&
        !title.includes("ABOVE") &&
        !title.includes("HIT")
      )
        continue;

      const endDate = new Date(event.endDate);
      const daysToExpiry = Math.max(
        (endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        0.01,
      );
      const maxNoPrice = calculateMaxNoPrice(
        config.opportunities.opportunityAPY,
        daysToExpiry,
      );

      const isAboveMarket = title.includes("ABOVE");
      const brackets: BracketOpportunity[] = [];

      for (const market of event.markets || []) {
        const strike = parseStrikePrice(
          market.question || market.groupItemTitle || "",
        );
        const noTokenId = extractNoTokenId(market);
        if (!strike || !noTokenId) continue;

        const orderbook = await getOrderbook(noTokenId);
        const currentNoPrice = getBestAsk(orderbook);
        if (currentNoPrice === null) continue;

        const delta = ((strike - stockPrice) / stockPrice) * 100;

        // Filter: minDelta and above-market logic
        if (Math.abs(delta) < config.opportunities.minDeltaPercent) continue;
        if (isAboveMarket && delta < 0) continue;

        const currentAPY = calculateAPY(currentNoPrice, daysToExpiry);

        // Filter: minimum display APY cutoff
        if (currentAPY < config.opportunities.minDisplayAPY) continue;

        const hasOpportunity = currentNoPrice <= maxNoPrice;
        const score = calculateScore(currentAPY, delta);

        brackets.push({
          marketId: market.id,
          question: market.question || market.groupItemTitle || "",
          strikePrice: strike,
          delta,
          currentNoPrice,
          currentAPY,
          maxNoPrice,
          hasOpportunity,
          score,
          noTokenId,
        });
      }

      if (brackets.length > 0) {
        seenEventIds.add(event.id);
        brackets.sort((a, b) => b.score - a.score);
        allOpportunities.push({
          eventId: event.id,
          eventSlug: event.slug || event.id,
          eventTitle: event.title,
          eventImage: event.image || "",
          ticker,
          currentStockPrice: stockPrice,
          endDate: endDate.toISOString(),
          daysToExpiry,
          brackets,
        });
      }
    }
  }

  return allOpportunities;
}
