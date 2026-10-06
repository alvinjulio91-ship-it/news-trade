import { useCallback, useEffect, useState } from "react";
import { requireSupabase, isSupabaseConfigured } from "../lib/supabase";

export type MarketPrice = {
  symbol: string;
  price: number | null;
  change_24h: number | null;
  high_24h: number | null;
  low_24h: number | null;
  volume: number | null;
  updated_at: string;
};

export function useMarketPrices(symbols: string[]) {
  const [prices, setPrices] = useState<Record<string, MarketPrice>>({});
  const [realtime, setRealtime] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const { data, error } = await requireSupabase()
      .from("market_prices")
      .select("symbol,price,change_24h,high_24h,low_24h,volume,updated_at")
      .in("symbol", symbols);

    if (!error && data) {
      setPrices(Object.fromEntries((data as MarketPrice[]).map((row) => [row.symbol, row])));
    }
  }, [symbols]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    void load();

    const channel = requireSupabase()
      .channel("market-prices-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "market_prices" }, () => void load())
      .subscribe((status) => setRealtime(status === "SUBSCRIBED"));

    return () => {
      void requireSupabase().removeChannel(channel);
      setRealtime(false);
    };
  }, [load]);

  return { prices, realtime };
}
