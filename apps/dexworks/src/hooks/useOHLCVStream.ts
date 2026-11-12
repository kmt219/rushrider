/**
 * useOHLCVStream — subscribes to ohlcvCandlesForPair for a selected pair.
 *
 * The WebSocket client is created once and reused across pair switches so
 * only the GraphQL subscription changes — no TCP/TLS/auth round-trip on
 * every pair click.  The client is recreated only when apiKey or streamUrl
 * changes, and disposed on unmount.
 *
 * All FALLBACK_CONFIGS are subscribed in parallel — whichever returns data
 * first wins and the others are cancelled. This eliminates the old 1500ms
 * sequential wait between config attempts.
 *
 * After the first batch of candles arrives, the winning subscription stays
 * alive so new/updated candles stream in automatically (live chart).
 * Incoming candles are merged by timestamp — existing candles are updated
 * in-place and new candles are appended.
 *
 * Results are cached per (pair, interval) for 5 minutes.  Each timeframe
 * (AUTO, 1M, 1H, 1D) has its own cache slot so switching timeframes never
 * cross-serves stale data — and switching back to a previously-loaded
 * timeframe is instant with no loading state.
 *
 * On every pair or timeframe change that is not served from cache, candles
 * are cleared immediately so the chart never shows data from a different
 * pair or timeframe while the new subscription is loading.
 */
import { createHardenedClient, stringifyError } from "../lib/wsClient";
import { buildOHLCVQuery, buildOHLCVTokenQuery } from "../queries";
import type { OHLCVCandle } from "@goldrush-demos/shared-ui";
import { useEffect, useRef, useState } from "react";

interface OHLCVConfig {
    interval: string;
    timeframe: string;
    label: string;
}

interface OHLCVSubscriptionData {
    ohlcvCandlesForPair?: OHLCVCandle[];
}

interface OHLCVAttempt {
    config: OHLCVConfig;
    query: string;
    field: "ohlcvCandlesForPair" | "ohlcvCandlesForToken";
}

interface OHLCVSubscriptionData {
    ohlcvCandlesForPair?: OHLCVCandle[];
}

// All valid combinations per GoldRush docs, fastest → broadest.
// Intervals: ONE_SECOND | ONE_MINUTE | ONE_HOUR
// Timeframes: ONE_MINUTE | FIFTEEN_MINUTES | ONE_HOUR | ONE_DAY
const FALLBACK_CONFIGS: OHLCVConfig[] = [
    { interval: "ONE_SECOND", timeframe: "ONE_MINUTE", label: "1s/1m" },
    { interval: "ONE_MINUTE", timeframe: "FIFTEEN_MINUTES", label: "1m/15m" },
    { interval: "ONE_MINUTE", timeframe: "ONE_HOUR", label: "1m/1h" },
    { interval: "ONE_HOUR", timeframe: "ONE_DAY", label: "1h/1d" },
];

// ---------------------------------------------------------------------------
// Module-level candle cache — survives pair switches for the app lifetime
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
    candles: OHLCVCandle[];
    config: OHLCVConfig;
    timestamp: number;
}

const MAX_CACHE_ENTRIES = 50;
const candleCache = new Map<string, CacheEntry>();

/**
 * Returns a cache key that includes the interval config so AUTO, 1M, 1H, 1D
 * each maintain their own cached result.  AUTO (no config) uses ":auto".
 * For a forced interval the key embeds the interval+timeframe so switching
 * between e.g. 1M→1H never cross-serves stale data from the wrong interval.
 */
function getCacheKey(chainName: string, pairAddress: string, config?: OHLCVConfig): string {
    const base = `${chainName}:${pairAddress}`;
    if (!config) return `${base}:auto`;
    return `${base}:${config.interval}:${config.timeframe}`;
}

/**
 * Merge incoming candles into an existing sorted array.
 * - Existing candles with the same timestamp are updated in-place (last-write wins).
 * - New candles (later timestamps) are appended and the result is re-sorted.
 * Returns the existing array unchanged if nothing differs.
 */
