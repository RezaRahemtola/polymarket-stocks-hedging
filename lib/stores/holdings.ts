import { create } from "zustand";
import { persist } from "zustand/middleware";

interface HoldingsStore {
  holdings: Record<string, number>; // { GOOGL: 100, AMZN: 50 }
  setHolding: (ticker: string, shares: number) => void;
}

export const useHoldingsStore = create<HoldingsStore>()(
  persist(
    (set) => ({
      holdings: {},
      setHolding: (ticker, shares) =>
        set((state) => ({
          holdings: { ...state.holdings, [ticker]: shares },
        })),
    }),
    { name: "stock-holdings" },
  ),
);
