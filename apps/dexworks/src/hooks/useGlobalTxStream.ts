/**
 * useGlobalTxStream — subscribes to the allTxs global transaction stream.
 *
 * Uses createHardenedClient for exponential backoff, full error logging,
 * and WS close code/reason logging.
 */
import { getChainCaps } from "../lib/chainCaps";
import { createHardenedClient, validateChainEnum, stringifyError } from "../lib/wsClient";
import { buildGlobalTxsQuery } from "../queries";
import type { ConnectionState, TxData } from "../types";
import { useEffect, useRef, useState } from "react";

interface SubscriptionData {
    allTxs: TxData | TxData[];
}

/**
 * Returns true if the error message indicates that the queried field is not
 * supported on this chain/endpoint.  Checks multiple common GraphQL error
 * phrasings to remain robust against minor API wording changes.
 * NOTE: String matching is inherently fragile — treat matches as hints, not guarantees.
 */
function isUnsupportedFieldError(msg: string): boolean {
    return (
        (msg.includes("FieldUndefined") && msg.includes("allTxs")) ||
        msg.includes("field 'allTxs' doesn't exist") ||
        (msg.includes("Cannot query field") && msg.includes("allTxs"))
    );
}

export function useGlobalTxStream(
    apiKey: string,
    streamUrl: string,
    onTransaction: (tx: TxData, receivedAt: number) => void,
    chainName: string
) {
    const [status, setStatus] = useState<ConnectionState>("idle");
    const onTxRef = useRef(onTransaction);
    onTxRef.current = onTransaction;

    useEffect(() => {
        // Skip subscription entirely for chains that don't support the allTxs field.
        // This prevents FieldUndefined GraphQL errors and console flood on MegaETH.
        const restChain = chainName.replace(/_/g, "-").toLowerCase();
        if (!getChainCaps(restChain).globalAllTxsStream) {
            console.warn(`[GLOBAL_STREAM] allTxs not supported for ${chainName} — skipping subscription`);
            setStatus("disconnected");
            return;
        }

        let cancelled = false;
        setStatus("connecting");

        validateChainEnum(chainName, "GLOBAL_STREAM");

        const client = createHardenedClient({
            url: streamUrl,
            apiKey,
            label: "GLOBAL_STREAM",
            onConnected: () => {
                if (!cancelled) setStatus("connected");
            },
            onClosed: () => {
                if (!cancelled) setStatus("disconnected");
            },
            onError: () => {
                if (!cancelled) setStatus("error");
            },
        });

        const query = buildGlobalTxsQuery(chainName);
        console.log(`[GLOBAL_STREAM] Subscribing — chain: ${chainName}`);

        (async () => {
            try {
                const subscription = client.iterate<SubscriptionData>({ query });
                for await (const result of subscription) {
                    if (cancelled) break;
                    const receivedAt = Date.now();

                    if (result.errors) {
                        console.error(`[GLOBAL_STREAM] Subscription errors:\n${stringifyError(result.errors)}`);
                        if (!cancelled) setStatus("error");
                        break;
                    }

                    if (result.data?.allTxs) {
                        const txs = Array.isArray(result.data.allTxs) ? result.data.allTxs : [result.data.allTxs];
                        for (const tx of txs) {
                            try {
                                onTxRef.current(tx, receivedAt);
                            } catch (err) {
                                console.error("[GLOBAL_STREAM] Error processing tx:", err);
                            }
                        }
                    }
                }
            } catch (err) {
                if (!cancelled) {
                    const msg = stringifyError(err);
                    if (isUnsupportedFieldError(msg)) {
                        console.warn(
                            `[GLOBAL_STREAM] allTxs subscription not supported for chain ${chainName} — KPI metrics unavailable.`
                        );
                        setStatus("disconnected");
                    } else {
                        console.error(`[GLOBAL_STREAM] Fatal subscription error:\n${msg}`);
                        setStatus("error");
                    }
                }
            }
        })();

        return () => {
            cancelled = true;
            client.dispose();
        };
    }, [apiKey, streamUrl, chainName]);

    return { status };
}