function mergeCandles(existing: OHLCVCandle[], incoming: OHLCVCandle[]): OHLCVCandle[] {
    if (incoming.length === 0) return existing;
    const map = new Map<string, OHLCVCandle>();
    for (const c of existing) map.set(c.timestamp, c);
    let changed = false;
    for (const c of incoming) {
        const prev = map.get(c.timestamp);
        if (!prev || prev.open !== c.open || prev.high !== c.high || prev.low !== c.low || prev.close !== c.close) {
            map.set(c.timestamp, c);
            changed = true;
        }
    }
    if (!changed) return existing;
    return [...map.values()].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useOHLCVStream(
    apiKey: string,
    streamUrl: string,
    pairAddress: string | null,
    chainName: string,
    forcedInterval?: { interval: string; timeframe: string; label: string },
    baseTokenAddress?: string
) {
    const [candles, setCandles] = useState<OHLCVCandle[]>([]);
    const [currentConfig, setCurrentConfig] = useState<OHLCVConfig | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [noData, setNoData] = useState(false);

    // Persist the WS client across pair switches so we only pay the
    // connection cost once per session (or when creds change).
    const clientRef = useRef<ReturnType<typeof createHardenedClient> | null>(null);
    const clientCredsRef = useRef<{ apiKey: string; streamUrl: string } | null>(null);

    // Keep a ref to the latest candles so live-update merge callbacks
    // always see the current array without stale closure captures.
    const candlesRef = useRef<OHLCVCandle[]>([]);

    // Debounce timer for sessionStorage writes during live streaming.
    // Avoids JSON.stringify on every incoming candle update (up to 10×/sec).
    const ssWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Dispose on unmount
    useEffect(() => {
        return () => {
            clientRef.current?.dispose();
            clientRef.current = null;
            clientCredsRef.current = null;
        };
    }, []);

    useEffect(() => {
        // Allow null pairAddress when a baseTokenAddress is provided — chains like
        // Tempo use token-based OHLCV (ohlcvCandlesForToken) with no pair address.
        if (!pairAddress && !baseTokenAddress) {
            setCandles([]);
            candlesRef.current = [];
            setCurrentConfig(null);
            setIsLoading(false);
            setNoData(false);
            return;
        }

        // When there's no pair address, key by token address instead (Tempo).
        const lookupKey = pairAddress ?? baseTokenAddress ?? "";

        // Primary cache key for this specific mode (AUTO or a forced interval).
        // Each interval maintains its own cache slot so switching timeframes
        // never cross-serves stale data from a different interval.
        const cacheKey = forcedInterval
            ? getCacheKey(chainName, lookupKey, forcedInterval)
            : getCacheKey(chainName, lookupKey); // AUTO key: "…:auto"

        // Reset noData flag whenever we start loading a new pair/mode
        setNoData(false);

        // Evict expired entries when the cache grows large.
        if (candleCache.size > MAX_CACHE_ENTRIES) {
            const firstKey = candleCache.keys().next().value;
            if (firstKey !== undefined) candleCache.delete(firstKey);
        }

        // For AUTO mode also scan FALLBACK_CONFIGS cache slots so that switching
        // back to AUTO after a forced interval reuses already-loaded data instantly.
        const findCached = (): CacheEntry | undefined => {
            const direct = candleCache.get(cacheKey);
            if (direct && Date.now() - direct.timestamp < CACHE_TTL_MS) return direct;
            if (!forcedInterval) {
                for (const cfg of FALLBACK_CONFIGS) {
                    const cfgEntry = candleCache.get(getCacheKey(chainName, lookupKey, cfg));
                    if (cfgEntry && Date.now() - cfgEntry.timestamp < CACHE_TTL_MS) return cfgEntry;
                }
            }
            return undefined;
        };

        const cached = findCached();
        if (cached) {
            // Cache hit — serve immediately with no loading state
            setCandles(cached.candles);
            candlesRef.current = cached.candles;
            setCurrentConfig(cached.config);
            setIsLoading(false);
            setNoData(false);
        } else {
            // In-memory miss — check sessionStorage before showing loading blur.
            // For AUTO mode, probe the auto key and all fallback keys.
            const ssKeysToCheck = forcedInterval
                ? [cacheKey]
                : [cacheKey, ...FALLBACK_CONFIGS.map((c) => getCacheKey(chainName, lookupKey, c))];

            let servedFromSS = false;
            for (const ssKey of ssKeysToCheck) {
                try {
                    const raw = sessionStorage.getItem(`ohlcv:${ssKey}`);
                    if (raw) {
                        const entry = JSON.parse(raw) as CacheEntry;
                        if (entry.candles?.length > 0 && Date.now() - entry.timestamp < CACHE_TTL_MS) {
                            // Warm both the specific config key and the current mode key
                            candleCache.set(getCacheKey(chainName, lookupKey, entry.config), entry);
                            candleCache.set(cacheKey, entry);
                            setCandles(entry.candles);
                            candlesRef.current = entry.candles;
                            setCurrentConfig(entry.config);
                            setIsLoading(false);
                            servedFromSS = true;
                            break;
                        }
                    }
                } catch {
                    /* ignore */
                }
            }

            if (!servedFromSS) {
                // No cached data — clear any stale candles immediately so we never
                // show data from a different pair or timeframe while loading.
                setCandles([]);
                candlesRef.current = [];
                setCurrentConfig(null);
                setIsLoading(true);
            }
        }

        // Create client lazily; recreate only when connection parameters change.
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
                onConnected: () => {},
                onClosed: () => {},
                onError: () => {},
            });
            clientCredsRef.current = { apiKey, streamUrl };
        }

        const client = clientRef.current;
        let cancelled = false;
        let resolved = false;
        let failedCount = 0;
        // All subscription unsub fns — cancelled on cleanup or when losers are dismissed.
        const unsubscribers: Array<() => void> = [];

        // Build the full list of parallel attempts. Forced mode: 1 pair sub.
        // AUTO mode: all FALLBACK_CONFIGS as pair subs + same configs as token subs
        // (when baseTokenAddress known) — first to return candles wins.
        // Pair-based attempts are only added when we have a pair address.
        // Token-based attempts run when a baseTokenAddress is known.
        const attemptsToTry: OHLCVAttempt[] = forcedInterval
            ? pairAddress
                ? [
                      {
                          config: forcedInterval,
                          query: buildOHLCVQuery(
                              chainName,
                              pairAddress,
                              forcedInterval.interval,
                              forcedInterval.timeframe
                          ),
                          field: "ohlcvCandlesForPair",
                      },
                  ]
                : baseTokenAddress
                  ? [
                        {
                            config: forcedInterval,
                            query: buildOHLCVTokenQuery(
                                chainName,
                                baseTokenAddress,
                                forcedInterval.interval,
                                forcedInterval.timeframe
                            ),
                            field: "ohlcvCandlesForToken",
                        },
                    ]
                  : []
            : [
                  ...(pairAddress
                      ? FALLBACK_CONFIGS.map((cfg) => ({
                            config: cfg,
                            query: buildOHLCVQuery(chainName, pairAddress, cfg.interval, cfg.timeframe),
                            field: "ohlcvCandlesForPair" as const,
                        }))
                      : []),
                  ...(baseTokenAddress
                      ? FALLBACK_CONFIGS.map((cfg) => ({
                            config: { ...cfg, label: `${cfg.label}[T]` },
                            query: buildOHLCVTokenQuery(chainName, baseTokenAddress, cfg.interval, cfg.timeframe),
                            field: "ohlcvCandlesForToken" as const,
                        }))
                      : []),
              ];

        attemptsToTry.forEach(({ config, query, field }) => {
            if (cancelled) return;

            const addrLabel = pairAddress ?? baseTokenAddress ?? "token";
            const label = `OHLCV[${addrLabel.slice(0, 8)}…] ${config.label}`;
            console.log(`[OHLCV] Trying ${config.label} for ${addrLabel}`);

            // Use a handle object so the next() callback can reference its own unsub
            // without a before-assignment TS error (callback fires asynchronously,
            // so handle.unsub is always assigned by the time next() is called).
            const handle: { unsub: (() => void) | null } = { unsub: null };

            handle.unsub = client.subscribe<Record<string, OHLCVCandle[]>>(
                { query },
                {
                    next: (result) => {
                        if (cancelled) return;

                        const incoming = result.data?.[field];
                        if (!incoming) return;

                        if (incoming.length > 0) {
                            if (!resolved) {
                                // ── First win ────────────────────────────────────────────
                                console.log(`[OHLCV] ✓ ${config.label} won with ${incoming.length} candles`);
                                resolved = true;

                                // Cancel all competing subscriptions except this winner.
                                for (const u of unsubscribers) {
                                    if (u !== handle.unsub) u();
                                }

                                const sorted = [...incoming].sort(
                                    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                                );

                                // Cache under the config-specific key AND the current mode key
                                // (AUTO key or the forced-interval key).  This ensures:
                                //   • switching 1M→1H→1M each reuse their own cached data
                                //   • switching back to AUTO reuses the winning config's data
                                const entry: CacheEntry = { candles: sorted, config, timestamp: Date.now() };
                                const configKey = getCacheKey(chainName, lookupKey, config);
                                candleCache.set(configKey, entry);
                                candleCache.set(cacheKey, entry); // AUTO key or same as configKey for forced
                                // Insertion-order eviction: keep cache bounded to prevent unbounded memory growth.
                                if (candleCache.size > MAX_CACHE_ENTRIES) {
                                    const firstKey = candleCache.keys().next().value;
                                    if (firstKey !== undefined) candleCache.delete(firstKey);
                                }
                                try {
                                    sessionStorage.setItem(`ohlcv:${configKey}`, JSON.stringify(entry));
                                    if (cacheKey !== configKey) {
                                        sessionStorage.setItem(`ohlcv:${cacheKey}`, JSON.stringify(entry));
                                    }
                                } catch {
                                    /* storage full */
                                }

                                candlesRef.current = sorted;
                                setCandles(sorted);
                                setCurrentConfig(config);
                                setIsLoading(false);
                            } else {
                                // ── Live update: merge new / updated candles ──────────────
                                const merged = mergeCandles(candlesRef.current, incoming);
                                if (merged !== candlesRef.current) {
                                    candlesRef.current = merged;
                                    setCandles(merged);

                                    // Refresh in-memory cache under both keys.
                                    const entry: CacheEntry = { candles: merged, config, timestamp: Date.now() };
                                    const configKey = getCacheKey(chainName, lookupKey, config);
                                    candleCache.set(configKey, entry);
                                    candleCache.set(cacheKey, entry);

                                    // Debounce sessionStorage writes — avoids 10-15ms JSON.stringify/sec.
                                    if (ssWriteTimerRef.current) clearTimeout(ssWriteTimerRef.current);
                                    ssWriteTimerRef.current = setTimeout(() => {
                                        try {
                                            sessionStorage.setItem(`ohlcv:${configKey}`, JSON.stringify(entry));
                                            if (cacheKey !== configKey) {
                                                sessionStorage.setItem(`ohlcv:${cacheKey}`, JSON.stringify(entry));
                                            }
                                        } catch {
                                            /* storage full */
                                        }
                                        ssWriteTimerRef.current = null;
                                    }, 2_000);
                                }
                            }
                        } else {
                            console.log(`[OHLCV] No candles for ${config.label}`);
                        }
                    },
                    error: (err) => {
                        if (cancelled || resolved) return;
                        failedCount++;
                        console.warn(
                            `[${label}] Subscription error (${failedCount}/${attemptsToTry.length}): ${stringifyError(err)}`
                        );
                        // If every parallel attempt has now errored, give up immediately
                        // instead of waiting for the full 5s timeout.
                        if (failedCount >= attemptsToTry.length) {
                            resolved = true;
                            clearTimeout(timeoutId);
                            for (const u of unsubscribers) u();
                            setIsLoading(false);
                            setNoData(true);
                        }
                    },
                    complete: () => {
                        console.log(`[${label}] Subscription completed`);
                    },
                }
            );

            unsubscribers.push(handle.unsub);
        });

        // Safety net: give up and show noData if no candles arrive within the timeout.
        // Use 3s for AUTO (covers WS handshake + all parallel attempts) and 2s for forced.
        const timeoutMs = forcedInterval ? 2_000 : 3_000;
        const timeoutId = setTimeout(() => {
            if (!cancelled && !resolved) {
                console.warn(
                    `[OHLCV] No data within ${timeoutMs / 1000}s for ${pairAddress} (${forcedInterval?.label ?? "auto"})`
                );
                resolved = true;
                for (const u of unsubscribers) u();
                setIsLoading(false);
                setNoData(true);
            }
        }, timeoutMs);

        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
            // Cancel all subscriptions (including the winner) on pair change or unmount.
            for (const u of unsubscribers) u();
            // Flush any pending debounced sessionStorage write.
            if (ssWriteTimerRef.current) {
                clearTimeout(ssWriteTimerRef.current);
                ssWriteTimerRef.current = null;
            }
        };
    }, [apiKey, streamUrl, pairAddress, chainName, forcedInterval]);

    return { candles, config: currentConfig, isLoading, noData };
}

