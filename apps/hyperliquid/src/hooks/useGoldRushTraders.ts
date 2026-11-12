import { IS_GOLDRUSH_ACTIVE, GOLDRUSH_CHAIN, useGoldRushClient } from "../context/GoldRushContext";
import { buildPublicFillsQuery } from "../queries";
import { nodeStore } from "../stream/stateStore";
import { useEffect } from "react";

interface HlFillData {
    data?: {
        walletTxs?: {
            decoded_details?: {
                __typename?: string;
                coin?: string;
                fee?: number | string | null;
                liquidation?: unknown;
            } | null;
            from_address?: string;
        } | null;
    } | null;
}

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ADDRESSES_PER_COIN = 10_000;

function evictStale(coinMap: Map<string, number>): void {
    const cutoff = Date.now() - TTL_MS;
    for (const [addr, ts] of coinMap) {
        if (ts < cutoff) coinMap.delete(addr);
    }
}

/**
 * Subscribes to the public walletTxs fill stream and accumulates unique
 * `from_address` values per coin into `stores.tradersMap` with a 24h TTL
 * rolling window. Call `getUniqueTraderCount(stores, coin)` to read counts.
 *
 * Each entry in tradersMap is: Map<coin, Map<from_address, lastSeenMs>>
 * Eviction runs every 5 minutes and also on overflow per-coin.
 */
export function useGoldRushTraders(): void {
    const { client, stores } = useGoldRushClient();

    useEffect(() => {
        if (!IS_GOLDRUSH_ACTIVE || !client) return;

        const query = buildPublicFillsQuery(GOLDRUSH_CHAIN);
        const unsub = client.subscribe(
            { query },
            {
                next(data: unknown) {
                    const tx = (data as HlFillData)?.data?.walletTxs;
                    const details = tx?.decoded_details;
                    if (!details || details.__typename !== "HypercoreFillTransaction") return;

                    const coin = details.coin;
                    const fromAddress = tx?.from_address;
                    if (!coin) return;

                    if (fromAddress) {
                        let coinMap = stores.tradersMap.get(coin);
                        if (!coinMap) {
                            coinMap = new Map();
                            stores.tradersMap.set(coin, coinMap);
                        }
                        coinMap.set(fromAddress, Date.now());
                        if (coinMap.size > MAX_ADDRESSES_PER_COIN) {
                            evictStale(coinMap);
                        }
                    }

                    const coinState = nodeStore.getOrCreate(coin);

                    // Accumulate fee as proxy for builder revenue (fee field may be null
                    // for public stream fills — guard against it).
                    const fee = details.fee;
                    if (fee !== null && fee !== undefined) {
                        const feeNum = typeof fee === "number" ? fee : parseFloat(fee);
                        if (!isNaN(feeNum) && feeNum > 0) {
                            coinState.builderRevenue24h.add(feeNum);
                        }
                    }

                    // Track liquidations: if the fill has a non-null liquidation object,
                    // record it in nodeStore so liqCount24h is populated in GoldRush mode.
                    if (details.liquidation) {
                        coinState.liqCount24h.add(1);
                    }
                },
                error(err) {
                    // eslint-disable-next-line no-console
                    console.warn("[useGoldRushTraders] subscription error", err);
                },
                complete() {},
            }
        );

        const evictInterval = setInterval(
            () => {
                for (const coinMap of stores.tradersMap.values()) {
                    evictStale(coinMap);
                }
            },
            5 * 60 * 1000
        );

        return () => {
            unsub();
            clearInterval(evictInterval);
        };
    }, [client, stores]);
}

export function getUniqueTraderCount(stores: { tradersMap: Map<string, Map<string, number>> }, coin: string): number {
    return stores.tradersMap.get(coin)?.size ?? 0;
}
