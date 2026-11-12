import { IS_GOLDRUSH_ACTIVE, useGoldRushClient } from "../context/GoldRushContext";
import { useNodeStreamContext } from "../context/NodeStreamContext";
import { nodeStore } from "../stream/stateStore";
import type { LiveLiquidation, MockLiquidation } from "../types";
import { IS_NODE_STREAM_ACTIVE } from "./useNodeStream";
import { useEffect, useMemo, useState } from "react";

// Shape adaptor: LiveLiquidation → MockLiquidation
function toLegacy(liq: LiveLiquidation): MockLiquidation {
    return {
        id: liq.id,
        coin: liq.coin,
        user: liq.user,
        side: "long", // not available from node stream without position tracking
        sz: liq.sz,
        markPx: liq.markPx,
        liqPx: liq.markPx, // liqPx == markPx for market liquidations
        method: liq.method === "BACKSTOP" ? "backstop" : "liquidation",
        time: liq.time,
    };
}

export function useLiquidations(coin: string | null): { liquidations: MockLiquidation[]; loading: boolean } {
    const stream = useNodeStreamContext();
    const { stores, liqTick } = useGoldRushClient();
    const [nodeLiquidations, setNodeLiquidations] = useState<MockLiquidation[]>([]);

    // GoldRush path — read from liqStore; re-runs whenever liqTick increments
    const grLiqs = useMemo(() => {
        if (!IS_GOLDRUSH_ACTIVE || !coin) return [];
        const entries = stores.liqStore.get(coin) ?? [];
        return entries.map((e, i) => ({
            id: `${e.time}-${i}`,
            coin: e.coin,
            user: e.liquidatedUser,
            side: "long" as const, // side field on GoldRushLiqEntry is B/A (taker direction), not position side
            sz: e.sz,
            markPx: e.marketPx,
            liqPx: e.marketPx,
            method: e.method === "BACKSTOP" ? ("backstop" as const) : ("liquidation" as const),
            time: new Date(e.time).toISOString(),
        }));
    }, [stores.liqStore, coin, liqTick]);

    // Node stream path — only active when IS_NODE_STREAM_ACTIVE is true
    useEffect(() => {
        if (!IS_NODE_STREAM_ACTIVE || !coin) return;
        setNodeLiquidations(nodeStore.getLiqHistory(coin).map(toLegacy));
    }, [coin, stream.blockTick]);

    // GoldRush mode takes priority over node stream
    if (IS_GOLDRUSH_ACTIVE) return { liquidations: grLiqs, loading: false };
    return { liquidations: nodeLiquidations, loading: false };
}
