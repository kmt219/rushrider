import { decodeNodeMessage } from "../stream/decode";
import { processFills } from "../stream/fillProcessor";
import { processMisc } from "../stream/miscProcessor";
import { processOrders } from "../stream/orderProcessor";
import { processTrades } from "../stream/tradeProcessor";
import type { ConnectionState } from "../types";
import { useEffect, useRef, useCallback, useState } from "react";

const NODE_WS_URL = import.meta.env.VITE_HL_NODE_WS_URL as string | undefined;

/** Build-time constant — true when VITE_HL_NODE_WS_URL env var is set */
export const IS_NODE_STREAM_ACTIVE = Boolean(NODE_WS_URL);

export interface NodeStreamState {
    /** true when VITE_HL_NODE_WS_URL is set and stream is active */
    active: boolean;
    status: ConnectionState;
    blockNumber: number;
    latencyMs: number;
    /** Increments on each block so subscribers know to re-read the store */
    blockTick: number;
}

export function useNodeStream(): NodeStreamState {
    const [state, setState] = useState<NodeStreamState>({
        active: Boolean(NODE_WS_URL),
        status: NODE_WS_URL ? "connecting" : "disconnected",
        blockNumber: 0,
        latencyMs: 0,
        blockTick: 0,
    });

    const wsRef = useRef<WebSocket | null>(null);
    const rafRef = useRef<number | null>(null);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingBlockRef = useRef<{ blockNumber: number; latencyMs: number } | null>(null);

    const scheduleStateSync = useCallback(() => {
        if (rafRef.current !== null) return;
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            const pending = pendingBlockRef.current;
            pendingBlockRef.current = null;
            setState((prev) => ({
                ...prev,
                ...(pending ? { blockNumber: pending.blockNumber, latencyMs: pending.latencyMs } : {}),
                blockTick: prev.blockTick + 1,
            }));
        });
    }, []);

    useEffect(() => {
        if (!NODE_WS_URL) return;

        const connect = () => {
            setState((prev) => ({ ...prev, status: "connecting" }));
            const ws = new WebSocket(NODE_WS_URL);
            ws.binaryType = "arraybuffer";
            wsRef.current = ws;

            ws.onopen = () => {
                setState((prev) => ({ ...prev, status: "connected" }));
            };

            ws.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
                const receiveTime = Date.now();
                void decodeNodeMessage(event.data).then((msg) => {
                    if (!msg) return;

                    if (msg.type === "fills") {
                        processFills(msg.payload);
                        const blockTs = new Date(msg.payload.block_time).getTime();
                        const latencyMs = blockTs > 0 ? receiveTime - blockTs : 0;
                        pendingBlockRef.current = {
                            blockNumber:
                                typeof msg.payload.block_number === "number"
                                    ? msg.payload.block_number
                                    : parseInt(String(msg.payload.block_number), 10),
                            latencyMs,
                        };
                        scheduleStateSync();
                    } else if (msg.type === "trades") {
                        processTrades(msg.payload);
                        scheduleStateSync();
                    } else if (msg.type === "orders") {
                        processOrders(msg.payload);
                        scheduleStateSync();
                    } else if (msg.type === "misc") {
                        processMisc(msg.payload);
                        scheduleStateSync();
                    }
                });
            };

            ws.onerror = () => setState((prev) => ({ ...prev, status: "error" }));

            ws.onclose = () => {
                setState((prev) => ({ ...prev, status: "disconnected" }));
                wsRef.current = null;
                // Reconnect after 3 seconds (timer stored so cleanup can cancel it)
                reconnectTimerRef.current = setTimeout(connect, 3000);
            };
        };

        connect();

        return () => {
            if (reconnectTimerRef.current !== null) {
                clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }
            if (wsRef.current) {
                wsRef.current.onclose = null; // prevent reconnect loop on unmount
                wsRef.current.close();
                wsRef.current = null;
            }
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, []);

    return state;
}

/** Convenience: is the node stream configured? */
export function isNodeStreamActive(): boolean {
    return Boolean(NODE_WS_URL);
}
