import { formatUSD } from "../utils/format";
import type { CascadeChain } from "../utils/liquidation";

interface CascadeBannerProps {
    cascade: CascadeChain;
    onDismiss?: () => void;
}

export function CascadeBanner({ cascade, onDismiss }: CascadeBannerProps) {
    const isBackstop = cascade.backstopCount > 0;
    return (
        <div className={`cascade-banner${isBackstop ? " cascade-banner--backstop" : ""}`}>
            <span className="cascade-banner-icon">⚡</span>
            <span className="cascade-banner-title">ACTIVE CASCADE: {cascade.coin}</span>
            <span className="cascade-banner-sep">—</span>
            <span className="cascade-banner-stat">{cascade.liquidations.length} users liquidated</span>
            <span className="cascade-banner-sep">·</span>
            <span className="cascade-banner-stat">{formatUSD(cascade.totalVolumeLiquidated)} total</span>
            <span className="cascade-banner-sep">·</span>
            <span className="cascade-banner-stat">
                {cascade.priceImpact > 0 ? "+" : ""}
                {cascade.priceImpact.toFixed(2)}% price impact
            </span>
            {cascade.backstopCount > 0 && (
                <>
                    <span className="cascade-banner-sep">·</span>
                    <span className="cascade-banner-backstop">{cascade.backstopCount} BACKSTOP</span>
                </>
            )}
            {onDismiss && (
                <button className="cascade-banner-close" onClick={onDismiss} aria-label="Dismiss">
                    ×
                </button>
            )}
        </div>
    );
}
