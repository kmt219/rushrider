import type { MockTrade } from "../types";

interface OrderFlowPanelProps {
    trades: MockTrade[];
}

export function OrderFlowPanel({ trades }: OrderFlowPanelProps) {
    if (trades.length === 0) {
        return <div className="empty-msg">Waiting for trade data...</div>;
    }

    const buyCount = trades.filter((t) => t.side === "B").length;
    const sellCount = trades.length - buyCount;
    const total = trades.length;
    const buyPct = (buyCount / total) * 100;

    const buyVolume = trades.filter((t) => t.side === "B").reduce((sum, t) => sum + t.sz * t.px, 0);
    const sellVolume = trades.filter((t) => t.side === "A").reduce((sum, t) => sum + t.sz * t.px, 0);
    const totalVolume = buyVolume + sellVolume;
    const buyVolPct = totalVolume > 0 ? (buyVolume / totalVolume) * 100 : 50;

    return (
        <div className="order-flow">
            <div className="chart-title">Order Flow (Recent {total} trades)</div>

            <div style={{ marginBottom: 12 }}>
                <div className="fee-row">
                    <span className="fee-label">Trade Count</span>
                    <span className="fee-value">
                        {buyCount} buy / {sellCount} sell
                    </span>
                </div>
                <div className="order-flow-bar">
                    <div className="order-flow-buy" style={{ width: `${buyPct}%` }} />
                    <div className="order-flow-sell" style={{ width: `${100 - buyPct}%` }} />
                </div>
                <div className="order-flow-labels">
                    <span>{buyPct.toFixed(0)}% Buy</span>
                    <span>{(100 - buyPct).toFixed(0)}% Sell</span>
                </div>
            </div>

            <div>
                <div className="fee-row">
                    <span className="fee-label">Volume ($)</span>
                    <span className="fee-value">
                        ${(buyVolume / 1000).toFixed(1)}K / ${(sellVolume / 1000).toFixed(1)}K
                    </span>
                </div>
                <div className="order-flow-bar">
                    <div className="order-flow-buy" style={{ width: `${buyVolPct}%` }} />
                    <div className="order-flow-sell" style={{ width: `${100 - buyVolPct}%` }} />
                </div>
                <div className="order-flow-labels">
                    <span>{buyVolPct.toFixed(0)}% Buy</span>
                    <span>{(100 - buyVolPct).toFixed(0)}% Sell</span>
                </div>
            </div>
        </div>
    );
}
