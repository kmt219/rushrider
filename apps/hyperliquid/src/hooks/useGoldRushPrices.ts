import { HL_INFO_URL } from "../constants";
import { GOLDRUSH_CHAIN, IS_GOLDRUSH_ACTIVE, useGoldRushClient } from "../context/GoldRushContext";
import { buildBatchCoinOHLCVQuery } from "../queries";
import { useEffect, useRef, useState } from "react";

export interface GoldRushPrice {
    markPx: number;
    change24h: number; // fractional, e.g. 0.05 = +5%
    volume24h: number; // USD notional
    change1h: number; // fractional, e.g. 0.05 = +5%
}

export type GoldRushPriceMap = Map<string, GoldRushPrice>;

interface RawCandle {
    token_address?: string; // present in batched subscription — identifies which coin this candle belongs to
    timestamp: string; // ISO-8601 string as returned by GoldRush
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number; // raw volume units (fallback when volume_usd is absent)
    volume_usd?: number; // USD-denominated volume — preferred when available
}

const MAX_CANDLES = 25; // keep a rolling 24h window (ONE_HOUR × 25)

const EMPTY: GoldRushPriceMap = new Map();

/**
 * Single batched ohlcvCandlesForToken subscription for all coins in the screener.
 * token_addresses accepts arrays — one subscription replaces N per-coin subscriptions.
 * Each incoming message delivers candles for one token; token_address identifies it.
 *
 * The first message delivers the full historical payload (up to ONE_DAY).
 * Subsequent messages deliver live single-candle updates. Candles are
 * merged by timestamp so that live updates do not discard prior 24h history.
 *
 * Returns a Map<coin, GoldRushPrice> driven by the rolling 24h window:
 *   markPx   — latest close
 *   change24h — (latestClose - earliestOpen) / earliestOpen
 *   volume24h — sum of volume_usd across all accumulated candles
 */
