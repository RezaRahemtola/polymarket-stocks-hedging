"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ExecutionPreview } from "@/lib/trade-client";
import { BracketOpportunity } from "@/lib/types";
import { useEffect, useState } from "react";

interface Props {
  bracket: BracketOpportunity;
  daysToExpiry: number;
  ticker: string;
  currentStockPrice: number;
  userShares: number;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ApproveModal({
  bracket,
  daysToExpiry,
  ticker,
  currentStockPrice,
  userShares,
  onClose,
  onSuccess,
}: Props) {
  const [maxPrice, setMaxPrice] = useState(bracket.currentNoPrice.toFixed(2));
  const [maxAmount, setMaxAmount] = useState<string>("");
  const [maxAmountEdited, setMaxAmountEdited] = useState(false);
  const [preview, setPreview] = useState<ExecutionPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Only refetch when maxPrice changes, or when user edits maxAmount
  const effectiveMaxAmount = maxAmountEdited ? maxAmount : undefined;

  useEffect(() => {
    const fetchPreview = async () => {
      setLoading(true);
      try {
        let url = `/api/orderbook/${bracket.noTokenId}?maxPrice=${maxPrice}&daysToExpiry=${daysToExpiry}`;
        if (effectiveMaxAmount) url += `&maxAmount=${effectiveMaxAmount}`;
        const res = await fetch(url);
        const data = await res.json();
        setPreview(data.preview);
        // Show available amount in input (without triggering edited state)
        if (!maxAmountEdited && data.preview?.totalCost) {
          setMaxAmount(data.preview.totalCost.toFixed(2));
        }
      } catch {
        setPreview(null);
      }
      setLoading(false);
    };

    const timer = setTimeout(fetchPreview, 300);
    return () => clearTimeout(timer);
  }, [
    maxPrice,
    effectiveMaxAmount,
    bracket.noTokenId,
    daysToExpiry,
    maxAmountEdited,
  ]);

  const handleExecute = async () => {
    setExecuting(true);
    setResult(null);
    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketId: bracket.marketId,
          noTokenId: bracket.noTokenId,
          strikePrice: bracket.strikePrice,
          maxPrice: Number.parseFloat(maxPrice),
          maxAmount: maxAmount ? Number.parseFloat(maxAmount) : undefined,
        }),
      });
      if (res.status === 401) {
        setResult({
          success: false,
          message: "Not authenticated - please login",
        });
        setExecuting(false);
        return;
      }
      const data = await res.json();
      if (data.success) {
        setResult({
          success: true,
          message: `Bought ${data.sharesBought.toFixed(2)} shares @ $${data.avgPrice.toFixed(3)} avg`,
        });
        onSuccess();
      } else {
        setResult({
          success: false,
          message: "Trade failed - no shares bought",
        });
      }
    } catch (err) {
      setResult({
        success: false,
        message: `Error: ${err instanceof Error ? err.message : "Unknown"}`,
      });
    }
    setExecuting(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Execute Trade</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">{bracket.question}</p>

          <div className="grid grid-cols-2 gap-4 p-4 bg-secondary/50 rounded-lg">
            <div>
              <p className="text-xs text-muted-foreground">Strike</p>
              <p className="font-mono font-semibold">
                ${bracket.strikePrice.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Delta</p>
              <p
                className={`font-mono font-semibold ${bracket.delta > 0 ? "text-primary" : "text-destructive"}`}
              >
                {bracket.delta > 0 ? "+" : ""}
                {bracket.delta.toFixed(1)}%
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Max Price</label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max="0.99"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">
                Max Amount ($)
              </label>
              <Input
                type="number"
                step="1"
                min="1"
                value={maxAmount}
                onChange={(e) => {
                  setMaxAmount(e.target.value);
                  setMaxAmountEdited(true);
                }}
                className="font-mono"
              />
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Loading...
            </p>
          ) : preview ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-secondary/50 rounded">
                  <p className="text-xs text-muted-foreground">Shares</p>
                  <p className="font-mono">{preview.shares.toFixed(2)}</p>
                </div>
                <div className="p-3 bg-secondary/50 rounded">
                  <p className="text-xs text-muted-foreground">Cost</p>
                  <p className="font-mono">${preview.totalCost.toFixed(2)}</p>
                </div>
                <div className="p-3 bg-secondary/50 rounded">
                  <p className="text-xs text-muted-foreground">APY</p>
                  <p className="font-mono text-primary">
                    {preview.apy.toFixed(2)}%
                  </p>
                </div>
                <div className="p-3 bg-secondary/50 rounded">
                  <p className="text-xs text-muted-foreground">Profit</p>
                  <p className="font-mono text-primary">
                    ${preview.profit.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Hedge P&L Scenarios */}
              {userShares > 0 && currentStockPrice > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-green-500/10 border border-green-500/20 rounded">
                    <p className="text-[10px] text-muted-foreground uppercase">
                      If {ticker} &lt; ${bracket.strikePrice}
                    </p>
                    <p className="font-mono text-green-400 font-semibold">
                      +${((1 - preview.avgPrice) * preview.shares).toFixed(0)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      bet profit
                    </p>
                  </div>
                  {(() => {
                    const minStockGain =
                      userShares * (bracket.strikePrice - currentStockPrice);
                    const hedgeCostPct =
                      minStockGain > 0
                        ? (preview.totalCost / minStockGain) * 100
                        : 0;
                    return (
                      <div className="p-3 bg-secondary/50 rounded">
                        <p className="text-[10px] text-muted-foreground uppercase">
                          If {ticker} &ge; ${bracket.strikePrice}
                        </p>
                        <p className="font-mono text-muted-foreground font-semibold">
                          {hedgeCostPct.toFixed(1)}%
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          hedge cost
                        </p>
                      </div>
                    );
                  })()}
                </div>
              )}
            </>
          ) : null}

          {result && (
            <div
              className={`p-3 rounded-lg text-sm ${
                result.success
                  ? "bg-green-500/20 text-green-400"
                  : "bg-red-500/20 text-red-400"
              }`}
            >
              {result.message}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              {result?.success ? "Close" : "Cancel"}
            </Button>
            {!result?.success && (
              <Button
                onClick={handleExecute}
                disabled={executing || !preview || preview.shares === 0}
                className="flex-1 bg-primary text-primary-foreground"
              >
                {executing ? "Executing..." : "Execute"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
