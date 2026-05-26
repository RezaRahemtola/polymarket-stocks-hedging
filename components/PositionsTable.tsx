"use client";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OpenOrderView, Position } from "@/lib/types";
import Image from "next/image";

interface Props {
  positions: Position[];
  openOrders: OpenOrderView[];
  sellableFor: (p: Position) => number;
  onSell: (p: Position) => void;
  onCancel: (orderId: string) => void;
  cancelingId: string | null;
}

export default function PositionsTable({
  positions,
  openOrders,
  sellableFor,
  onSell,
  onCancel,
  cancelingId,
}: Props) {
  const sellable = positions.filter(
    (p) => p.tokenId && !p.redeemable && p.size > 0,
  );

  // Join open-order titles from positions by tokenId.
  const titleFor = (tokenId: string) =>
    positions.find((p) => p.tokenId === tokenId)?.title;

  return (
    <div className="mt-6 space-y-6">
      <div className="overflow-x-auto">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead>Position</TableHead>
              <TableHead className="text-right">Shares</TableHead>
              <TableHead className="text-right">Avg</TableHead>
              <TableHead className="text-right">Now</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">PnL</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sellable.map((p) => {
              const avail = sellableFor(p);
              const locked = p.size - avail;
              return (
                <TableRow key={p.tokenId}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {p.image && (
                        <Image
                          src={p.image}
                          alt=""
                          width={28}
                          height={28}
                          className="rounded object-cover flex-shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium truncate max-w-[220px]">
                          {p.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {p.outcome}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {p.size.toFixed(2)}
                    {locked > 0.01 && (
                      <span className="block text-[10px] text-muted-foreground">
                        {avail.toFixed(2)} free
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    ${p.avgPrice.toFixed(3)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    ${p.curPrice.toFixed(3)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    ${p.value.toFixed(2)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono ${p.cashPnl >= 0 ? "text-green-500" : "text-red-500"}`}
                  >
                    {p.cashPnl >= 0 ? "+" : ""}${p.cashPnl.toFixed(2)}
                    <span className="block text-[10px]">
                      {p.percentPnl >= 0 ? "+" : ""}
                      {p.percentPnl.toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      disabled={avail <= 0}
                      onClick={() => onSell(p)}
                    >
                      Sell
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {openOrders.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
            Open Orders
          </p>
          <div className="overflow-x-auto">
            <Table className="min-w-[560px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Market</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Filled</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openOrders.map((o) => (
                  <TableRow key={o.orderId}>
                    <TableCell className="truncate max-w-[220px]">
                      {titleFor(o.tokenId) || o.outcome}
                    </TableCell>
                    <TableCell>{o.side}</TableCell>
                    <TableCell className="text-right font-mono">
                      ${o.price.toFixed(3)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {o.sizeMatched.toFixed(0)}/{o.originalSize.toFixed(0)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={cancelingId === o.orderId}
                        onClick={() => onCancel(o.orderId)}
                      >
                        {cancelingId === o.orderId ? "..." : "Cancel"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
