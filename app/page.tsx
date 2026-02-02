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
import { BracketOpportunity, EventOpportunity } from "@/lib/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

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
  const [selectedBracket, setSelectedBracket] = useState<{
    bracket: BracketOpportunity;
    daysToExpiry: number;
  } | null>(null);
  const [modalType, setModalType] = useState<"approve" | "reject" | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showLoginModal, setShowLoginModal] = useState(false);

  const { data: auth, refetch: refetchAuth } = useQuery<{ authenticated: boolean }>({
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

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k ? (
      <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
    ) : null;

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          Polymarket Opportunities
        </h1>
        <div className="flex gap-2">
          {auth?.authenticated ? (
            <Button
              variant="outline"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              Logout
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setShowLoginModal(true)}>
              Login
            </Button>
          )}
          <Button
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
          >
            {scanMutation.isPending ? "Scanning..." : "Scan Markets"}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Positions ({portfolio?.positionCount || 0})
          </p>
          <p className="text-2xl font-semibold font-mono mt-1">
            ${(portfolio?.positionsValue || 0).toFixed(2)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Available
          </p>
          <p className="text-2xl font-semibold font-mono mt-1">
            ${(portfolio?.balance || 0).toFixed(2)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Opportunities
          </p>
          <p className="text-2xl font-semibold font-mono mt-1">
            {allBrackets.filter((b) => b.hasOpportunity).length}
            <span className="text-sm text-muted-foreground ml-1">
              / {allBrackets.length}
            </span>
          </p>
        </Card>
      </div>

      {/* Positions Pie Chart */}
      {portfolio?.positions && portfolio.positions.length > 0 && (
        <Card className="p-4 mb-6">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-4">
            Portfolio Breakdown
          </p>
          <PositionsPieChart positions={portfolio.positions} />
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
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => toggleSort("market")}
                >
                  Market
                  <SortIcon k="market" />
                </TableHead>
                <TableHead
                  className="text-right cursor-pointer select-none"
                  onClick={() => toggleSort("strike")}
                >
                  Strike
                  <SortIcon k="strike" />
                </TableHead>
                <TableHead
                  className="text-right cursor-pointer select-none"
                  onClick={() => toggleSort("delta")}
                >
                  Delta
                  <SortIcon k="delta" />
                </TableHead>
                <TableHead
                  className="text-right cursor-pointer select-none"
                  onClick={() => toggleSort("noPrice")}
                >
                  NO Price
                  <SortIcon k="noPrice" />
                </TableHead>
                <TableHead
                  className="text-right cursor-pointer select-none"
                  onClick={() => toggleSort("apy")}
                >
                  APY
                  <SortIcon k="apy" />
                </TableHead>
                <TableHead
                  className="text-center cursor-pointer select-none"
                  onClick={() => toggleSort("score")}
                >
                  Score
                  <SortIcon k="score" />
                </TableHead>
                <TableHead
                  className="text-right cursor-pointer select-none"
                  onClick={() => toggleSort("expires")}
                >
                  Expires
                  <SortIcon k="expires" />
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
                        <img
                          src={b.event.eventImage}
                          alt=""
                          className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
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
          onSuccess={refreshAfterTrade}
        />
      )}

      {showLoginModal && (
        <LoginModal
          onClose={() => setShowLoginModal(false)}
          onSuccess={() => refetchAuth()}
        />
      )}
    </div>
  );
}
