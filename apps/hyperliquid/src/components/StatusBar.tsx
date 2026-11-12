import { IS_GOLDRUSH_ACTIVE, GOLDRUSH_CHAIN } from "../context/GoldRushContext";
import { IS_NODE_STREAM_ACTIVE } from "../hooks/useNodeStream";
import type { ConnectionState } from "../types";

interface StatusBarProps {
    marketCount: number;
    blockNumber: number;
    nodeStreamStatus: ConnectionState;
    nodeLatencyMs: number;
    goldRushStatus?: ConnectionState;
}

export function StatusBar({
    marketCount,
    blockNumber,
    nodeStreamStatus,
    nodeLatencyMs,
    goldRushStatus = "disconnected",
}: StatusBarProps) {
    const nodeConnected = IS_NODE_STREAM_ACTIVE && nodeStreamStatus === "connected";
    const grConnected = IS_GOLDRUSH_ACTIVE && goldRushStatus === "connected";
    const live = nodeConnected || grConnected;

    return (
        <div className="status-bar">
            <div className="status-bar-left">
                <div className={`status-dot${live ? " status-dot--live" : ""}`} />
                {IS_NODE_STREAM_ACTIVE ? (
                    <span>
                        Node stream · {nodeStreamStatus} · Block #{blockNumber.toLocaleString()} · {nodeLatencyMs}ms
                    </span>
                ) : IS_GOLDRUSH_ACTIVE ? (
                    <span>
                        GoldRush · {goldRushStatus} · {GOLDRUSH_CHAIN} · ~30s refresh
                    </span>
                ) : (
                    <span>No data source — set VITE_GOLDRUSH_API_KEY or VITE_HL_NODE_WS_URL</span>
                )}
            </div>
            <div className="status-bar-right">
                <span>{marketCount} markets</span>
            </div>
        </div>
    );
}
