/**
 * useUpdatePairsStream — subscribes to the updatePairs (or updateTokens for
 * order-book chains like Tempo) stream for a set of addresses.
 *
 * When useTokenMode is true the hook subscribes via updateTokens using
 * token_addresses instead of pair_addresses.  The response is normalised:
 * each item's token_address is surfaced as pair_address so downstream
 * handlePairUpdates can match updates to pairs via base_token_address.
 *
 * Uses the shared stream client (singleton WS connection).
 */
import { stringifyError } from "../lib/wsClient";
import { buildUpdatePairsQuery, buildUpdateTokensQuery } from "../queries";
import type { ConnectionState, UpdatePairData } from "../types";
import { useSharedStreamClient } from "./useSharedStreamClient";
import { useEffect, useRef, useState } from "react";

export function useUpdatePairsStream(
    apiKey: string,
    streamUrl: string,
    pairAddresses: string[],
    onUpdate: (updates: UpdatePairData[]) => void,
    chainName: string,
    useTokenMode = false
) {
    const [status, setStatus] = useState<ConnectionState>("idle");
    const onUpdateRef = useRef(onUpdate);
    onUpdateRef.current = onUpdate;

    const addressesKey = pairAddresses.join(",");
    const client = useSharedStreamClient(apiKey, streamUrl);

    useEffect(() => {
        if (pairAddresses.length === 0 || !client) {
            setStatus("idle");
            return;
        }

        let cancelled = false;
        setStatus("connecting");

        if (useTokenMode) {
            // Order-book chains (e.g. Tempo): subscribe via updateTokens using
            // token_addresses.  Normalize token_address → pair_address so the
            // existing handlePairUpdates lookup (by base_token_address) works.
            const query = buildUpdateTokensQuery(chainName, pairAddresses);
            console.log("[UPDATE_TOKENS] Connecting for", pairAddresses.length, "tokens");

            const unsubscribe = client.subscribe(
                { query },
                {
                    next: (result) => {
                        if (cancelled) return;
                        try {
                            const raw = result.data?.updateTokens;
                            if (raw) {
                                const items = Array.isArray(raw) ? raw : [raw];
                                // updateTokens returns pair_address (same field name as updatePairs)
                                // so no normalisation is required.
                                onUpdateRef.current(items as UpdatePairData[]);
                                setStatus("connected");
                            }
                        } catch (err) {
                            console.error("[UPDATE_TOKENS] Error processing update:", err);
                        }
                    },
                    error: (err) => {
                        console.error(`[UPDATE_TOKENS] Subscription error:\n${stringifyError(err)}`);
                        if (!cancelled) setStatus("error");
                    },
                    complete: () => {
                        console.log("[UPDATE_TOKENS] Subscription completed");
                    },
                }
            );

            return () => {
                cancelled = true;
                unsubscribe();
            };
        }

        // Normal AMM chains: subscribe via updatePairs using pair_addresses.
        const query = buildUpdatePairsQuery(chainName, pairAddresses);
        console.log("[UPDATE_PAIRS] Connecting for", pairAddresses.length, "pairs");

        const unsubscribe = client.subscribe(
            { query },
            {
                next: (result) => {
                    if (cancelled) return;
                    try {
                        if (result.data?.updatePairs) {
                            const updates = Array.isArray(result.data.updatePairs)
                                ? result.data.updatePairs
                                : [result.data.updatePairs];
                            onUpdateRef.current(updates as UpdatePairData[]);
                            setStatus("connected");
                        }
                    } catch (err) {
                        console.error("[UPDATE_PAIRS] Error processing update:", err);
                    }
                },
                error: (err) => {
                    console.error(`[UPDATE_PAIRS] Subscription error:\n${stringifyError(err)}`);
                    if (!cancelled) setStatus("error");
                },
                complete: () => {
                    console.log("[UPDATE_PAIRS] Subscription completed");
                },
            }
        );

        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [client, addressesKey, chainName, useTokenMode]);

    return { status };
}
