/**
 * useNewPairsStream — subscribes to the newPairs stream.
 *
 * Uses the shared stream client (singleton WS connection).
 * Data processing errors are caught locally and do not crash the subscription.
 *
 * Order-book chains (e.g. Tempo): all pairs from the stream share the same
 * orderbook contract address in pair_address, which would cause every pair
 * after the first to be silently dropped by the deduplication Set.  To fix
 * this, we normalise pair_address = base_token.contract_address on ingestion
 * for chains where useTokenAddressForOhlcv is true.  This makes pair_address
 * unique per token throughout the entire app — OHLCV, updateTokens, watchlist,
 * and handlePairUpdates all key by pair_address and will work correctly.
 */
import { getChainCaps } from "../lib/chainCaps";
import { validateChainEnum, stringifyError } from "../lib/wsClient";
import { buildNewPairsQuery } from "../queries";
import type { ConnectionState, NewPairData } from "../types";
import { useSharedStreamClient } from "./useSharedStreamClient";
import { useEffect, useRef, useState, startTransition } from "react";

/**
 * For order-book chains, replace pair_address with base_token.contract_address
 * so every token has a unique, stable identity throughout the app.
 * No-op for normal AMM chains.
 */
function normalizePairAddress(p: NewPairData, useTokenKey: boolean): NewPairData {
    if (useTokenKey && p.base_token?.contract_address) {
        return { ...p, pair_address: p.base_token.contract_address };
    }
    return p;
}

export function useNewPairsStream(
    apiKey: string,
    streamUrl: string,
    newPairs: NewPairData[],
    setNewPairs: React.Dispatch<React.SetStateAction<NewPairData[]>>,
    chainName: string
) {
    const cacheKey = `${chainName}:newPairs-cache`;
    const [status, setStatus] = useState<ConnectionState>("connecting");
    const client = useSharedStreamClient(apiKey, streamUrl);

    // Keep a ref so the persistence effect always writes to the current chain's
    // slot without including cacheKey in its deps. Including cacheKey caused a
    // cross-chain poisoning bug: when the chain changed, cacheKey flipped to the
    // new chain's key while newPairs still held the old chain's data, so the old
    // pairs were written into the new chain's localStorage cache and restored on
    // the next switch.
    const cacheKeyRef = useRef(cacheKey);
    cacheKeyRef.current = cacheKey;

    // Write localStorage after React commits new pairs — safe in concurrent mode
    // (state updater functions can replay; side-effects must live in useEffect).
    useEffect(() => {
        if (newPairs.length === 0) return;
        try {
            localStorage.setItem(cacheKeyRef.current, JSON.stringify({ data: newPairs, ts: Date.now() }));
        } catch {
            /* storage full */
        }
    }, [newPairs]);

    useEffect(() => {
        // Reset to "connecting" whenever the chain or client changes so the
        // isChainSwitching skeleton in App.tsx clears correctly on chain switch.
        setStatus("connecting");

        if (!client) {
            return;
        }

        let cancelled = false;
        validateChainEnum(chainName, "NEW_PAIRS");
        const restChain = chainName.replace(/_/g, "-").toLowerCase();
        const useTokenKey = getChainCaps(restChain).useTokenAddressForOhlcv;
        console.log("[NEW_PAIRS] Starting subscription", useTokenKey ? "(token-address mode)" : "");

        const unsubscribe = client.subscribe(
            { query: buildNewPairsQuery(chainName) },
            {
                next: (data) => {
                    if (cancelled) return;
                    try {
                        if (data.data?.newPairs) {
                            // Normalise pair_address for order-book chains before any
                            // deduplication so each token gets a unique identity.
                            const np = (data.data.newPairs as NewPairData[]).map((p) =>
                                normalizePairAddress(p, useTokenKey)
                            );
                            startTransition(() => {
                                setNewPairs((prev) => {
                                    const existing = new Set(prev.map((p) => p.pair_address.toLowerCase()));
                                    const toAdd = np.filter((p) => !existing.has(p.pair_address.toLowerCase()));
                                    if (toAdd.length === 0) return prev;
                                    const combined = [
                                        ...toAdd.map((p) => ({ ...p, initial_quote_rate_usd: p.quote_rate_usd })),
                                        ...prev,
                                    ];
                                    const tsMap = new Map(
                                        combined.map((p) => [p.pair_address, new Date(p.block_signed_at).getTime()])
                                    );
                                    const next = combined.sort(
                                        (a, b) => tsMap.get(b.pair_address)! - tsMap.get(a.pair_address)!
                                    );
                                    return next;
                                });
                                setStatus("connected");
                            });
                        }
                    } catch (err) {
                        console.error("[NEW_PAIRS] Error processing data:", err);
                    }
                },
                error: (err) => {
                    console.error(`[NEW_PAIRS] Subscription error:\n${stringifyError(err)}`);
                    if (!cancelled) setStatus("error");
                },
                complete: () => {
                    console.log("[NEW_PAIRS] Subscription completed");
                },
            }
        );

        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [client, setNewPairs, chainName]);

    return { status };
}
