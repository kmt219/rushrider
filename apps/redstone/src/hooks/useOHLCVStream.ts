/**
 * useOHLCVStream — subscribes to ohlcvCandlesForPair for a RedStone feed.
 *
 * The WebSocket client is created once and reused across feed/interval
 * switches so only the GraphQL subscription changes.
 *
 * Results are cached per feedSymbol:interval with a 5-min TTL so
 * revisiting a feed is instant.
 */
import { createHardenedClient, stringifyError } from "../lib/wsClient";
import { buildOHLCVQuery } from "../queries";
import type { OHLCVCandle } from "@goldrush-demos/shared-ui";
import { useEffect, useRef, useState } from "react";

interface OHLCVSubscriptionData {
    ohlcvCandlesForPair: OHLCVCandle[];
}

const CHAIN_NAME = "MEGAETH_MAINNET";

/** Map UI interval labels to GraphQL enum values */
const INTERVAL_MAP: Record<string, { interval: string; timeframe: string }> = {
    "1s": { interval: "ONE_SECOND", timeframe: "ONE_MINUTE" },
    "1m": { interval: "ONE_MINUTE", timeframe: "ONE_HOUR" },
    "1h": { interval: "ONE_HOUR", timeframe: "ONE_DAY" },
};

// ---------------------------------------------------------------------------
// Module-level candle cache — survives feed switches for the app lifetime
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
    candles: OHLCVCandle[];
    timestamp: number;
}

const candleCache = new Map<string, CacheEntry>();

function getCacheKey(feedSymbol: string, interval: string) {
    return `${feedSymbol}:${interval}`;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useOHLCVStream(apiKey: string, streamUrl: string, feedSymbol: string, interval: string) {
    const [candles, setCandles] = useState<OHLCVCandle[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Persist the WS client across feed switches
    const clientRef = useRef<ReturnType<typeof createHardenedClient> | null>(null);
    const clientCredsRef = useRef<{ apiKey: string; streamUrl: string } | null>(null);

    // Dispose on unmount
    useEffect(() => {
        return () => {
            clientRef.current?.dispose();
            clientRef.current = null;
            clientCredsRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!apiKey || !streamUrl || !feedSymbol) {
            setCandles([]);
            setIsLoading(false);
            return;
        }

        const params = INTERVAL_MAP[interval];
        if (!params) {
            console.error(`[OHLCV] Unknown interval: ${interval}`);
            setCandles([]);
            setIsLoading(false);
            return;
        }

        // Serve cache immediately
        const cacheKey = getCacheKey(feedSymbol, interval);

        // Evict expired entries when cache grows large
        if (candleCache.size > 100) {
            const now = Date.now();
            for (const [k, v] of candleCache) if (now - v.timestamp > CACHE_TTL_MS) candleCache.delete(k);
        }

        const cached = candleCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
            setCandles(cached.candles);
            setIsLoading(false);
        } else {
            setIsLoading(true);
        }

        // Create client lazily; recreate only when connection parameters change
        if (
            !clientRef.current ||
            clientCredsRef.current?.apiKey !== apiKey ||
            clientCredsRef.current?.streamUrl !== streamUrl
        ) {
            clientRef.current?.dispose();
            clientRef.current = createHardenedClient({
                url: streamUrl,
                apiKey,
                label: "OHLCV",
                onConnected: () => setIsConnected(true),
                onClosed: () => setIsConnected(false),
                onError: () => {},
            });
            clientCredsRef.current = { apiKey, streamUrl };
        }

        const client = clientRef.current;
        let cancelled = false;
        let initialized = false;

        const query = buildOHLCVQuery(CHAIN_NAME, feedSymbol, params.interval, params.timeframe);

        const unsub = client.subscribe<OHLCVSubscriptionData>(
            { query },
            {
                next: (result) => {
                    if (cancelled) return;

                    const incoming = result.data?.ohlcvCandlesForPair;
                    if (!incoming || incoming.length === 0) return;

                    if (!initialized) {
                        // First message: full historical snapshot
                        initialized = true;
                        const sorted = [...incoming].sort(
                            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                        );
                        candleCache.set(cacheKey, { candles: sorted, timestamp: Date.now() });
                        setCandles(sorted);
                    } else {
                        // Subsequent messages: update/append the rightmost candle
                        setCandles((prev) => {
                            const updated = [...prev];
                            for (const candle of incoming) {
                                const lastIdx = updated.length - 1;
                                if (lastIdx >= 0 && updated[lastIdx]!.timestamp === candle.timestamp) {
                                    updated[lastIdx] = candle;
                                } else {
                                    updated.push(candle);
                                }
                            }
                            candleCache.set(cacheKey, { candles: updated, timestamp: Date.now() });
                            return updated;
                        });
                    }
                    setIsLoading(false);
                },
                error: (err) => {
                    if (!cancelled) {
                        console.error(`[OHLCV] Subscription error:\n${stringifyError(err)}`);
                    }
                },
                complete: () => {},
            }
        );

        return () => {
            cancelled = true;
            unsub();
        };
    }, [apiKey, streamUrl, feedSymbol, interval]);

    return { candles, isConnected, isLoading };
}
