import { IS_GOLDRUSH_ACTIVE, GOLDRUSH_CHAIN, useGoldRushClient } from "../context/GoldRushContext";
import { buildPairOHLCVQuery } from "../queries";
import type { GoldRushPrice } from "./useGoldRushPrices";
import { useEffect, useRef, useState } from "react";

export type GoldRushPairPriceMap = Map<string, GoldRushPrice>;

/**
 * Build the pair address string used by ohlcvCandlesForPair for a HIP-3 market.
 * HIP-3 coins look like "xyz:CL"; the pair address is "xyz:CL-USDC".
 */
export function buildHip3PairAddress(coin: string, quoteToken: string): string {
    return `${coin}-${quoteToken}`;
}

/**
 * Subscribe to ohlcvCandlesForPair for each provided HIP-3 builder DEX pair.
 * One GraphQL subscription is created per pair (buildPairOHLCVQuery, 1h candles).
 *
 * Returns a Map<pairAddress, GoldRushPrice> updated in real-time:
 *   markPx    — latest close price
 *   change24h — (latestClose - earliestOpen) / earliestOpen across accumulated candles
 *   change1h  — (latestClose - prevClose) / prevClose (last two candles)
 *   volume24h — sum of volume_usd (or volume) across all accumulated candles
 *
 * Candle buffer is capped at 25 entries (~25h at 1h interval).
 * Each subscription is torn down and replaced when the pairs list changes.
 */
export function useGoldRushPairPrices(pairs: Array<{ pairAddress: string; coin: string }>): GoldRushPairPriceMap {
    const { client } = useGoldRushClient();
    const [prices, setPrices] = useState<GoldRushPairPriceMap>(new Map());
    const candleBuffers = useRef<Map<string, { open: number; close: number; volumeUsd: number }[]>>(new Map());

    // Stable key — only re-subscribe when the pair address list actually changes

    const pairsKey = pairs.map((p) => p.pairAddress).join(",");

    useEffect(() => {
        if (!IS_GOLDRUSH_ACTIVE || !client || pairs.length === 0) return;

        // One subscription per pair: the ohlcvCandlesForPair response has no pair_address
        // discriminator field, so we cannot use a single batched subscription and demultiplex
        // by pair (unlike ohlcvCandlesForToken which includes contract_address). HIP-3 has
        // <30 pairs so N individual subscriptions share the single WS connection safely.
        const unsubs = pairs.map(({ pairAddress }) => {
            const query = buildPairOHLCVQuery(GOLDRUSH_CHAIN, pairAddress, "1h");

            return client.subscribe(
                { query },
                {
                    next(data: unknown) {
                        // ohlcvCandlesForPair returns an array (one element per candle).
                        // Handle both array and single-object shapes defensively.
                        const raw = (data as { data?: { ohlcvCandlesForPair?: unknown } })?.data?.ohlcvCandlesForPair;
                        if (!raw) return;

                        const candles = Array.isArray(raw) ? raw : [raw];

                        for (const candle of candles as Array<{
                            open?: number | string;
                            close?: number | string;
                            volume?: number | string;
                            volume_usd?: number | string;
                        }>) {
                            const buf = candleBuffers.current.get(pairAddress) ?? [];
                            buf.push({
                                open: Number(candle.open ?? 0),
                                close: Number(candle.close ?? 0),
                                volumeUsd: Number(candle.volume_usd ?? candle.volume ?? 0),
                            });
                            if (buf.length > 25) buf.shift();
                            candleBuffers.current.set(pairAddress, buf);
                        }

                        const buf = candleBuffers.current.get(pairAddress);
                        if (!buf || buf.length < 2) return;

                        const latest = buf[buf.length - 1]!;
                        const first = buf[0]!;
                        const prev = buf[buf.length - 2]!;

                        const change24h = first.open > 0 ? (latest.close - first.open) / first.open : 0;
                        const change1h = prev.close > 0 ? (latest.close - prev.close) / prev.close : 0;
                        const volume24h = buf.reduce((s, c) => s + c.volumeUsd, 0);

                        setPrices((cur) => {
                            const next = new Map(cur);
                            next.set(pairAddress, {
                                markPx: latest.close,
                                change24h,
                                change1h,
                                volume24h,
                            });
                            return next;
                        });
                    },
                    error(err) {
                        // eslint-disable-next-line no-console
                        console.warn("[useGoldRushPairPrices] error for", pairAddress, err);
                    },
                    complete() {},
                }
            );
        });

        return () => unsubs.forEach((u) => u());
        // pairsKey captures the stable serialised pair address list — avoids stale closure on pairs
    }, [client, pairsKey]);

    return prices;
}
