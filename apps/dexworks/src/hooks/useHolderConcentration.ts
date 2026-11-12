/**
 * useHolderConcentration — fetches the top-100 token holders and computes the
 * Herfindahl-Hirschman Index (HHI) concentration score.
 *
 * Serves two consumers:
 *   1. ConcentrationBadge — inline HHI badge on pair rows
 *   2. HolderMap — full node list for the D3 bubble visualization
 *
 * Cache TTL: 60s (holders change frequently).
 * Rate-limited via the shared semaphore from useDeployerReputation.
 */
import { getChainCaps } from "../lib/chainCaps";
import { goldrushFetch } from "../lib/goldrushClient";
import { withSemaphore } from "../lib/semaphore";
import type { ConcentrationData, HolderItem } from "../types";
import { computeHHI, getConcentrationTier, DEAD_ADDRESSES } from "../utils/concentration";
import { useEffect, useState } from "react";

interface HolderApiItem {
    address?: string;
    balance?: string;
    balance_quote?: number;
}

interface HolderResponse {
    pagination?: { total_count?: number };
    items?: HolderApiItem[];
}

const _cache = new Map<string, ConcentrationData>();
const _unsupported = new Set<string>();
const CACHE_TTL_MS = 60_000;

/**
 * Exported so useSafetyScore can call it directly (and share the same cache).
 */
export async function fetchHolderConcentration(chainName: string, tokenAddress: string): Promise<ConcentrationData> {
    const restChain = chainName.replace(/_/g, "-").toLowerCase();
    const addr = tokenAddress.toLowerCase();

    if (!getChainCaps(restChain).restApi) {
        return {
            hhi: 0,
            tier: "safe",
            totalCount: 0,
            topHolderPct: 0,
            top5HolderPct: 0,
            top10HolderPct: 0,
            recentLargeAccumulator: false,
            holderItems: [],
            fetchedAt: Date.now(),
        };
    }

    const resp = await goldrushFetch<HolderResponse>(
        `${restChain}/tokens/${addr}/token_holders_v2/`,
        { "page-size": "100" },
        CACHE_TTL_MS
    );

    const raw = resp?.items ?? [];
    const items: HolderItem[] = raw
        .filter((h) => !DEAD_ADDRESSES.has((h.address ?? "").toLowerCase()))
        .map((h) => ({
            address: (h.address ?? "").toLowerCase(),
            balance: h.balance ?? "0",
            balance_quote: h.balance_quote,
        }));

    const totalCount = resp?.pagination?.total_count ?? items.length;

    if (items.length === 0) {
        return {
            hhi: 0,
            tier: "safe",
            totalCount,
            topHolderPct: 0,
            top5HolderPct: 0,
            top10HolderPct: 0,
            recentLargeAccumulator: false,
            holderItems: [],
            fetchedAt: Date.now(),
        };
    }

    const balances = items.map((h) => {
        try {
            return BigInt(h.balance);
        } catch {
            return 0n;
        }
    });

    const total = balances.reduce((a, b) => a + b, 0n);
    const pct = (n: number): number =>
        total > 0n ? Number((balances.slice(0, n).reduce((a, b) => a + b, 0n) * 10_000n) / total) / 100 : 0;

    const topHolderPct = pct(1);

    return {
        hhi: computeHHI(balances),
        tier: getConcentrationTier(computeHHI(balances)),
        totalCount,
        topHolderPct,
        top5HolderPct: pct(5),
        top10HolderPct: pct(10),
        recentLargeAccumulator: topHolderPct > 10,
        holderItems: items,
        fetchedAt: Date.now(),
    };
}

export function useHolderConcentration(
    chainName: string,
    tokenAddress: string | null | undefined
): ConcentrationData | null {
    const [data, setData] = useState<ConcentrationData | null>(null);

    useEffect(() => {
        if (!tokenAddress) {
            setData(null);
            return;
        }
        const key = `${chainName}:${tokenAddress.toLowerCase()}`;
        if (_unsupported.has(key)) return;

        const cached = _cache.get(key);
        if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
            setData(cached);
            return;
        }

        withSemaphore(() => fetchHolderConcentration(chainName, tokenAddress))
            .then((d) => {
                _cache.set(key, d);
                setData(d);
            })
            .catch((err: { status?: number }) => {
                if (err?.status === 404) _unsupported.add(key);
            });
    }, [chainName, tokenAddress]);

    return data;
}
