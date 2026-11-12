/**
 * useMarketStats — REST-mode enrichment hook
 *
 * Populates fields that metaAndAssetCtxs does not include:
 *   • orderFlowImbalance  — bid/ask depth imbalance from l2Book top 5 levels each side
 *   • spreadBps           — from l2Book top-of-book
 *   • topBidPx/topAskPx/topBidSz/topAskSz — from l2Book
 *   • bookImbalance       — bid fraction of total depth
 *   • bidDepth/askDepth   — notional depth top 5 levels each side
 *
 * Only runs when neither node stream nor GoldRush is active.
 * Limits API calls to top markets by volume to avoid hammering the API.
 */
import { HL_INFO_URL } from "../constants";
import { IS_GOLDRUSH_ACTIVE } from "../context/GoldRushContext";
import type { HIP3Market } from "../types";
import { IS_NODE_STREAM_ACTIVE } from "./useNodeStream";
import { useEffect, useRef, useState } from "react";

const MAX_TARGETS = 30; // top N markets by volume (REST fallback only)
const BOOK_POLL_MS = 60_000;

type StatsOverlay = Partial<
    Pick<
        HIP3Market,
        | "orderFlowImbalance"
        | "spreadBps"
        | "topBidPx"
        | "topAskPx"
        | "topBidSz"
        | "topAskSz"
        | "bookImbalance"
        | "bidDepth"
        | "askDepth"
        | "makerTakerRatio"
    >
>;

interface HlLevel {
    px: string;
    sz: string;
    n: number;
}

interface HlL2Book {
    coin: string;
    levels: [HlLevel[], HlLevel[]];
    time: number;
}

async function fetchL2Book(coin: string): Promise<HlL2Book | null> {
    const res = await fetch(HL_INFO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "l2Book", coin }),
    });
    if (!res.ok) return null;
    return (await res.json()) as HlL2Book;
}

interface HlRecentTrade {
    side: "A" | "B";
    sz: string;
    px: string;
}

async function fetchRecentTrades(coin: string): Promise<HlRecentTrade[] | null> {
    const res = await fetch(HL_INFO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "recentTrades", coin }),
    });
    if (!res.ok) return null;
    return (await res.json()) as HlRecentTrade[];
}

function computeMakerTakerRatio(trades: HlRecentTrade[]): number {
    if (trades.length === 0) return 0;
    let buyVol = 0;
    let totalVol = 0;
    for (const t of trades) {
        const notional = parseFloat(t.sz) * parseFloat(t.px);
        totalVol += notional;
        if (t.side === "B") buyVol += notional;
    }
    return totalVol > 0 ? buyVol / totalVol : 0;
}

/** Run a list of async tasks in parallel batches of `batchSize`. */
async function batchSettled<T>(tasks: (() => Promise<T>)[], batchSize: number): Promise<PromiseSettledResult<T>[]> {
    const results: PromiseSettledResult<T>[] = [];
    for (let i = 0; i < tasks.length; i += batchSize) {
        const batch = tasks.slice(i, i + batchSize).map((t) => t());
        const settled = await Promise.allSettled(batch);
        results.push(...settled);
    }
    return results;
}

function computeBookStats(book: HlL2Book): StatsOverlay {
    const bids = book.levels[0];
    const asks = book.levels[1];
    if (!bids.length || !asks.length) return {};

    const topBid = bids[0]!;
    const topAsk = asks[0]!;
    const topBidPx = parseFloat(topBid.px);
    const topAskPx = parseFloat(topAsk.px);
    const mid = (topBidPx + topAskPx) / 2;
    const spreadBps = mid > 0 ? ((topAskPx - topBidPx) / mid) * 10000 : 0;

    // Depth = sum of notional in top 5 levels
    const bidDepth = bids.slice(0, 5).reduce((s, l) => s + parseFloat(l.px) * parseFloat(l.sz), 0);
    const askDepth = asks.slice(0, 5).reduce((s, l) => s + parseFloat(l.px) * parseFloat(l.sz), 0);
    const totalDepth = bidDepth + askDepth;
    const bookImbalance = totalDepth > 0 ? bidDepth / totalDepth : 0.5;
    // Order flow imbalance: positive = more bid pressure, negative = more ask pressure
    const orderFlowImbalance = totalDepth > 0 ? (bidDepth - askDepth) / totalDepth : 0;

    return {
        spreadBps,
        topBidPx,
        topAskPx,
        topBidSz: parseFloat(topBid.sz),
        topAskSz: parseFloat(topAsk.sz),
        bookImbalance,
        bidDepth,
        askDepth,
        orderFlowImbalance,
    };
}

