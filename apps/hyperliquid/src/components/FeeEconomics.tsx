import type { HIP3Market } from "../types";
import { formatUSD, formatPercent, formatBps } from "../utils/format";

interface FeeEconomicsProps {
    market: HIP3Market;
    /** Live M/T ratio from the detail-panel trade feed — preferred over market.makerTakerRatio
     *  (which uses a separate 20s poll window, causing the two displays to diverge). */
    liveMakerRatio?: number | null;
}

export function FeeEconomics({ market, liveMakerRatio }: FeeEconomicsProps) {
    const { makerFee, takerFee } = market;
    const mtRatio = liveMakerRatio ?? market.makerTakerRatio;
    const hasRealData = market.builderRevenue24h > 0;
    void takerFee; // used implicitly via market; estimated revenue calc deferred to Phase 2

    return (
        <div className="fee-economics">
            <div className="chart-title">Fee Economics</div>
            <div className="fee-row">
                <span className="fee-label">Maker Fee</span>
                <span className="fee-value val-positive">{formatBps(makerFee * 10000)}</span>
            </div>
            <div className="fee-row">
                <span className="fee-label">Taker Fee</span>
                <span className="fee-value">{formatBps(takerFee * 10000)}</span>
            </div>
            <div className="fee-row">
                <span className="fee-label">M/T Ratio</span>
                <span className="fee-value">
                    {(mtRatio * 100).toFixed(0)}% / {((1 - mtRatio) * 100).toFixed(0)}%
                </span>
            </div>
            <div className="fee-row">
                <span className="fee-label">Builder Rev (24h)</span>
                <span className="fee-value">{hasRealData ? formatUSD(market.builderRevenue24h) : "—"}</span>
            </div>
            <div className="fee-row">
                <span className="fee-label">Avg Builder Fee</span>
                <span className="fee-value">{hasRealData ? formatPercent(market.avgBuilderFeeRate) : "—"}</span>
            </div>
            <div className="fee-row">
                <span className="fee-label">Funding Rate</span>
                <span className={`fee-value ${market.fundingRate >= 0 ? "val-positive" : "val-negative"}`}>
                    {formatPercent(market.fundingRate)}
                </span>
            </div>
            <div className="fee-row">
                <span className="fee-label">Builder</span>
                <span className="fee-value">{market.builder}</span>
            </div>
            {market.marketClass === "hip-3" && (
                <div className="fee-disclaimer">
                    HIP-3 builder fees may differ — rates shown are standard Hyperliquid defaults
                </div>
            )}
        </div>
    );
}
