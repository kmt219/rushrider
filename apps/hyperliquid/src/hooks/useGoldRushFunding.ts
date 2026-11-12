import { IS_GOLDRUSH_ACTIVE, GOLDRUSH_CHAIN, useGoldRushClient } from "../context/GoldRushContext";
import { buildWalletTxsQuery } from "../queries";
import { useEffect } from "react";

interface HlFundingData {
    data?: {
        walletTxs?: {
            decoded_details?: {
                __typename?: string;
                coin?: string;
                funding_rate?: number;
                time?: number;
            } | null;
        } | null;
    } | null;
}

/**
 * Subscribes to the walletTxs GoldRush stream and extracts HypercoreFundingEvent
 * messages to keep stores.fundingMap up to date with per-coin funding rates.
 *
 * wallet_addresses: [] streams all network funding events without a wallet filter.
 * fundingMap is keyed by coin name and holds the latest rate + timestamp.
 */
export function useGoldRushFunding(): void {
    const { client, stores } = useGoldRushClient();

    useEffect(() => {
        if (!IS_GOLDRUSH_ACTIVE || !client) return;

        const query = buildWalletTxsQuery(GOLDRUSH_CHAIN, []);
        const unsub = client.subscribe(
            { query },
            {
                next(data: unknown) {
                    const details = (data as HlFundingData)?.data?.walletTxs?.decoded_details;
                    if (!details || details.__typename !== "HypercoreFundingEvent") return;

                    const { coin, funding_rate, time } = details;
                    if (!coin || funding_rate === undefined) return;

                    stores.fundingMap.set(coin, {
                        rate: funding_rate,
                        time: time ?? Date.now(),
                    });
                },
                error(err) {
                    // eslint-disable-next-line no-console
                    console.warn("[useGoldRushFunding] subscription error", err);
                },
                complete() {},
            }
        );

        return () => unsub();
    }, [client, stores]);
}
