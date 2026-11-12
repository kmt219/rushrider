import type { Position } from "./LPDashboard";
import { PositionMetricsGrid } from "./PositionMetricsGrid";
import { PositionRangeSlider } from "./PositionRangeSlider";
import { useState, lazy, Suspense, memo } from "react";

const PnLChart = lazy(() => import("./PnLChart").then((m) => ({ default: m.PnLChart })));
const PositionHistory = lazy(() => import("./PositionHistory").then((m) => ({ default: m.PositionHistory })));

interface Props {
    position: Position;
    pool: string;
    chainName: string;
}

const STATUS_LABELS = {
    in_range: "● IN RANGE",
    out_range: "○ OUT OF RANGE",
    closed: "✕ CLOSED",
};

function fmtPrice(p: number): string {
    if (p >= 10000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 1 });
    if (p >= 1) return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return p.toPrecision(4);
}

export const PositionCard = memo(function PositionCard({ position: pos, pool, chainName }: Props) {
    const [expanded, setExpanded] = useState(false);

    const outOfRange = pos.status === "active" && !pos.in_range;
    const statusLabel =
        pos.status === "closed" ? STATUS_LABELS.closed : outOfRange ? STATUS_LABELS.out_range : STATUS_LABELS.in_range;
    const statusClass = pos.status === "closed" ? "lp-status--closed" : outOfRange ? "lp-status--out" : "lp-status--in";

    const uniswapBase =
        chainName === "base"
            ? "https://app.uniswap.org/positions/v3/base"
            : "https://app.uniswap.org/positions/v3/ethereum";

    const uncollectedNum = parseFloat(pos.fees_usd_uncollected ?? "0");
    const isClosed = pos.status === "closed";

    const cardClass = isClosed
        ? "lp-position-card lp-position-card--closed"
        : outOfRange
          ? "lp-position-card lp-position-card--out-range"
          : "lp-position-card lp-position-card--in-range";

    const priceLower = parseFloat(pos.price_lower);
    const priceUpper = parseFloat(pos.price_upper);

    return (
        <div className={cardClass}>
            <div className="lp-position-header">
                <div className="lp-position-id">
                    POSITION #
                    <a
                        href={`${uniswapBase}/${pos.token_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="lp-token-link"
                    >
                        {pos.token_id}
                    </a>
                </div>
                <span className={`lp-status ${statusClass}`}>{statusLabel}</span>
                {uncollectedNum > 1 && (
                    <span className="lp-uncollected-badge" title="Uncollected fees pending">
                        ⚡ +${uncollectedNum.toFixed(2)}
                    </span>
                )}
                {!isClosed && (
                    <span className="lp-range-width-badge" title="Price range width as % of lower bound">
                        ±{(((priceUpper - priceLower) / priceLower) * 100).toFixed(2)}% range
                    </span>
                )}
                <button
                    className="lp-expand-btn"
                    onClick={() => setExpanded((e) => !e)}
                    aria-label={expanded ? "Collapse position details" : "Expand position details"}
                >
                    {expanded ? "▲" : "▼"}
                </button>
            </div>

            {!isClosed ? (
                <PositionRangeSlider
                    priceLower={priceLower}
                    priceUpper={priceUpper}
                    currentPrice={priceLower + (priceUpper - priceLower) * pos.percent_through_range}
                    inRange={pos.in_range}
                    percentThrough={pos.percent_through_range}
                    token0Symbol={pos.token0_symbol}
                    token1Symbol={pos.token1_symbol}
                />
            ) : (
                <div className="lp-closed-range">
                    <span className="lp-closed-range-label">RANGE</span>
                    <span className="lp-closed-range-prices">
                        ${fmtPrice(priceLower)} — ${fmtPrice(priceUpper)}
                    </span>
                    <span className="lp-closed-range-pair">
                        {pos.token0_symbol}/{pos.token1_symbol}
                    </span>
                </div>
            )}

            <PositionMetricsGrid
                valueUsd={pos.value_usd}
                amount0={pos.amount0_current}
                amount1={pos.amount1_current}
                token0Symbol={pos.token0_symbol}
                token1Symbol={pos.token1_symbol}
                ilUsd={pos.il_usd}
                ilPercent={pos.il_percent}
                feesUsd={pos.fees_usd_total}
                feesToken0={pos.fees_token0_collected}
                feesToken1={pos.fees_token1_collected}
                feeApr={pos.fee_apr}
                netPnlUsd={pos.net_pnl_usd}
                feesUsdUncollected={pos.fees_usd_uncollected}
                timeInRangePct={pos.time_in_range_percent}
                isClosed={isClosed}
                withdrawnAmount0={pos.amount0_withdrawn}
                withdrawnAmount1={pos.amount1_withdrawn}
            />

            {expanded && (
                <div className="lp-position-expanded">
                    <Suspense fallback={<div className="lp-pnl-loading">Loading chart…</div>}>
                        <PnLChart pool={pool} tokenId={pos.token_id} />
                    </Suspense>
                    <Suspense fallback={<div className="lp-history-loading">Loading history…</div>}>
                        <PositionHistory
                            pool={pool}
                            tokenId={pos.token_id}
                            chainName={chainName}
                            token0Symbol={pos.token0_symbol}
                            token1Symbol={pos.token1_symbol}
                        />
                    </Suspense>
                </div>
            )}
        </div>
    );
});
