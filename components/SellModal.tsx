"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Position, SellPreview } from "@/lib/types";
import { useEffect, useRef, useState } from "react";

interface Props {
  position: Position;
  sellableSize: number;
  onClose: () => void;
  onSuccess: () => void;
}

type Mode = "market" | "limit";

export default function SellModal({
  position,
  sellableSize,
  onClose,
  onSuccess,
}: Props) {
  const [mode, setMode] = useState<Mode>("market");
  const [quantity, setQuantity] = useState(String(sellableSize));
  const [price, setPrice] = useState("");
  const [bestBid, setBestBid] = useState<number | null>(null);
  const [preview, setPreview] = useState<SellPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const priceInitialized = useRef(false);

  const qtyNum = Number.parseFloat(quantity) || 0;
  const priceNum = Number.parseFloat(price) || 0;
  const qtyValid = qtyNum > 0 && qtyNum <= sellableSize;

  // Fetch the book once to seed best bid + default price.
  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch(
          `/api/orderbook/${position.tokenId}?side=sell&shares=${sellableSize}&minPrice=0`,
        );
        const data = await res.json();
        const top = data.orderbook?.bids
          ?.map((b: { price: string }) => Number.parseFloat(b.price))
          .sort((a: number, b: number) => b - a)[0];
        if (top && !priceInitialized.current) {
          setBestBid(top);
          setPrice(top.toFixed(3));
          priceInitialized.current = true;
        }
      } catch {
        /* ignore */
      }
    };
    run();
  }, [position.tokenId, sellableSize]);

  // Market preview: refetch on qty/price change (debounced). Limit: compute locally.
  useEffect(() => {
    if (mode === "limit") {
      setPreview({
        fillableShares: qtyNum,
        proceeds: priceNum * qtyNum,
        avgPrice: priceNum,
      });
      return;
    }
    if (!qtyValid) {
      setPreview(null);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/orderbook/${position.tokenId}?side=sell&shares=${qtyNum}&minPrice=${priceNum}`,
        );
        const data = await res.json();
        setPreview(data.sellPreview);
      } catch {
        setPreview(null);
      }
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [mode, qtyNum, priceNum, qtyValid, position.tokenId]);

  const partialFill =
    mode === "market" &&
    preview != null &&
    preview.fillableShares + 1e-9 < qtyNum;

  const handleExecute = async () => {
    setExecuting(true);
    setResult(null);
    try {
      const res = await fetch("/api/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenId: position.tokenId,
          mode,
          shares: qtyNum,
          price: priceNum,
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
      if (data.success && mode === "market") {
        setResult({
          success: true,
          message: `Sold ${data.sharesSold.toFixed(2)} shares for $${data.proceeds.toFixed(2)} ($${data.avgPrice.toFixed(3)} avg)`,
        });
        onSuccess();
      } else if (data.success && mode === "limit") {
        setResult({ success: true, message: "Limit order placed" });
        onSuccess();
      } else {
        setResult({
          success: false,
          message: data.error || "Sell failed - no shares sold",
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
          <DialogTitle>Sell Position</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <p className="text-sm font-medium">{position.title}</p>
            <p className="text-xs text-muted-foreground">
              {position.outcome} · {sellableSize.toFixed(2)} sellable · now $
              {position.curPrice.toFixed(3)}
            </p>
          </div>

          {/* Mode toggle */}
          <div className="grid grid-cols-2 gap-2">
            {(["market", "limit"] as Mode[]).map((m) => (
              <Button
                key={m}
                variant={mode === m ? "default" : "outline"}
                onClick={() => setMode(m)}
                className="capitalize"
              >
                {m}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground flex justify-between">
                <span>Quantity</span>
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => setQuantity(String(sellableSize))}
                >
                  Max
                </button>
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max={sellableSize}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">
                {mode === "market" ? "Min price" : "Limit price"}
              </label>
              <Input
                type="number"
                step="0.001"
                min="0.001"
                max="0.999"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>

          {!qtyValid && (
            <p className="text-xs text-red-400">
              Quantity must be between 0 and {sellableSize.toFixed(2)}.
            </p>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Loading...
            </p>
          ) : preview ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-secondary/50 rounded">
                <p className="text-xs text-muted-foreground">
                  {mode === "market" ? "You'll receive ≈" : "If filled"}
                </p>
                <p className="font-mono text-primary">
                  ${preview.proceeds.toFixed(2)}
                </p>
              </div>
              <div className="p-3 bg-secondary/50 rounded">
                <p className="text-xs text-muted-foreground">Avg price</p>
                <p className="font-mono">${preview.avgPrice.toFixed(3)}</p>
              </div>
            </div>
          ) : null}

          {partialFill && (
            <p className="text-xs text-yellow-400">
              Only {preview!.fillableShares.toFixed(2)} shares fill at ≥ $
              {priceNum.toFixed(3)}. Lower the min price to fill more.
            </p>
          )}

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
                disabled={
                  executing ||
                  !qtyValid ||
                  (mode === "market" &&
                    (!preview || preview.fillableShares === 0)) ||
                  (mode === "limit" && priceNum <= 0)
                }
                className="flex-1 bg-primary text-primary-foreground"
              >
                {executing ? "Selling..." : "Sell"}
              </Button>
            )}
          </div>
          {bestBid != null && (
            <p className="text-[10px] text-muted-foreground text-center">
              Best bid ${bestBid.toFixed(3)}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
