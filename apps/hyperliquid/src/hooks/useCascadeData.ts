import { useNodeStreamContext } from "../context/NodeStreamContext";
import type { CascadeChain } from "../utils/liquidation";
import { IS_NODE_STREAM_ACTIVE } from "./useNodeStream";
import { useEffect, useState } from "react";

export interface CascadeData {
    active: CascadeChain | null;
    history: CascadeChain[];
}

const EMPTY: CascadeData = { active: null, history: [] };

export function useCascadeData(coin: string | null): CascadeData {
    const stream = useNodeStreamContext();
    const [data, setData] = useState<CascadeData>(EMPTY);

    useEffect(() => {
        if (!IS_NODE_STREAM_ACTIVE || !coin) {
            setData(EMPTY);
            return;
        }
        // Cascade chain data is not yet tracked in nodeStore; return empty until implemented
        setData(EMPTY);
    }, [coin, stream.blockTick]);

    return data;
}
