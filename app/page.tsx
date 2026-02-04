"use client";

import ApproveModal from "@/components/ApproveModal";
import LoginModal from "@/components/LoginModal";
import PositionsPieChart from "@/components/PositionsPieChart";
import RejectModal from "@/components/RejectModal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useHoldingsStore } from "@/lib/stores/holdings";
import { BracketOpportunity, EventOpportunity } from "@/lib/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";

type SortKey =
  | "market"
  | "strike"
  | "delta"
  | "noPrice"
  | "apy"
  | "score"
  | "expires";
type SortDir = "asc" | "desc";

export default function Home() {
  const queryClient = useQueryClient();
  const { holdings, setHolding } = useHoldingsStore();
  const [selectedBracket, setSelectedBracket] = useState<{
    bracket: BracketOpportunity;
    daysToExpiry: number;
  } | null>(null);
  const [modalType, setModalType] = useState<"approve" | "reject" | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [pendingTradeBracket, setPendingTradeBracket] = useState<{
    bracket: BracketOpportunity & { event: EventOpportunity };
    daysToExpiry: number;
  } | null>(null);
  const [pendingSkipBracket, setPendingSkipBracket] = useState<{
    bracket: BracketOpportunity & { event: EventOpportunity };
    daysToExpiry: number;
  } | null>(null);

  const { data: auth, refetch: refetchAuth } = useQuery<{
    authenticated: boolean;
    readonlyMode: boolean;
  }>({
    queryKey: ["auth"],
    queryFn: async () => {
      const res = await fetch("/api/auth");
      return res.json();
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await fetch("/api/auth", { method: "DELETE" });
    },
    onSuccess: () => refetchAuth(),
  });

  const { data: opportunities, isLoading } = useQuery<EventOpportunity[]>({
    queryKey: ["opportunities"],
    queryFn: async () => {
      const res = await fetch("/api/opportunities");
      return res.json();
    },
  });

  const { data: portfolio } = useQuery<{
    positionsValue: number;
    balance: number;
    positionCount: number;
    positions: {
      title: string;
      image: string;
      value: number;
      outcome: string;
      avgPrice: number;
      curPrice: number;
    }[];
  }>({
    queryKey: ["portfolio"],
    queryFn: async () => {
      const res = await fetch("/api/portfolio");
      return res.json();
    },
    refetchInterval: 60000, // refresh every minute
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/scan", { method: "POST" });
      if (!res.ok) throw new Error(`Scan failed: ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    },
    onError: (err) => {
      console.error("Scan error:", err);
    },
  });

  const refreshAfterTrade = () => {
    queryClient.invalidateQueries({ queryKey: ["portfolio"] });
    scanMutation.mutate();
  };

  const uniqueTickers = useMemo(() => {
    if (!opportunities) return [];
    const tickerMap = new Map<string, { price: number; image: string }>();
    opportunities.forEach((o) => {
      if (o.ticker && !tickerMap.has(o.ticker)) {
        tickerMap.set(o.ticker, {
          price: o.currentStockPrice,
          image: o.eventImage,
        });
      }
    });
    return Array.from(tickerMap.entries()).map(([ticker, data]) => ({
      ticker,
      price: data.price,
      image: data.image,
    }));
  }, [opportunities]);

  const allBrackets = useMemo(() => {
    const brackets =
      opportunities?.flatMap((o) =>
        o.brackets.map((b) => ({ ...b, event: o })),
      ) || [];

    return brackets.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "market":
          cmp = a.event.eventTitle.localeCompare(b.event.eventTitle);
          break;
        case "strike":
          cmp = a.strikePrice - b.strikePrice;
          break;
        case "delta":
          cmp = Math.abs(a.delta) - Math.abs(b.delta);
          break;
        case "noPrice":
          cmp = a.currentNoPrice - b.currentNoPrice;
          break;
        case "apy":
          cmp = a.currentAPY - b.currentAPY;
          break;
        case "score":
          cmp = a.score - b.score;
          break;
        case "expires":
          cmp = a.event.daysToExpiry - b.event.daysToExpiry;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [opportunities, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const renderSortIcon = (k: SortKey) =>
    sortKey === k ? (
      <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
    ) : null;

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6">
      {/* Readonly Banner */}
      {auth?.readonlyMode && !auth?.authenticated && (
        <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-400">
          Readonly mode — login to trade or skip opportunities
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h1 className="text-lg md:text-xl font-semibold">
          Polymarket Opportunities
        </h1>
        <div className="flex gap-2 w-full sm:w-auto">
          {auth?.authenticated ? (
            <Button
              variant="outline"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              className="flex-1 sm:flex-none"
            >
              Logout
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => setShowLoginModal(true)}
              className="flex-1 sm:flex-none"
            >
              Login
            </Button>
          )}
          <Button
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
            className="flex-1 sm:flex-none"
          >
            {scanMutation.isPending ? "Scanning..." : "Scan"}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 mb-6">
        <Card className="p-3 md:p-4">
          <p className="text-[10px] md:text-xs text-muted-foreground uppercase tracking-wide">
            Positions ({portfolio?.positionCount || 0})
          </p>
          <p className="text-lg md:text-2xl font-semibold font-mono mt-1">
            ${(portfolio?.positionsValue || 0).toFixed(2)}
          </p>
        </Card>
        <Card className="p-3 md:p-4">
          <p className="text-[10px] md:text-xs text-muted-foreground uppercase tracking-wide">
            Available
          </p>
          <p className="text-lg md:text-2xl font-semibold font-mono mt-1">
            ${(portfolio?.balance || 0).toFixed(2)}
          </p>
        </Card>
        <Card className="p-3 md:p-4 col-span-2 md:col-span-1">
          <p className="text-[10px] md:text-xs text-muted-foreground uppercase tracking-wide">
            Opportunities
          </p>
          <p className="text-lg md:text-2xl font-semibold font-mono mt-1">
            {allBrackets.filter((b) => b.hasOpportunity).length}
            <span className="text-sm text-muted-foreground ml-1">
              / {allBrackets.length}
            </span>
          </p>
        </Card>
      </div>

      {/* Portfolio Breakdown Card */}
      {(portfolio?.positions?.length || uniqueTickers.length > 0) && (
        <Card className="p-4 mb-6">
          <div className="flex flex-col lg:flex-row lg:gap-8">
            {/* Polymarket Portfolio */}
            {portfolio?.positions && portfolio.positions.length > 0 && (
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-4">
                  Polymarket Portfolio
                </p>
                <PositionsPieChart positions={portfolio.positions} />
              </div>
            )}

            {/* Stock Holdings */}
            {uniqueTickers.length > 0 && (
              <div className="flex-1 min-w-0 mt-6 lg:mt-0 lg:border-l lg:border-border lg:pl-8">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-4">
                  Stock Holdings
                </p>
                <div className="space-y-3">
                  {uniqueTickers.map(({ ticker, price, image }) => {
                    const holdingValue = (holdings[ticker] || 0) * price;
                    return (
                      <div
                        key={ticker}
                        className="flex items-center gap-3 p-2 rounded-lg bg-secondary/30"
                      >
                        {image ? (
                          <Image
                            src={image}
                            alt={ticker}
                            width={32}
                            height={32}
                            className="rounded-md"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center text-xs font-bold">
                            {ticker.slice(0, 2)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{ticker}</p>
                          <p className="text-xs text-muted-foreground">
                            ${price.toFixed(2)}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={holdings[ticker] || ""}
                            onChange={(e) =>
                              setHolding(ticker, Number(e.target.value) || 0)
                            }
                            className="font-mono h-8 w-24 text-right"
                          />
                          {holdingValue > 0 && (
                            <p className="text-xs text-muted-foreground">
                              ${holdingValue.toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-20 text-muted-foreground">
          Loading...
        </div>
      ) : allBrackets.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">No opportunities found</p>
          <p className="text-sm text-muted-foreground/70 mt-2">
            Click Scan Now to search
          </p>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => toggleSort("market")}
                >
                  Market
                  {renderSortIcon("market")}
                </TableHead>
                <TableHead
                  className="text-right cursor-pointer select-none"
                  onClick={() => toggleSort("strike")}
                >
                  Strike
                  {renderSortIcon("strike")}
                </TableHead>
                <TableHead
                  className="text-right cursor-pointer select-none"
                  onClick={() => toggleSort("delta")}
                >
                  Delta
                  {renderSortIcon("delta")}
                </TableHead>
                <TableHead
                  className="text-right cursor-pointer select-none"
                  onClick={() => toggleSort("noPrice")}
                >
                  NO Price
                  {renderSortIcon("noPrice")}
                </TableHead>
                <TableHead
                  className="text-right cursor-pointer select-none"
                  onClick={() => toggleSort("apy")}
                >
                  APY
                  {renderSortIcon("apy")}
                </TableHead>
                <TableHead
                  className="text-center cursor-pointer select-none"
                  onClick={() => toggleSort("score")}
                >
                  Score
                  {renderSortIcon("score")}
                </TableHead>
                <TableHead
                  className="text-right cursor-pointer select-none"
                  onClick={() => toggleSort("expires")}
                >
                  Expires
                  {renderSortIcon("expires")}
                </TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allBrackets.map((b) => (
                <TableRow
                  key={b.marketId}
                  className={b.hasOpportunity ? "bg-green-500/5" : ""}
                >
                  <TableCell>
                    <a
                      href={`https://polymarket.com/event/${b.event.eventSlug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                    >
                      {b.event.eventImage && (
                        <Image
                          src={b.event.eventImage}
                          alt=""
                          width={40}
                          height={40}
                          className="rounded-lg object-cover flex-shrink-0"
                        />
                      )}
                      <span className="font-medium">{b.event.eventTitle}</span>
                    </a>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    ${b.strikePrice.toLocaleString()}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono ${b.delta > 0 ? "text-green-500" : "text-red-500"}`}
                  >
                    {b.delta > 0 ? "+" : ""}
                    {b.delta.toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    ${b.currentNoPrice.toFixed(3)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono ${b.currentAPY >= 100 ? "text-green-500" : ""}`}
                  >
                    {b.currentAPY.toFixed(0)}%
                  </TableCell>
                  <TableCell className="text-center">
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-mono font-semibold ${
                        b.hasOpportunity
                          ? "bg-green-500/20 text-green-500"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {b.score}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {b.event.daysToExpiry.toFixed(0)}d
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => {
                          if (!auth?.authenticated) {
                            setPendingTradeBracket({
                              bracket: b,
                              daysToExpiry: b.event.daysToExpiry,
                            });
                            setShowLoginModal(true);
                            return;
                          }
                          setSelectedBracket({
                            bracket: b,
                            daysToExpiry: b.event.daysToExpiry,
                          });
                          setModalType("approve");
                        }}
                      >
                        Trade
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (auth?.readonlyMode && !auth?.authenticated) {
                            setPendingSkipBracket({
                              bracket: b,
                              daysToExpiry: b.event.daysToExpiry,
                            });
                            setShowLoginModal(true);
                            return;
                          }
                          setSelectedBracket({
                            bracket: b,
                            daysToExpiry: b.event.daysToExpiry,
                          });
                          setModalType("reject");
                        }}
                      >
                        Skip
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {selectedBracket && modalType === "approve" && (
        <ApproveModal
          bracket={selectedBracket.bracket}
          daysToExpiry={selectedBracket.daysToExpiry}
          ticker={
            (
              selectedBracket.bracket as BracketOpportunity & {
                event: EventOpportunity;
              }
            ).event.ticker
          }
          currentStockPrice={
            (
              selectedBracket.bracket as BracketOpportunity & {
                event: EventOpportunity;
              }
            ).event.currentStockPrice
          }
          userShares={
            holdings[
              (
                selectedBracket.bracket as BracketOpportunity & {
                  event: EventOpportunity;
                }
              ).event.ticker
            ] || 0
          }
          onClose={() => {
            setSelectedBracket(null);
            setModalType(null);
          }}
          onSuccess={refreshAfterTrade}
        />
      )}

      {selectedBracket && modalType === "reject" && (
        <RejectModal
          bracket={selectedBracket.bracket}
          onClose={() => {
            setSelectedBracket(null);
            setModalType(null);
          }}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["opportunities"] });
          }}
        />
      )}

      {showLoginModal && (
        <LoginModal
          onClose={() => {
            setShowLoginModal(false);
            setPendingTradeBracket(null);
            setPendingSkipBracket(null);
          }}
          onSuccess={() => {
            refetchAuth();
            if (pendingTradeBracket) {
              setSelectedBracket(pendingTradeBracket);
              setModalType("approve");
              setPendingTradeBracket(null);
            }
            if (pendingSkipBracket) {
              setSelectedBracket(pendingSkipBracket);
              setModalType("reject");
              setPendingSkipBracket(null);
            }
          }}
        />
      )}
    </div>
  );
}
