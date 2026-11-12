/**
 * useAllSpotPrices — bulk-fetches spot price data for a list of pair addresses.
 *
 * Returns { pctChanges, volumes } Maps keyed by lowercase pair address.
 * Seeds immediately from localStorage (30-min TTL) for instant first paint.
 *
 * 404 addresses are remembered for the session and never retried.
 * If all addresses in a batch 404, the chain is marked unsupported and
 * all further fetches are skipped to avoid flooding the network.
 */
import { getChainCaps } from "../lib/chainCaps";
import { goldrushFetch } from "../lib/goldrushClient";
import { useEffect, useRef, useState } from "react";

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min client-side localStorage cache
const FETCH_INTERVAL_MS = 5 * 60 * 1000; // re-fetch every 5 min
const MAX_PAIRS = 60; // cap to avoid too many parallel requests
const CONCURRENCY = 8; // max simultaneous in-flight requests

const PCT_CACHE_KEY = (chain: string) => `${chain}:spot-price-changes`;
const VOL_CACHE_KEY = (chain: string) => `${chain}:spot-volumes`;

// Module-level 404 cache — addresses that returned 404 are never retried this session.
const _failed404 = new Set<string>();
// If every address in the first batch 404s, mark the chain unsupported for a TTL window.
// Using a Map (chain → suppressedAt) rather than a Set so the suppression expires after
// CHAIN_SUPPRESS_TTL_MS, allowing recovery from transient API outages.
const CHAIN_SUPPRESS_TTL_MS = 5 * 60_000;
const _chainUnsupported = new Map<string, number>(); // chain → suppressedAt

function loadMap(key: string): Map<string, number> {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return new Map();
        const { data, ts } = JSON.parse(raw) as { data: [string, number][]; ts: number };
        if (Date.now() - ts > CACHE_TTL_MS) return new Map();
        return new Map(data);
    } catch {
        return new Map();
    }
}

function saveMap(key: string, map: Map<string, number>) {
    try {
        localStorage.setItem(key, JSON.stringify({ data: [...map.entries()], ts: Date.now() }));
    } catch {
        /* storage full */
    }
}

async function fetchBatch(
    restChain: string,
    addresses: string[]
): Promise<{ pcts: Map<string, number>; vols: Map<string, number>; failedAll: boolean }> {
    const pcts = new Map<string, number>();
    const vols = new Map<string, number>();
    let attempted = 0;
    let failed404Count = 0;
    const queue = [...addresses];

    const worker = async () => {
        while (queue.length > 0) {
            const addr = queue.shift();
            if (!addr) break;
            const cacheKey = `${restChain}:${addr}`;
            if (_failed404.has(cacheKey)) continue;
            attempted++;
            try {
                const data = await goldrushFetch<{
                    items?: { percent_change_24h?: number; volume_24h_usd?: number }[];
                }>(`${restChain}/pricing/spot_prices/${restChain}/pools/${addr}/`, undefined, 5 * 60 * 1000);
                const item = data?.items?.[0];
                if (!item) continue;
                if (item.percent_change_24h != null) pcts.set(addr, item.percent_change_24h);
                if (item.volume_24h_usd != null && item.volume_24h_usd > 0) vols.set(addr, item.volume_24h_usd);
            } catch (err) {
                if ((err as { status?: number })?.status === 404) {
                    _failed404.add(cacheKey);
                    failed404Count++;
                }
            }
        }
    };

    await Promise.allSettled(Array.from({ length: Math.min(CONCURRENCY, addresses.length) }, worker));
    return { pcts, vols, failedAll: attempted > 0 && failed404Count === attempted };
}

export interface SpotPriceData {
    pctChanges: Map<string, number>;
    volumes: Map<string, number>;
}

export function useAllSpotPrices(restChain: string, pairAddresses: string[]): SpotPriceData {
    const [pctChanges, setPctChanges] = useState<Map<string, number>>(() => loadMap(PCT_CACHE_KEY(restChain)));
    const [volumes, setVolumes] = useState<Map<string, number>>(() => loadMap(VOL_CACHE_KEY(restChain)));
    const pairAddressesRef = useRef(pairAddresses);
    pairAddressesRef.current = pairAddresses;

    useEffect(() => {
        if (!restChain) return;
        if (!getChainCaps(restChain).restApi) return;
        let cancelled = false;

        const run = async () => {
            const suppressedAt = _chainUnsupported.get(restChain);
            if (suppressedAt) {
                if (Date.now() - suppressedAt < CHAIN_SUPPRESS_TTL_MS) return;
                // TTL expired — clean up so the map doesn't grow unbounded over long sessions.
                _chainUnsupported.delete(restChain);
            }

            const addrs = pairAddressesRef.current
                .map((a) => a.toLowerCase())
                .filter((a) => !_failed404.has(`${restChain}:${a}`))
                .slice(0, MAX_PAIRS);
            if (addrs.length === 0) return;

            const { pcts, vols, failedAll } = await fetchBatch(restChain, addrs);
            if (cancelled) return;

            if (failedAll) {
                _chainUnsupported.set(restChain, Date.now());
                return;
            }

            if (pcts.size > 0) {
                setPctChanges((prev) => new Map([...prev, ...pcts]));
                saveMap(PCT_CACHE_KEY(restChain), pcts);
            }
            if (vols.size > 0) {
                setVolumes((prev) => new Map([...prev, ...vols]));
                saveMap(VOL_CACHE_KEY(restChain), vols);
            }
        };

        run();
        const id = setInterval(run, FETCH_INTERVAL_MS);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, [restChain]);

    return { pctChanges, volumes };
}
