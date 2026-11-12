import type { MockLiquidation } from "../types";
import { formatPrice, formatSize, shortenAddress } from "../utils/format";
import { LiqBadge } from "./ui/LiqBadge";

interface LiquidationHistoryProps {
    liquidations: MockLiquidation[];
}

export function LiquidationHistory({ liquidations }: LiquidationHistoryProps) {
    if (liquidations.length === 0) {
        return <div className="empty-msg">No recent liquidations</div>;
    }

    return (
        <div className="liq-history">
            {liquidations.slice(0, 30).map((liq) => (
                <div key={liq.id} className="liq-row">
                    <span className={`liq-side liq-side--${liq.side}`}>{liq.side.toUpperCase()}</span>
                    <LiqBadge method={liq.method} />
                    <span className="liq-user">{shortenAddress(liq.user)}</span>
                    <span className="liq-size">{formatSize(liq.sz)}</span>
                    <span className="liq-price">@ {formatPrice(liq.markPx)}</span>
                </div>
            ))}
        </div>
    );
}
