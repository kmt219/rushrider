/**
 * goldrush.ts — all GoldRush Streaming API access for RUSH RIDER.
 *
 * Everything (queries and subscriptions) runs over a single graphql-ws
 * connection. Streaming endpoints only — no REST.
 */
import type { Combo, OHLCVCandle, PairUpdate, TimeframeId, TokenSearchResult } from "../types";
import {
    buildOHLCVPairQuery,
    buildOHLCVTokenQuery,
    buildTokenSearchQuery,
    buildUpdatePairsQuery,
    buildUpdateTokensQuery,
} from "./queries";
import { reportStreamError } from "./streamStatus";
import type { StreamClient } from "./wsClient";

// All valid interval/timeframe combinations per GoldRush docs, fastest → broadest.
export const ALL_COMBOS: Combo[] = [
    { interval: "ONE_SECOND", timeframe: "ONE_MINUTE", label: "1s/1m" },
    { interval: "ONE_MINUTE", timeframe: "FIFTEEN_MINUTES", label: "1m/15m" },
    { interval: "ONE_MINUTE", timeframe: "ONE_HOUR", label: "1m/1h" },
    { interval: "ONE_HOUR", timeframe: "ONE_DAY", label: "1h/1d" },
];

/** Track-length pills shown on the detail page → preferred combo. */
export const PILL_COMBOS: Record<TimeframeId, Combo> = {
    "15M": { interval: "ONE_MINUTE", timeframe: "FIFTEEN_MINUTES", label: "1m/15m" },
    "1H": { interval: "ONE_MINUTE", timeframe: "ONE_HOUR", label: "1m/1h" },
    "1D": { interval: "ONE_HOUR", timeframe: "ONE_DAY", label: "1h/1d" },
};

export interface CandleResult {
    candles: OHLCVCandle[];
    combo: Combo;
}

interface CandleAttempt {
    combo: Combo;
    query: string;
    field: "ohlcvCandlesForPair" | "ohlcvCandlesForToken";
}

