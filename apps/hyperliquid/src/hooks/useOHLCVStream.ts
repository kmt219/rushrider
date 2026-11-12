// OHLCV candle data for HYPERCORE_MAINNET is derived from NodeTradesByBlock
// events processed by tradeProcessor into nodeStore.candles1m.
// useCandles reads from nodeStore directly — no separate subscription needed.
//
// This file exists only to export the OHLCVTimeframe type used by DetailView
// and to provide a no-op hook for call sites that still reference it.

export type OHLCVTimeframe = "1s" | "5m" | "1h" | "D";

/** No-op: candles come from useCandles (nodeStore) in all modes. */
export function useOHLCVStream(
    _coin: string | null,
    _timeframe: OHLCVTimeframe = "1s"
): { candles: never[]; loading: false } {
    return { candles: [], loading: false };
}
