export interface BracketOpportunity {
  marketId: string;
  question: string;
  strikePrice: number;
  delta: number;
  currentNoPrice: number;
  currentAPY: number;
  maxNoPrice: number;
  hasOpportunity: boolean;
  score: number;
  noTokenId: string;
}

export interface EventOpportunity {
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  eventImage: string;
  ticker: string;
  currentStockPrice: number;
  endDate: string;
  daysToExpiry: number;
  brackets: BracketOpportunity[];
}

export interface Rejection {
  marketId: string;
  strikePrice: number;
  type: "hard" | "soft";
  createdAt: number;
  expiresAt?: number;
}

export interface OrderbookEntry {
  price: string;
  size: string;
}

export interface Orderbook {
  asks: OrderbookEntry[];
  bids: OrderbookEntry[];
}

export interface Trade {
  id: string;
  marketId: string;
  noTokenId: string;
  strikePrice: number;
  sharesBought: number;
  avgPrice: number;
  totalCost: number;
  executedAt: number;
}
