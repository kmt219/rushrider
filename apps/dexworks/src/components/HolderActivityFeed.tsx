import type { HolderEvent, HolderNode } from "../types";
import { formatUSD, getTimeAgo } from "../utils";

interface HolderActivityFeedProps {
    events: HolderEvent[];
    nodes: HolderNode[];
}

const TYPE_LABELS: Record<HolderEvent["type"], string> = {
    buy: "BUY",
    sell: "SELL",
    transfer: "XFER",
};

export function HolderActivityFeed({ events, nodes }: HolderActivityFeedProps) {
    const nodeMap = new Map(nodes.map((n) => [n.address, n]));

    if (events.length === 0) {
        return (
            <div className="haf-root">
                <div className="haf-empty">Watching top-20 holders for live activity…</div>
            </div>
        );
    }

    return (
        <div className="haf-root">
            {events.map((ev) => {
                const node = nodeMap.get(ev.address);
                const shortAddr = `${ev.address.slice(0, 6)}…${ev.address.slice(-4)}`;
                return (
                    <div key={ev.id} className={`haf-row haf-row--${ev.type}`}>
                        <span className={`haf-type haf-type--${ev.type}`}>{TYPE_LABELS[ev.type]}</span>
                        <span className="haf-addr">{shortAddr}</span>
                        {node && (
                            <span className={`haf-tier haf-tier--${node.riskTier}`}>{node.riskTier.toUpperCase()}</span>
                        )}
                        {ev.valueUsd !== undefined && ev.valueUsd > 0 && (
                            <span className={`haf-amount haf-amount--${ev.type}`}>{formatUSD(ev.valueUsd)}</span>
                        )}
                        <span className="haf-time">{getTimeAgo(ev.receivedAt)}</span>
                    </div>
                );
            })}
        </div>
    );
}
