import { getChainCaps } from "../lib/chainCaps";
import { goldrushFetch } from "../lib/goldrushClient";
import { useEffect, useState } from "react";

interface TokenHoldersResponse {
    pagination: { total_count: number };
    items: unknown[];
}

const cache = new Map<string, { count: number; fetchedAt: number }>();
const unsupportedTokens = new Set<string>();
const CACHE_TTL_MS = 5 * 60_000;

export function useTokenHolders(chainName: string, contractAddress: string | null | undefined) {
    const [count, setCount] = useState<number | null>(null);

    useEffect(() => {
        if (!contractAddress) {
            setCount(null);
            return;
        }

        const key = `${chainName}:${contractAddress.toLowerCase()}`;
        if (unsupportedTokens.has(key)) return;

        const cached = cache.get(key);
        if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
            setCount(cached.count);
            return;
        }

        const restChain = chainName.replace(/_/g, "-").toLowerCase();
        if (!getChainCaps(restChain).restApi) return;
        const addr = contractAddress.toLowerCase();

        goldrushFetch<TokenHoldersResponse>(`${restChain}/tokens/${addr}/token_holders_v2/`, { "page-size": "1" })
            .then((resp) => {
                const total = resp.pagination?.total_count ?? 0;
                cache.set(key, { count: total, fetchedAt: Date.now() });
                setCount(total);
            })
            .catch((err: { status?: number }) => {
                if (err?.status === 404 || err?.status === 501) unsupportedTokens.add(key);
            });
    }, [chainName, contractAddress]);

    return count;
}
