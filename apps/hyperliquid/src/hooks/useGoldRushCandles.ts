import { GOLDRUSH_CHAIN, IS_GOLDRUSH_ACTIVE, useGoldRushClient } from "../context/GoldRushContext";
import { buildChartOHLCVQuery } from "../queries";
import type { MockCandle } from "../types";
import type { OHLCVTimeframe } from "./useOHLCVStream";
import { useEffect, useRef, useState } from "react";

interface RawChartCandle {
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume_usd?: number;
}

// ---------------------------------------------------------------------------
// Module-level LRU cache: keeps per-coin+timeframe candle history across
// hook re-mounts so the chart can render immediately when switching coins.
// ---------------------------------------------------------------------------
const MAX_HISTORY_ENTRIES = 10;
const candleCache = new Map<string, Map<string, RawChartCandle>>();
const cacheOrder: string[] = []; // insertion-order for LRU eviction

function getCacheKey(coin: string, timeframe: string): string {
    return `${coin}:${timeframe}`;
}

function getOrCreateHistory(key: string): Map<string, RawChartCandle> {
    if (candleCache.has(key)) {
        // Move to most-recently-used position (true LRU)
        const idx = cacheOrder.indexOf(key);
        if (idx !== -1) {
            cacheOrder.splice(idx, 1);
            cacheOrder.push(key);
        }
        return candleCache.get(key)!;
    }
    if (candleCache.size >= MAX_HISTORY_ENTRIES) {
        const oldest = cacheOrder.shift()!;
        candleCache.delete(oldest);
    }
    const history = new Map<string, RawChartCandle>();
    candleCache.set(key, history);
    cacheOrder.push(key);
    return history;
}

function historyToCandles(history: Map<string, RawChartCandle>, limit: number): MockCandle[] {
    return [...history.values()]
        .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1))
        .slice(-limit)
        .map((c) => ({
            time: c.timestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume_usd ?? 0,
        }));
}

/**
 * Subscribes to ohlcvCandlesForToken for a single coin with the interval
 * appropriate for the requested timeframe. Re-subscribes whenever coin or
 * timeframe changes. Accumulates candles by timestamp (upsert) so live
 * single-candle updates extend the history rather than replacing it.
 *
 * `limit` is a display-only concern — changing it does NOT trigger a
 * re-subscription; it is applied as a slice on the sorted output only.
 *
 * A module-level LRU cache (max 10 coin:timeframe entries) preserves history
 * across coin switches so the chart renders cached data immediately while the
 * new subscription warms up.
 *
 * Returns MockCandle[] ready for the chart — empty array when GoldRush has
 * no OHLCV data for this coin.
 */
export function useGoldRushCandles(coin: string | null, limit = 80, timeframe: OHLCVTimeframe = "1h"): MockCandle[] {
    const { client } = useGoldRushClient();

    // Seed initial state from cache so the chart renders immediately on mount /
    // coin change without waiting for the first subscription message.
    const [candles, setCandles] = useState<MockCandle[]>(() => {
        if (!IS_GOLDRUSH_ACTIVE || !coin) return [];
        const cached = candleCache.get(getCacheKey(coin, timeframe));
        return cached && cached.size > 0 ? historyToCandles(cached, limit) : [];
    });

    const historyRef = useRef<Map<string, RawChartCandle>>(new Map());
    // Keep a ref to limit so the stable subscription callback can read it
    // without being listed as a dep (avoids unsub+resub on limit changes).
    const limitRef = useRef(limit);
    limitRef.current = limit;

    useEffect(() => {
        if (!IS_GOLDRUSH_ACTIVE || !client || !coin) {
            setCandles([]);
            return;
        }

        const cacheKey = getCacheKey(coin, timeframe);

        // Point historyRef at the cached Map for this coin:timeframe.
        // If it already has data the chart is already showing it; new messages
        // will upsert into the same Map and keep the view up-to-date.
        historyRef.current = getOrCreateHistory(cacheKey);

        // Render cached data immediately (handles the case where useState
        // initialiser ran before the cache was populated on a prior mount).
        if (historyRef.current.size > 0) {
            setCandles(historyToCandles(historyRef.current, limitRef.current));
        } else {
            setCandles([]);
        }

        const unsub = client.subscribe<{ ohlcvCandlesForToken?: RawChartCandle[] }>(
            { query: buildChartOHLCVQuery(GOLDRUSH_CHAIN, coin, timeframe) },
            {
                next: ({ data }) => {
                    const incoming = data?.ohlcvCandlesForToken;
                    if (!incoming || incoming.length === 0) return;

                    for (const c of incoming) {
                        historyRef.current.set(c.timestamp, c);
                    }

                    // Apply limit as a display slice — no trimming of the cache
                    setCandles(historyToCandles(historyRef.current, limitRef.current));
                },
                error: () => {
                    // OHLCV not available for this coin — chart stays empty
                },
                complete: () => {},
            }
        );

        return () => {
            unsub();
        };
    }, [client, coin, timeframe]); // `limit` intentionally excluded — it is a display concern

    if (!IS_GOLDRUSH_ACTIVE) return [];
    return candles;
}