// ---------------------------------------------------------------------------
// Standalone prefetch — warms candleCache for a pair without touching React state.
// Safe to call concurrently for multiple pairs. Returns a cancel function.
// ---------------------------------------------------------------------------

/**
 * One-shot background OHLCV prefetch — warms `candleCache` for a pair without
 * affecting any React state.  Safe to call for multiple pairs concurrently.
 * Returns a cancel function; call on component unmount.
 */
export function prefetchOHLCV(apiKey: string, streamUrl: string, pairAddress: string, chainName: string): () => void {
    // Prefetch warms the AUTO key so the chart loads instantly on pair selection.
    const autoKey = getCacheKey(chainName, pairAddress);

    // Skip if AUTO is already freshly cached.
    if ((candleCache.get(autoKey)?.timestamp ?? 0) > Date.now() - CACHE_TTL_MS) return () => {};

    const client = createHardenedClient({
        url: streamUrl,
        apiKey,
        label: "OHLCV-PREFETCH",
        onConnected: () => {},
        onClosed: () => {},
        onError: () => {},
    });

    let done = false;
    const unsubscribers: Array<() => void> = [];

    FALLBACK_CONFIGS.forEach((config) => {
        if (done) return;
        const query = buildOHLCVQuery(chainName, pairAddress, config.interval, config.timeframe);
        const unsub = client.subscribe<Record<string, OHLCVCandle[]>>(
            { query },
            {
                next: (result) => {
                    if (done) return;
                    const incoming = result.data?.ohlcvCandlesForPair;
                    if (!incoming?.length) return;
                    done = true;
                    for (const u of unsubscribers) u();
                    const sorted = [...incoming].sort(
                        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                    );
                    const entry: CacheEntry = { candles: sorted, config, timestamp: Date.now() };
                    // Cache under both the AUTO key and the config-specific key.
                    const configKey = getCacheKey(chainName, pairAddress, config);
                    candleCache.set(autoKey, entry);
                    candleCache.set(configKey, entry);
                    try {
                        sessionStorage.setItem(`ohlcv:${autoKey}`, JSON.stringify(entry));
                        if (autoKey !== configKey) {
                            sessionStorage.setItem(`ohlcv:${configKey}`, JSON.stringify(entry));
                        }
                    } catch {
                        /* storage full */
                    }
                    client.dispose();
                },
                error: () => {},
                complete: () => {},
            }
        );
        unsubscribers.push(unsub);
    });

    const timeoutId = setTimeout(() => {
        if (!done) {
            done = true;
            for (const u of unsubscribers) u();
            // Do NOT add to noDataPairs — prefetch failure is silent; the user
            // selecting the pair will trigger a fresh attempt with full timeout.
            client.dispose();
        }
    }, 5_000);

    return () => {
        done = true;
        clearTimeout(timeoutId);
        for (const u of unsubscribers) u();
        client.dispose();
    };
}