export function useGoldRushPrices(coins: string[]): GoldRushPriceMap {
    const { client } = useGoldRushClient();
    const [prices, setPrices] = useState<GoldRushPriceMap>(EMPTY);
    // Per-coin rolling candle history: Map<coin, Map<timestamp, RawCandle>>
    const candleHistoryRef = useRef<Map<string, Map<string, RawCandle>>>(new Map());
    const priceAccRef = useRef<Map<string, GoldRushPrice>>(new Map());
    // Stable key for the coins list — only re-subscribe when the list actually changes
    const coinsKey = coins.join(",");

    useEffect(() => {
        if (!IS_GOLDRUSH_ACTIVE || !client || coins.length === 0) return;

        // Single batched subscription for all coins — token_address in response identifies each coin
        const unsub = client.subscribe<{ ohlcvCandlesForToken?: RawCandle[] }>(
            { query: buildBatchCoinOHLCVQuery(GOLDRUSH_CHAIN, coins) },
            {
                next: ({ data }) => {
                    const incoming = data?.ohlcvCandlesForToken;
                    if (!incoming || incoming.length === 0) return;

                    let changed = false;
                    for (const candle of incoming) {
                        const coin = candle.token_address;
                        if (!coin) continue; // token_address absent — schema mismatch, skip

                        // Upsert incoming candle into the per-coin history
                        if (!candleHistoryRef.current.has(coin)) {
                            candleHistoryRef.current.set(coin, new Map());
                        }
                        const history = candleHistoryRef.current.get(coin)!;
                        history.set(candle.timestamp, candle);

                        // Keep only the most recent MAX_CANDLES candles.
                        // Map preserves insertion order, so the first key is the oldest —
                        // grab it with keys().next().value for O(1) eviction (no sort needed).
                        while (history.size > MAX_CANDLES) {
                            const oldest = history.keys().next().value;
                            if (oldest !== undefined) history.delete(oldest);
                            else break;
                        }

                        // Derive price stats from accumulated candle window.
                        // ASSUMPTION: GoldRush delivers ohlcvCandlesForToken in ascending
                        // timestamp order (earliest first). The Map insertion order therefore
                        // matches chronological order, so keys().next() = oldest and the last
                        // iteration of history.values() = latest — no sort needed.
                        // If the API ever delivers candles out of order, markPx/change24h will
                        // be silently wrong. Revert to sort-based logic if that happens.
                        const earliest = history.values().next().value;
                        let latest: RawCandle | undefined;
                        let prevCandle: typeof latest | undefined;
                        let volume24h = 0;
                        for (const c of history.values()) {
                            prevCandle = latest;
                            latest = c;
                            volume24h += c.volume_usd ?? c.volume ?? 0;
                        }
                        if (!latest || !earliest) continue;

                        const markPx = latest.close;
                        const change24h = earliest.open > 0 ? (latest.close - earliest.open) / earliest.open : 0;
                        // change1h: last close vs second-to-last close
                        // Assumes ONE_HOUR interval per candle (set in buildBatchCoinOHLCVQuery).
                        const change1h =
                            prevCandle !== undefined && prevCandle.close > 0
                                ? (latest.close - prevCandle.close) / prevCandle.close
                                : 0;

                        priceAccRef.current.set(coin, { markPx, change24h, volume24h, change1h });
                        changed = true;
                    }

                    if (changed) setPrices(new Map(priceAccRef.current));
                },
                error: () => {
                    // Silently ignore — HYPERCORE OHLCV may not be indexed yet,
                    // or token_address field not yet in schema
                },
                complete: () => {},
            }
        );

        return () => {
            unsub();
        };
    }, [client, coinsKey]);

    // REST fallback for change1h: fires after 3s for all coins where change1h is still 0.
    //
    // Why dedup by hlCoin:
    //   coins[] is ordered perps-first (~200), then spots (~150). A simple slice(0, N)
    //   always cuts off spots entirely. Instead we group ALL coins by the HL REST
    //   API parameter (hlCoin), deduplicate, and issue one request per unique base name.
    //   Spot "HYPE/USDT" and perp "HYPE" both use hlCoin "HYPE" — one request, both updated.
    //   HIP-3 dex coins ("xyz:CL") strip the dex prefix → "CL" for the HL REST call.
    useEffect(() => {
        if (!IS_GOLDRUSH_ACTIVE || coins.length === 0) return;

        const timer = setTimeout(() => {
            void (async () => {
                const now = Date.now();

                // Group coin keys by the hlCoin we'll send to HL REST.
                const hlCoinMap = new Map<string, string[]>();
                for (const coin of coins) {
                    if ((priceAccRef.current.get(coin)?.change1h ?? 0) !== 0) continue;
                    // HIP-3 coins have a dex prefix (e.g. "xyz:CL") — strip it for HL REST.
                    // Spot coins have a quote suffix (e.g. "PURR/USDT") — strip it too.
                    const hlCoin = coin.includes(":")
                        ? (coin.split(":")[1] ?? coin)
                        : coin.includes("/")
                          ? (coin.split("/")[0] ?? coin)
                          : coin;
                    const group = hlCoinMap.get(hlCoin);
                    if (group) group.push(coin);
                    else hlCoinMap.set(hlCoin, [coin]);
                }

                if (hlCoinMap.size === 0) return;

                const results = await Promise.allSettled(
                    [...hlCoinMap.entries()].map(async ([hlCoin, coinKeys]) => {
                        try {
                            const res = await fetch(HL_INFO_URL, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    type: "candleSnapshot",
                                    req: { coin: hlCoin, interval: "1h", startTime: now - 2 * 3_600_000 },
                                }),
                            });
                            if (!res.ok) return null;
                            const data = (await res.json()) as { o: string; c: string }[] | null;
                            if (!data || data.length < 2) return null;
                            const prev = parseFloat(data[data.length - 2]!.c);
                            const last = parseFloat(data[data.length - 1]!.c);
                            return { coinKeys, change1h: prev > 0 ? (last - prev) / prev : 0 };
                        } catch {
                            return null;
                        }
                    })
                );

                let changed = false;
                for (const r of results) {
                    if (r.status !== "fulfilled" || !r.value) continue;
                    const { coinKeys, change1h } = r.value;
                    for (const coin of coinKeys) {
                        const existing = priceAccRef.current.get(coin);
                        // Don't override if GoldRush delivered a real change1h while we were fetching
                        if (existing && existing.change1h !== 0) continue;
                        if (existing) {
                            priceAccRef.current.set(coin, { ...existing, change1h });
                        } else {
                            priceAccRef.current.set(coin, { markPx: 0, change24h: 0, volume24h: 0, change1h });
                        }
                        changed = true;
                    }
                }
                if (changed) setPrices(new Map(priceAccRef.current));
            })();
        }, 3_000);

        return () => clearTimeout(timer);
    }, [coinsKey]);

    if (!IS_GOLDRUSH_ACTIVE) return EMPTY;
    return prices;
}