export function useMarketStats(baseMarkets: HIP3Market[]): Map<string, StatsOverlay> {
    const [stats, setStats] = useState<Map<string, StatsOverlay>>(new Map());
    const baseMarketsRef = useRef(baseMarkets);
    baseMarketsRef.current = baseMarkets;

    // Stable refs to the refresh functions — set inside the effects below.
    // Used by the HIP-4 watcher to trigger an immediate fetch when they first appear,
    // because HIP-4 markets load asynchronously after the initial mount-time poll runs.
    const refreshMTRef = useRef<() => void>(() => {});
    const refreshBooksRef = useRef<() => void>(() => {});

    // When HIP-4 markets appear for the first time (they load async, after the initial mount-time
    // poll has already run with empty markets), trigger an immediate stats refresh so users see
    // Spread and M/T without waiting 60 seconds for the next polling cycle.
    const hip4InitRef = useRef(false);
    useEffect(() => {
        if (IS_NODE_STREAM_ACTIVE) return;
        if (hip4InitRef.current) return;
        const hasHip4 = baseMarkets.some((m) => m.marketClass === "hip-4");
        if (hasHip4) {
            hip4InitRef.current = true;
            refreshMTRef.current();
            refreshBooksRef.current();
        }
    }, [baseMarkets]);

    // M/T ratio via recentTrades — runs in all REST/GoldRush modes (GoldRush doesn't provide it).
    // Spot coins use only the base token (e.g. "PURR", not "PURR/USDT") for the HL API call.
    useEffect(() => {
        if (IS_NODE_STREAM_ACTIVE) return;

        async function refreshMT() {
            // HL recentTrades API uses plain coin names for perps ("BTC", "ETH").
            // For spot markets it needs "@N" index format which we don't have — skip them.
            // HIP-3 builder-dex perps use "dex:COIN" format — strip the dex prefix.
            // HIP-4 prediction markets (#NN coins) are always included regardless of volume rank.
            const sorted = baseMarketsRef.current
                .filter((m) => m.volume24h > 0 && m.type !== "spot" && m.marketClass !== "hip-4")
                .sort((a, b) => b.volume24h - a.volume24h)
                .slice(0, MAX_TARGETS);
            const hip4 = baseMarketsRef.current.filter((m) => m.marketClass === "hip-4");
            const targets = [...sorted, ...hip4];

            const hlCoins = targets.map((m) => {
                // HIP-3 coins have a dex prefix (e.g. "xyz:CL") — strip for HL API
                if (m.coin.includes(":")) return m.coin.split(":")[1] ?? m.coin;
                return m.coin;
            });

            const results = await batchSettled(
                hlCoins.map((coin) => () => fetchRecentTrades(coin)),
                10
            );

            setStats((prev) => {
                const next = new Map(prev);
                results.forEach((r, idx) => {
                    const m = targets[idx]!;
                    if (r.status === "fulfilled" && r.value && r.value.length > 0) {
                        const makerTakerRatio = computeMakerTakerRatio(r.value);
                        const existing = next.get(m.coin) ?? {};
                        next.set(m.coin, { ...existing, makerTakerRatio });
                    }
                });
                return next;
            });
        }

        refreshMTRef.current = () => void refreshMT();
        void refreshMT();
        const mtId = setInterval(() => void refreshMT(), BOOK_POLL_MS);
        return () => clearInterval(mtId);
    }, []);

    // L2 book (spread, order-flow) — REST by default; in GoldRush mode runs only for spot
    // markets (perp spread comes from impactPxs in meta, avoiding 120+ parallel calls).
    useEffect(() => {
        if (IS_NODE_STREAM_ACTIVE) return;

        async function refreshBooks() {
            const all = baseMarketsRef.current;
            const sorted = all
                .filter((m) => m.volume24h > 0 && m.marketClass !== "hip-4")
                .sort((a, b) => b.volume24h - a.volume24h);
            // In GoldRush mode only fetch books for spot markets (perps already have impactPxs spread).
            // HIP-4 prediction markets are always fetched regardless of volume rank or mode.
            const sliced = IS_GOLDRUSH_ACTIVE ? sorted.filter((m) => m.type === "spot") : sorted;
            const hip4 = all.filter((m) => m.marketClass === "hip-4");
            const targets = [...sliced.slice(0, MAX_TARGETS), ...hip4];

            // Spot coins include quote suffix (e.g. "PURR/USDT") — strip for HL API.
            const hlCoinsForBook = targets.map((m) => (m.type === "spot" ? (m.coin.split("/")[0] ?? m.coin) : m.coin));

            const bookResults = await batchSettled(
                hlCoinsForBook.map((coin) => () => fetchL2Book(coin)),
                15
            );

            setStats((prev) => {
                const next = new Map(prev);
                bookResults.forEach((r, idx) => {
                    const m = targets[idx]!;
                    if (r.status === "fulfilled" && r.value) {
                        const bookStats = computeBookStats(r.value);
                        const existing = next.get(m.coin) ?? {};
                        const existingSpread = existing.spreadBps ?? 0;
                        if (m.type === "spot" || existingSpread === 0) {
                            next.set(m.coin, { ...existing, ...bookStats });
                        } else {
                            next.set(m.coin, { ...existing, ...bookStats, spreadBps: existingSpread });
                        }
                    }
                });
                return next;
            });
        }

        refreshBooksRef.current = () => void refreshBooks();
        void refreshBooks();
        const bookId = setInterval(() => void refreshBooks(), BOOK_POLL_MS);
        return () => clearInterval(bookId);
    }, []); // only set up once — baseMarkets changes are handled via ref

    return stats;
}
