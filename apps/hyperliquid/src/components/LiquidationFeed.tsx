import type { LiveLiquidation } from "../types";
import { formatUSD } from "../utils/format";
import { formatLiqMethod, truncateUser } from "../utils/liquidation";
import { useState } from "react";

type MethodFilter = "ALL" | "MARKET" | "BACKSTOP";

interface LiquidationFeedProps {
    liquidations: LiveLiquidation[];
    selectedCoin?: string | null;
}

export function LiquidationFeed({ liquidations, selectedCoin }: LiquidationFeedProps) {
    const [methodFilter, setMethodFilter] = useState<MethodFilter>("ALL");

    const filtered = liquidations
        .filter((l) => {
            if (methodFilter !== "ALL" && l.method !== methodFilter) return false;
            if (selectedCoin && l.coin !== selectedCoin) return false;
            return true;
        })
        .slice()
        .reverse()
        .slice(0, 100);

    return (
        <div className="liq-feed">
            <div className="liq-feed-controls">
                {(["ALL", "MARKET", "BACKSTOP"] as MethodFilter[]).map((m) => (
                    <button
                        key={m}
                        className={`liq-filter-btn${methodFilter === m ? " liq-filter-btn--active" : ""}`}
                        onClick={() => setMethodFilter(m)}
                    >
                        {m}
                    </button>
                ))}
            </div>
            <div className="liq-feed-list">
                {filtered.length === 0 ? (
                    <div className="liq-feed-empty">No liquidations yet</div>
                ) : (
                    filtered.map((liq) => (
                        <div key={liq.id} className="liq-event-row">
                            <span className="liq-event-coin">{liq.coin}</span>
                            <span className="liq-event-user">{truncateUser(liq.user)}</span>
                            <span className="liq-event-size">{formatUSD(liq.sz * liq.markPx)}</span>
                            <span className="liq-event-mark val-muted">@{liq.markPx.toFixed(2)}</span>
                            <span className={`liq-method-badge liq-method-badge--${liq.method.toLowerCase()}`}>
                                {formatLiqMethod(liq.method)}
                            </span>
                            <span className="liq-event-time val-dim">{new Date(liq.time).toLocaleTimeString()}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
