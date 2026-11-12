/**
 * useWalletStream — subscribes to the walletTxs stream for watched pair addresses.
 *
 * Uses the shared stream client (singleton WS connection).
 * Per-transaction errors are caught individually — a single bad tx never
 * breaks the subscription or the application.
 */
import { validateChainEnum, stringifyError } from "../lib/wsClient";
import { buildWalletTxsQuery } from "../queries";
import type { ConnectionState, TxData } from "../types";
import { useSharedStreamClient } from "./useSharedStreamClient";
import { useEffect, useRef, useState } from "react";

interface SubscriptionData {
    walletTxs: TxData | TxData[];
}

export function useWalletStream(
    apiKey: string,
    streamUrl: string,
    addresses: string[],
    onTransaction: (tx: TxData, receivedAt: number) => void,
    chainName: string
) {
    const [status, setStatus] = useState<ConnectionState>("idle");
    const onTxRef = useRef(onTransaction);
    onTxRef.current = onTransaction;

    // Stable string key so the effect only restarts when addresses actually change
    const addressesKey = addresses.join(",");
    const client = useSharedStreamClient(apiKey, streamUrl);

    useEffect(() => {
        if (addresses.length === 0 || !client) {
            setStatus("idle");
            return;
        }

        let cancelled = false;
        setStatus("connecting");

        validateChainEnum(chainName, "WALLET_STREAM");

        const query = buildWalletTxsQuery(chainName, addresses);
        console.log(`[WALLET_STREAM] Subscribing to ${addresses.length} address(es)`);

        const unsubscribe = client.subscribe<SubscriptionData>(
            { query },
            {
                next: (result) => {
                    if (cancelled) return;

                    const receivedAt = Date.now();

                    if (result.errors) {
                        console.error(`[WALLET_STREAM] Subscription errors:\n${stringifyError(result.errors)}`);
                        if (!cancelled) setStatus("error");
                        return;
                    }

                    if (result.data?.walletTxs) {
                        const txs = Array.isArray(result.data.walletTxs)
                            ? result.data.walletTxs
                            : [result.data.walletTxs];

                        for (const tx of txs) {
                            // Per-tx isolation — a single bad tx must not crash the loop
                            try {
                                onTxRef.current(tx, receivedAt);
                            } catch (err) {
                                console.error("[WALLET_STREAM] Error processing tx (non-fatal):", err);
                            }
                        }
                        setStatus("connected");
                    }
                },
                error: (err) => {
                    if (!cancelled) {
                        console.error(`[WALLET_STREAM] Fatal subscription error:\n${stringifyError(err)}`);
                        setStatus("error");
                    }
                },
                complete: () => {
                    console.log("Wallet stream subscription completed");
                },
            }
        );

        return () => {
            cancelled = true;
            unsubscribe();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client, addressesKey, chainName]);

    return { status };
}
