import { HL_INFO_URL } from "../constants";
import { IS_GOLDRUSH_ACTIVE } from "../context/GoldRushContext";
import { useNodeStreamContext } from "../context/NodeStreamContext";
import { nodeStore } from "../stream/stateStore";
import type { MockCandle, CandleBar } from "../types";
import { useGoldRushCandles } from "./useGoldRushCandles";
import { useGoldRushStream } from "./useGoldRushStream";
import { IS_NODE_STREAM_ACTIVE } from "./useNodeStream";
import type { OHLCVTimeframe } from "./useOHLCVStream";
import { useState, useEffect } from "react";

interface HlCandle {
    t: number;
    o: string;
    h: string;
    l: string;
    c: string;
    v: string;
}

function tfToHlInterval(tf: OHLCVTimeframe): string {
    if (tf === "1s") return "1m"; // finer candles for the 1-second chart view
    if (tf === "5m") return "5m";
    if (tf === "D") return "1d";
    return "1h";
}

function candleBarToMock(c: CandleBar): MockCandle {
    return {
        time: new Date(c.time).toISOString(),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
    };
}

export function useCandles(
    coin: string | null,
    limit = 60,
    timeframe: OHLCVTimeframe = "1s"
): { candles: MockCandle[]; loading: boolean } {
    const nodeStream = useNodeStreamContext();
    const grStream = useGoldRushStream();
    const [candles, setCandles] = useState<MockCandle[]>([]);
    const [loading, setLoading] = useState(true);

    // Reset immediately when coin or timeframe changes so skeleton shows instead of stale chart
    useEffect(() => {
        setCandles([]);
        setLoading(true);
    }, [coin, timeframe]);

    // GoldRush OHLCV path
    const grCandles = useGoldRushCandles(IS_GOLDRUSH_ACTIVE && !IS_NODE_STREAM_ACTIVE ? coin : null, limit, timeframe);

    // Node stream path
    useEffect(() => {
        if (!IS_NODE_STREAM_ACTIVE || !coin) return;
        const raw = nodeStore.getCandles(coin).slice(0, limit);
        const mapped = raw.map(candleBarToMock);
        setCandles(mapped);
        if (mapped.length > 0) setLoading(false);
    }, [coin, limit, nodeStream.blockTick]);

    // GoldRush block-stream path — only apply grCandles when non-empty
    useEffect(() => {
        if (!IS_GOLDRUSH_ACTIVE || IS_NODE_STREAM_ACTIVE || !coin) return;
        const nodeCandles = nodeStore.getCandles(coin);
        if (nodeCandles.length > 0) {
            setCandles(nodeCandles.slice(0, limit).map(candleBarToMock));
            setLoading(false);
        } else if (grCandles.length > 0) {
            setCandles(grCandles);
            setLoading(false);
        }
        // if both empty, leave loading=true — GoldRush subscription pending
    }, [coin, limit, grStream.blockTick, grCandles]);

    // HL REST API — bootstrap / fallback in all modes. GoldRush overrides when it delivers
    // (line 114 guard prevents HL from clobbering GoldRush candles once they arrive).
    // Without this fallback, coins not indexed by GoldRush OHLCV (e.g. HIP-3 DEX tokens)
    // stay in a perpetual loading state.
    useEffect(() => {
        if (IS_NODE_STREAM_ACTIVE || !coin) return;
        const interval = tfToHlInterval(timeframe);
        // For 1s view we fetch 1m candles for the last `limit` minutes (much finer than 5m).
        const lookbackMs =
            timeframe === "D"
                ? 90 * 24 * 3600 * 1000
                : timeframe === "1h"
                  ? limit * 3600 * 1000
                  : timeframe === "1s"
                    ? limit * 60 * 1000
                    : limit * 5 * 60 * 1000;
        const startTime = Date.now() - lookbackMs;
        // Poll more frequently for 1s timeframe so the chart reflects recent price moves quickly.
        const pollMs = timeframe === "1s" ? 5_000 : 30_000;

        async function fetch_() {
            try {
                const res = await fetch(HL_INFO_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        type: "candleSnapshot",
                        req: { coin, interval, startTime },
                    }),
                });
                if (!res.ok) return;
                const data = (await res.json()) as HlCandle[];
                if (!Array.isArray(data) || data.length === 0) return;
                const mapped = data.slice(-limit).map((c) => ({
                    time: new Date(c.t).toISOString(),
                    open: parseFloat(c.o),
                    high: parseFloat(c.h),
                    low: parseFloat(c.l),
                    close: parseFloat(c.c),
                    volume: parseFloat(c.v),
                }));
                // Only update if GoldRush hasn't already provided candles
                setCandles((prev) => (prev.length > 0 ? prev : mapped));
                setLoading(false);
            } catch {
                setLoading(false);
            }
        }

        setLoading(true);
        void fetch_();
        const id = setInterval(() => void fetch_(), pollMs);
        return () => clearInterval(id);
    }, [coin, timeframe, limit]);

    return { candles, loading };
}
