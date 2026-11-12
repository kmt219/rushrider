import { useNodeStreamContext } from "../context/NodeStreamContext";
import { nodeStore } from "../stream/stateStore";
import type { LiveLiquidation } from "../types";
import { IS_NODE_STREAM_ACTIVE } from "./useNodeStream";
import { useEffect, useState } from "react";

/**
 * Returns a cross-market feed of all recent liquidations across every coin
 * tracked by the node stream, sorted newest-first (max 500 entries).
 */
export function useAllLiqs(): LiveLiquidation[] {
    const stream = useNodeStreamContext();
    const [liqs, setLiqs] = useState<LiveLiquidation[]>([]);

    useEffect(() => {
        if (!IS_NODE_STREAM_ACTIVE) return;
        setLiqs(nodeStore.getAllLiqHistory(500));
    }, [stream.blockTick]);

    return liqs;
}
