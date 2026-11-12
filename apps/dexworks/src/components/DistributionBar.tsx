import type { ConcentrationData } from "../types";

interface DistributionBarProps {
    data: ConcentrationData;
}

/**
 * Stacked horizontal bar showing top-1 / top-5 / top-10 / rest holder breakdown.
 * Purely CSS-driven — no chart library needed.
 */
export function DistributionBar({ data }: DistributionBarProps) {
    const top1 = data.topHolderPct;
    const top5 = Math.max(0, data.top5HolderPct - top1);
    const top10 = Math.max(0, data.top10HolderPct - data.top5HolderPct);
    const rest = Math.max(0, 100 - data.top10HolderPct);

    return (
        <div className="dist-bar-root">
            <div className="dist-bar-track">
                <div
                    className="dist-bar-seg dist-seg-top1"
                    style={{ width: `${top1}%` }}
                    title={`Top 1: ${data.topHolderPct.toFixed(1)}%`}
                />
                <div
                    className="dist-bar-seg dist-seg-top5"
                    style={{ width: `${top5}%` }}
                    title={`Top 2-5: ${top5.toFixed(1)}%`}
                />
                <div
                    className="dist-bar-seg dist-seg-top10"
                    style={{ width: `${top10}%` }}
                    title={`Top 6-10: ${top10.toFixed(1)}%`}
                />
                <div
                    className="dist-bar-seg dist-seg-rest"
                    style={{ width: `${rest}%` }}
                    title={`Rest: ${rest.toFixed(1)}%`}
                />
            </div>
            <div className="dist-bar-legend">
                <span>
                    TOP 1 <strong>{data.topHolderPct.toFixed(1)}%</strong>
                </span>
                <span>
                    TOP 5 <strong>{data.top5HolderPct.toFixed(1)}%</strong>
                </span>
                <span>
                    TOP 10 <strong>{data.top10HolderPct.toFixed(1)}%</strong>
                </span>
                <span className="dist-bar-total">{data.totalCount.toLocaleString()} HOLDERS</span>
            </div>
        </div>
    );
}
