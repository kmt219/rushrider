/**
 * useWalletCluster — fetches transfers_v2 for top-20 holders and runs
 * the cluster analysis engine (buildClusters) to detect related wallets.
 *
 * Pattern mirrors useDeployerReputation: shared semaphore, 5-min cache, 404 skip.
 * Top-20 only to limit API calls (20 addresses × 1 call = 20 calls, 4 semaphore batches).
 */
import { goldrushFetch } from "../lib/goldrushClient";
import { withSemaphore } from "../lib/semaphore";
import type { Cluster, HolderItem, TransferEdge, TransferItem } from "../types";
import { buildClusters, buildEdges } from "../utils/clustering";
import { useEffect, useState } from "react";

const CACHE_TTL_MS = 5 * 60_000; // 5 min
const _cache = new Map<string, { clusters: Cluster[]; fetchedAt: number }>();
const _unsupported = new Set<string>();

interface TransferApiItem {
    from_address?: string;
    to_address?: string;
    block_signed_at?: string;
    value?: string;
    contract_address?: string;
    tx_hash?: string;
}

interface TransfersResponse {
    items?: TransferApiItem[];
}

async function fetchTransfersForAddress(restChain: string, address: string): Promise<TransferItem[]> {
    const resp = await goldrushFetch<TransfersResponse>(
        `${restChain}/address/${address}/transfers_v2/`,
        { "page-size": "50" },
        CACHE_TTL_MS
    );
    return (resp?.items ?? []).map((t) => ({
        from_address: (t.from_address ?? "").toLowerCase(),
        to_address: (t.to_address ?? "").toLowerCase(),
        block_signed_at: t.block_signed_at ?? new Date().toISOString(),
        value: t.value ?? "0",
        contract_address: t.contract_address,
        tx_hash: t.tx_hash,
    }));
}

export function useWalletCluster(
    chainName: string,
    tokenAddress: string | null | undefined,
    holderItems: HolderItem[]
): { clusters: Cluster[]; edges: TransferEdge[]; loading: boolean } {
    const [clusters, setClusters] = useState<Cluster[]>([]);
    const [edges, setEdges] = useState<TransferEdge[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!tokenAddress || holderItems.length === 0) {
            setClusters([]);
            return;
        }
        const key = `${chainName}:${tokenAddress.toLowerCase()}`;
        if (_unsupported.has(key)) return;

        const cached = _cache.get(key);
        if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
            setClusters(cached.clusters);
            return;
        }

        const top20 = holderItems.slice(0, 20);
        const restChain = chainName.replace(/_/g, "-").toLowerCase();

        setLoading(true);
        const promises = top20.map((item) =>
            withSemaphore(() => fetchTransfersForAddress(restChain, item.address)).catch(() => [] as TransferItem[])
        );

        Promise.allSettled(promises).then((results) => {
            const allTransfers: TransferItem[] = [];
            for (const r of results) {
                if (r.status === "fulfilled") allTransfers.push(...r.value);
            }
            const found = buildClusters(top20, allTransfers);
            const foundEdges = buildEdges(top20, allTransfers);
            _cache.set(key, { clusters: found, fetchedAt: Date.now() });
            setClusters(found);
            setEdges(foundEdges);
            setLoading(false);
        });
    }, [chainName, tokenAddress, holderItems]);

    return { clusters, edges, loading };
}