function sortCandles(candles: OHLCVCandle[]): OHLCVCandle[] {
    return [...candles].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

// ── Module-level caches ──────────────────────────────────────────────────────
// Survive screen switches for the app lifetime so revisiting a track (and the
// trending-card → detail → ride hop) is instant instead of a fresh round-trip.
const CANDLE_TTL_MS = 90_000;
const SEARCH_TTL_MS = 60_000;
const candleCache = new Map<string, { result: CandleResult; ts: number }>();
const searchCache = new Map<string, { results: TokenSearchResult[]; ts: number }>();

function candleKey(chainGql: string, addr: { pair?: string | null; token?: string | null }, combo?: Combo): string {
    const a = (addr.pair ?? addr.token ?? "").toLowerCase();
    return `${chainGql}:${a}:${combo?.label ?? "auto"}`;
}

/**
 * One-shot OHLCV snapshot. Subscribes to the preferred combo (plus token-based
 * variant when a token address is known); on first non-empty batch all
 * subscriptions are cancelled and the snapshot is returned — tracks are fixed.
 * If nothing arrives within `timeoutMs`, falls back to every other combo in
 * parallel (dexworks AUTO pattern). Resolves null when all combos are dry.
 */
export function fetchCandles(
    client: StreamClient,
    chainGql: string,
    addr: { pair?: string | null; token?: string | null },
    preferred?: Combo,
    timeoutMs = 4_000,
    opts: { fallback?: boolean } = {}
): Promise<CandleResult | null> {
    const fallback = opts.fallback ?? true;
    const buildAttempts = (combos: Combo[]): CandleAttempt[] => {
        const attempts: CandleAttempt[] = [];
        for (const combo of combos) {
            if (addr.pair) {
                attempts.push({
                    combo,
                    query: buildOHLCVPairQuery(chainGql, addr.pair, combo.interval, combo.timeframe),
                    field: "ohlcvCandlesForPair",
                });
            }
            if (addr.token) {
                attempts.push({
                    combo,
                    query: buildOHLCVTokenQuery(chainGql, addr.token, combo.interval, combo.timeframe),
                    field: "ohlcvCandlesForToken",
                });
            }
        }
        return attempts;
    };

    // Cache hit (keyed by the resolved combo) → return immediately, no round-trip.
    const cacheHit = candleCache.get(candleKey(chainGql, addr, preferred));
    if (cacheHit && Date.now() - cacheHit.ts < CANDLE_TTL_MS) {
        return Promise.resolve(cacheHit.result);
    }

    return new Promise((resolve) => {
        let settled = false;
        const unsubscribers: Array<() => void> = [];
        const timers: Array<ReturnType<typeof setTimeout>> = [];

        const finish = (result: CandleResult | null) => {
            if (settled) {
                return;
            }
            settled = true;
            for (const t of timers) {
                clearTimeout(t);
            }
            for (const u of unsubscribers) {
                u();
            }
            if (result) {
                // Cache under both the requested-combo key and the winning-combo
                // key so AUTO callers and pill callers share the same hit.
                candleCache.set(candleKey(chainGql, addr, preferred), { result, ts: Date.now() });
                candleCache.set(candleKey(chainGql, addr, result.combo), { result, ts: Date.now() });
            }
            resolve(result);
        };

        const subscribeAttempts = (attempts: CandleAttempt[]) => {
            for (const { combo, query, field } of attempts) {
                if (settled) {
                    return;
                }
                const unsub = client.subscribe<Record<string, OHLCVCandle[]>>(
                    { query },
                    {
                        next: (result) => {
                            const incoming = result.data?.[field];
                            if (incoming && incoming.length > 0) {
                                finish({ candles: sortCandles(incoming), combo });
                            } else if (result.errors?.length) {
                                reportStreamError(result.errors);
                            }
                        },
                        error: (err) => reportStreamError(err),
                        complete: () => {},
                    }
                );
                unsubscribers.push(unsub);
            }
        };

        if (preferred) {
            subscribeAttempts(buildAttempts([preferred]));
            if (fallback) {
                // Preferred combo gets a short head start; fall back to the rest
                // in parallel. Skipped for trending cards (fallback:false) to
                // avoid a burst of concurrent subscriptions the stream rejects
                // with INVALID_TOKEN under load.
                timers.push(
                    setTimeout(() => {
                        if (!settled) {
                            subscribeAttempts(buildAttempts(ALL_COMBOS.filter((c) => c.label !== preferred.label)));
                        }
                    }, 1_200)
                );
                timers.push(setTimeout(() => finish(null), timeoutMs + 4_000));
            } else {
                timers.push(setTimeout(() => finish(null), timeoutMs));
            }
        } else {
            subscribeAttempts(buildAttempts(ALL_COMBOS));
            timers.push(setTimeout(() => finish(null), timeoutMs));
        }
    });
}

/** One-shot token search over the streaming connection (cached for SEARCH_TTL_MS). */
export function searchTokens(client: StreamClient, query: string, timeoutMs = 5_000): Promise<TokenSearchResult[]> {
    const key = query.trim().toLowerCase();
    const hit = searchCache.get(key);
    if (hit && Date.now() - hit.ts < SEARCH_TTL_MS) {
        return Promise.resolve(hit.results);
    }
    const { query: gqlQuery, variables } = buildTokenSearchQuery(query);
    return new Promise((resolve) => {
        let settled = false;
        const finish = (results: TokenSearchResult[]) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            unsub();
            if (results.length > 0) {
                searchCache.set(key, { results, ts: Date.now() });
            }
            resolve(results);
        };
        const timer = setTimeout(() => finish([]), timeoutMs);
        const unsub = client.subscribe<{ searchToken: TokenSearchResult[] }>(
            { query: gqlQuery, variables },
            {
                next: (result) => {
                    if (result.errors?.length) {
                        reportStreamError(result.errors);
                    }
                    if (result.data?.searchToken) {
                        finish(result.data.searchToken);
                    }
                },
                error: (err) => {
                    reportStreamError(err);
                    finish([]);
                },
                complete: () => finish([]),
            }
        );
    });
}

/**
 * Live pair stat updates for the trending track cards.
 * Uses updateTokens (token-keyed) on order-book chains, updatePairs elsewhere.
 * Returns an unsubscribe function.
 */
export function subscribeUpdates(
    client: StreamClient,
    chainGql: string,
    addrs: { pairs?: string[]; tokens?: string[] },
    onUpdate: (updates: PairUpdate[]) => void
): () => void {
    const query = addrs.tokens?.length
        ? buildUpdateTokensQuery(chainGql, addrs.tokens)
        : addrs.pairs?.length
          ? buildUpdatePairsQuery(chainGql, addrs.pairs)
          : null;
    if (!query) {
        return () => {};
    }
    const field = addrs.tokens?.length ? "updateTokens" : "updatePairs";
    return client.subscribe<Record<string, PairUpdate | PairUpdate[]>>(
        { query },
        {
            next: (result) => {
                const data = result.data?.[field];
                if (data) {
                    onUpdate(Array.isArray(data) ? data : [data]);
                }
            },
            error: () => {},
            complete: () => {},
        }
    );
}

/** Does this search result's chain_name match the given chain? Defensive against format drift. */
export function matchesChain(resultChain: string, chainGql: string): boolean {
    const norm = resultChain.toUpperCase().replace(/-/g, "_");
    return norm === chainGql || `${norm}_MAINNET` === chainGql;
}
