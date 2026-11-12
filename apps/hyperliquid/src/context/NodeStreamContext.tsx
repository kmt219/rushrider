import { useNodeStream, type NodeStreamState } from "../hooks/useNodeStream";
import { createContext, useContext, type ReactNode } from "react";

const DISCONNECTED_STATE: NodeStreamState = {
    active: false,
    status: "disconnected",
    blockNumber: 0,
    latencyMs: 0,
    blockTick: 0,
};

const NodeStreamContext = createContext<NodeStreamState>(DISCONNECTED_STATE);

export function NodeStreamProvider({ children }: { children: ReactNode }) {
    const stream = useNodeStream();
    return <NodeStreamContext.Provider value={stream}>{children}</NodeStreamContext.Provider>;
}

export function useNodeStreamContext(): NodeStreamState {
    return useContext(NodeStreamContext);
}
