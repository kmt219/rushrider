/**
 * useHolderStream — subscribes to walletTxs WebSocket for top-50 holder addresses.
 * Fires onActivity whenever a live tx arrives for a tracked wallet.
 *
 * Pattern mirrors useWalletStream. Deduplicates on tx_hash to avoid double-firing.
 */
import { buildWalletTxsQuery } from "../queries";
import type { ConnectionState, HolderItem, TxData } from "../types";
import { createClient } from "graphql-ws";
import { useEffect, useRef } from "react";

const MAX_HOLDERS = 50;

export function useHolderStream(
    apiKey: string,
    streamUrl: string,
    chainName: string,
    holderItems: HolderItem[],
    onActivity: (address: string, type: "buy" | "sell" | "transfer", valueUsd?: number) => void
): { status: ConnectionState } {
    const statusRef = useRef<ConnectionState>("idle");
    const seenRef = useRef(new Set<string>());
    const onActivityRef = useRef(onActivity);
    onActivityRef.current = onActivity;

    useEffect(() => {
        const addresses = holderItems.slice(0, MAX_HOLDERS).map((h) => h.address);
        if (!apiKey || !streamUrl || !chainName || addresses.length === 0) return;

        const client = createClient({
            url: streamUrl,
            connectionParams: { Authorization: `Basic ${btoa(`${apiKey}:`)}` },
        });

        const query = buildWalletTxsQuery(chainName, addresses);
        statusRef.current = "connecting";

        const unsub = client.subscribe<{ walletTxs: TxData | TxData[] }>(
            { query },
            {
                next({ data }) {
                    statusRef.current = "connected";
                    if (!data?.walletTxs) return;
                    const txs = Array.isArray(data.walletTxs) ? data.walletTxs : [data.walletTxs];
                    for (const tx of txs) {
                        if (!tx.tx_hash) continue;
                        if (seenRef.current.has(tx.tx_hash)) continue;
                        seenRef.current.add(tx.tx_hash);
                        if (seenRef.current.size > 500) {
                            // Rolling eviction
                            const iter = seenRef.current.values();
                            for (let i = 0; i < 100; i++) {
                                const v = iter.next().value;
                                if (v) seenRef.current.delete(v);
                            }
                        }

                        const addr = tx.from_address?.toLowerCase();
                        if (!addr) continue;

                        const type = classifyTx(tx);
                        const valueUsd = extractValueUsd(tx);
                        onActivityRef.current(addr, type, valueUsd);
                    }
                },
                error() {
                    statusRef.current = "error";
                },
                complete() {
                    statusRef.current = "disconnected";
                },
            }
        );

        return () => {
            unsub();
            client.dispose();
        };
    }, [apiKey, streamUrl, chainName, holderItems]);

    return { status: statusRef.current };
}

function classifyTx(tx: TxData): "buy" | "sell" | "transfer" {
    const type = tx.decoded_type?.toLowerCase() ?? "";
    if (type.includes("swap")) {
        // Heuristic: if the tx value > 0 the wallet sent ETH → buying
        try {
            return BigInt(tx.value ?? "0") > 0n ? "buy" : "sell";
        } catch {
            return "buy";
        }
    }
    if (type.includes("transfer")) return "transfer";
    return "transfer";
}

/**
 * Best-effort extraction of USD value from a walletTxs event.
 * Checks decoded_details for a quote field first, then falls back to
 * the raw ETH value (in wei → ether, not USD — better than nothing for
 * relative scale comparisons).
 */
function extractValueUsd(tx: TxData): number | undefined {
    try {
        const d = tx.decoded_details;
        if (d) {
            // Some enhanced GoldRush responses include a pre-computed quote
            if (typeof d.value_quote === "number" && d.value_quote > 0) return d.value_quote;
            if (typeof d.amount_quote === "number" && d.amount_quote > 0) return d.amount_quote;
        }
        // Fallback: ETH in wei → ether (not USD, but signals transaction scale)
        if (tx.value && tx.value !== "0") {
            const wei = BigInt(tx.value);
            if (wei > 0n) {
                const ether = Number(wei) / 1e18;
                // Only return if non-trivial (>0.0001 ETH) to filter out gas
                if (ether > 0.0001) return ether;
            }
        }
    } catch {
        /* ignore parse errors */
    }
    return undefined;
}
