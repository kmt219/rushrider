import type { MockTrade } from "../types";
import { baseCoin, formatPrice, formatSize } from "../utils/format";

interface TradeFeedProps {
    trades: MockTrade[];
    isOutcome?: boolean;
}

function formatTime(iso: string): string {
    const d = new Date(iso);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

export function TradeFeed({ trades, isOutcome }: TradeFeedProps) {
    if (trades.length === 0) {
        return <div className="empty-msg">Waiting for trades...</div>;
    }

    const coin = trades[0]?.coin ?? "";
    const coinLabel = baseCoin(coin);
    const sizeHeader = isOutcome ? "Size (Yes)" : coinLabel ? `Size (${coinLabel})` : "Size";

    return (
        <div className="trade-feed">
            <div className="trade-feed-header">
                <span>Price</span>
                <span>{sizeHeader}</span>
                <span>Time</span>
            </div>
            {trades.slice(0, 50).map((t) => (
                <div key={t.id} className={`trade-row${t.liquidation ? " trade-row--liq" : ""}`}>
                    <span className={`trade-price ${t.side === "B" ? "val-positive" : "val-negative"}`}>
                        {formatPrice(t.px)}
                        {t.liquidation && <span className="trade-liq-tag">LIQ</span>}
                    </span>
                    <span className="trade-size">{formatSize(t.sz)}</span>
                    <span className="trade-time">{formatTime(t.time)}</span>
                </div>
            ))}
        </div>
    );
}
