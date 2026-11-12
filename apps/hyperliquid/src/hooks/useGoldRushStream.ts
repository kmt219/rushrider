import { IS_GOLDRUSH_ACTIVE, useGoldRushClient } from "../context/GoldRushContext";
import type { NodeStreamState } from "./useNodeStream";
import { useEffect, useState } from "react";

const DISCONNECTED: NodeStreamState = {
    active: false,
    status: "disconnected",
    blockNumber: 0,
    latencyMs: 0,
    blockTick: 0,
};

/**
 * Reports GoldRush connection status for HYPERCORE_MAINNET.
 *
 * Confirmed working subscriptions on HYPERCORE_MAINNET:
 *   • ohlcvCandlesForToken  — used by useGoldRushPrices + useGoldRushCandles
 *   • ohlcvCandlesForPair   — available, not yet wired
 *   • walletTxs             — per-wallet fills + funding events, not yet wired
 *
 * No subscription exists for public per-coin trade feed or order book —
 * those remain on HL REST (recentTrades, l2Book).
 *
 * This hook reflects the WebSocket connection state from GoldRushContext.
 * blockTick stays at 0; useGoldRushPrices drives price/volume updates directly.
 */
export function useGoldRushStream(): NodeStreamState {
    const { client, status: clientStatus } = useGoldRushClient();
    const [state, setState] = useState<NodeStreamState>(() => ({
        active: IS_GOLDRUSH_ACTIVE,
        status: IS_GOLDRUSH_ACTIVE ? "connecting" : "disconnected",
        blockNumber: 0,
        latencyMs: 0,
        blockTick: 0,
    }));

    useEffect(() => {
        if (!IS_GOLDRUSH_ACTIVE || !client) return;
        setState((prev) => ({ ...prev, active: true, status: clientStatus }));
    }, [client, clientStatus]);

    if (!IS_GOLDRUSH_ACTIVE) return DISCONNECTED;
    return state;
}
