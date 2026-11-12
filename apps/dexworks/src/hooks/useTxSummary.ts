import { getChainCaps } from "../lib/chainCaps";
import { goldrushFetch } from "../lib/goldrushClient";
import { useEffect, useState } from "react";

export interface TxSummaryData {
    totalCount: number;
    earliestTx: string | null;
    latestTx: string | null;
}

interface TxSummaryItem {
    total_count: number;
    earliest_transaction?: { block_signed_at?: string };
    latest_transaction?: { block_signed_at?: string };
}

interface TxSummaryResponse {
    items: TxSummaryItem[];
}

const cache = new Map<string, { data: TxSummaryData; fetchedAt: number }>();
const CACHE_TTL_MS = 2 * 60_000;

export function useTxSummary(chainName: string, pairAddress: string | null | undefined) {
    const [data, setData] = useState<TxSummaryData | null>(null);

    useEffect(() => {
        if (!pairAddress) {
            setData(null);
            return;
        }

        const key = `${chainName}:${pairAddress.toLowerCase()}`;

        const cached = cache.get(key);
        if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
            setData(cached.data);
            return;
        }

        const restChain = chainName.replace(/_/g, "-").toLowerCase();
        if (!getChainCaps(restChain).restApi) return;
        const addr = pairAddress.toLowerCase();

        goldrushFetch<TxSummaryResponse>(`${restChain}/address/${addr}/transactions_summary/`)
            .then((resp) => {
                const item = resp.items?.[0];
                const result: TxSummaryData = item
                    ? {
                          totalCount: item.total_count ?? 0,
                          earliestTx: item.earliest_transaction?.block_signed_at ?? null,
                          latestTx: item.latest_transaction?.block_signed_at ?? null,
                      }
                    : { totalCount: 0, earliestTx: null, latestTx: null };
                cache.set(key, { data: result, fetchedAt: Date.now() });
                setData(result);
            })
            .catch(() => {
                // silently fail — drawer shows "—"
            });
    }, [chainName, pairAddress]);

    return data;
}
