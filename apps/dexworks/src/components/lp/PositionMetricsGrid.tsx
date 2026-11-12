interface Props {
    valueUsd: string;
    amount0: string;
    amount1: string;
    token0Symbol: string;
    token1Symbol: string;
    ilUsd: string;
    ilPercent: string;
    feesUsd: string;
    feesToken0?: string;
    feesToken1?: string;
    feeApr: string;
    netPnlUsd: string;
    feesUsdUncollected?: string;
    timeInRangePct?: number | null;
    isClosed?: boolean;
    withdrawnAmount0?: string;
    withdrawnAmount1?: string;
}

function safeFloat(s: string | undefined): number {
    const n = parseFloat(s ?? "0");
    return isNaN(n) ? 0 : n;
}

function fmtUsd(n: number): string {
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtTokenAmt(raw: string | undefined, isStable: boolean): string {
    const n = safeFloat(raw);
    if (n === 0) return "0";
    if (isStable) return fmtUsd(n);
    if (n < 0.0001) return n.toFixed(6);
    if (n < 0.01) return n.toFixed(5);
    return n.toFixed(4);
}

export function PositionMetricsGrid({
    valueUsd,
    amount0,
    amount1,
    token0Symbol,
    token1Symbol,
    ilUsd,
    ilPercent,
    feesUsd,
    feesToken0,
    feesToken1,
    feeApr,
    netPnlUsd,
    feesUsdUncollected,
    timeInRangePct,
    isClosed,
    withdrawnAmount0,
    withdrawnAmount1,
}: Props) {
    const pnlNum = safeFloat(netPnlUsd);
    const ilNum = safeFloat(ilUsd);
    const feesNum = safeFloat(feesUsd);
    const feeAprNum = safeFloat(feeApr);
    const uncollectedNum = safeFloat(feesUsdUncollected);

    const ilAbs = Math.abs(ilNum);
    const feesAbs = Math.abs(feesNum);
    // null-guard: avoid Infinity/NaN when position has zero price movement
    const feeEfficiency = ilAbs >= 0.001 ? feesAbs / ilAbs : null;
    const feesWinning = feeEfficiency !== null && feesAbs >= ilAbs;

    const displayAmount0 = isClosed && withdrawnAmount0 ? withdrawnAmount0 : amount0;
    const displayAmount1 = isClosed && withdrawnAmount1 ? withdrawnAmount1 : amount1;

    const t1IsStable = token1Symbol === "USDC" || token1Symbol === "USDT" || token1Symbol === "DAI";
    const fees0Num = safeFloat(feesToken0);
    const fees1Num = safeFloat(feesToken1);
    const showFeeBreakdown = fees0Num > 0.00001 || fees1Num > 0.001;

    const pnlPositive = pnlNum >= 0;
    const heroMod = pnlPositive ? "lp-pnl-hero--positive" : "lp-pnl-hero--negative";

    return (
        <div className="lp-metrics-grid">
            {/* ── Hero: Net P&L + fee efficiency ── */}
            <div className={`lp-pnl-hero ${heroMod}`}>
                <span className="lp-pnl-hero-label">NET P&amp;L</span>
                <span className={`lp-pnl-hero-value ${pnlPositive ? "lp-positive" : "lp-negative"}`}>
                    {pnlPositive ? "+" : "−"}${fmtUsd(Math.abs(pnlNum))}
                </span>
                {feeAprNum > 0 && <span className="lp-pnl-hero-apr">{feeAprNum.toFixed(1)}% APR</span>}
                {feeEfficiency !== null && (
                    <span className={`lp-fee-efficiency ${feesWinning ? "lp-positive" : "lp-negative"}`}>
                        {feesWinning ? "✓" : "⚠"} fees {feesWinning ? "covering" : "vs"} IL ({feeEfficiency.toFixed(1)}
                        ×)
                    </span>
                )}
            </div>

            {/* ── Sub-row: FEE APR label + time-in-range bar ── */}
            {timeInRangePct !== null && timeInRangePct !== undefined && (
                <div className="lp-metrics-subrow">
                    <span className="lp-metrics-subrow-item">
                        <span className="lp-metrics-sublabel">IN RANGE</span>
                        <span className="lp-metrics-subvalue">{timeInRangePct}%</span>
                        <div className="lp-time-bar-track">
                            <div className="lp-time-bar-fill" style={{ width: `${Math.min(timeInRangePct, 100)}%` }} />
                        </div>
                    </span>
                </div>
            )}

            {/* ── 3-col detail grid ── */}
            <div className="lp-metrics-detail-grid">
                <div className="lp-metric">
                    <div className="lp-metric-label">{isClosed ? "WITHDRAWN VALUE" : "POSITION VALUE"}</div>
                    <div className="lp-metric-value">${fmtUsd(safeFloat(valueUsd))}</div>
                    <div className="lp-metric-sub">
                        {fmtTokenAmt(displayAmount0, false)} {token0Symbol}
                    </div>
                    <div className="lp-metric-sub">
                        {fmtTokenAmt(displayAmount1, t1IsStable)} {token1Symbol}
                    </div>
                </div>

                <div className="lp-metric">
                    <div className="lp-metric-label">FEES {isClosed ? "COLLECTED" : "EARNED"}</div>
                    <div className="lp-metric-value lp-positive">+${fmtUsd(feesNum)}</div>
                    {showFeeBreakdown ? (
                        <div className="lp-metric-breakdown">
                            {fees0Num > 0.00001 && (
                                <span>
                                    {fmtTokenAmt(feesToken0, false)} {token0Symbol}
                                </span>
                            )}
                            {fees0Num > 0.00001 && fees1Num > 0.001 && <span className="lp-breakdown-sep">+</span>}
                            {fees1Num > 0.001 && (
                                <span>
                                    {fmtTokenAmt(feesToken1, t1IsStable)} {token1Symbol}
                                </span>
                            )}
                        </div>
                    ) : (
                        <div className="lp-metric-sub">{isClosed ? "collected" : `${feeApr}% APR`}</div>
                    )}
                    {!isClosed && uncollectedNum > 0.01 && (
                        <div className="lp-metric-sub lp-uncollected-sub">⚡ +${uncollectedNum.toFixed(2)} pending</div>
                    )}
                </div>

                <div className="lp-metric">
                    <div className="lp-metric-label">IL COST</div>
                    <div className={`lp-metric-value ${ilNum >= 0 ? "lp-positive" : "lp-negative"}`}>
                        {ilNum >= 0 ? "+" : "−"}${Math.abs(ilNum).toFixed(2)}
                        {ilNum !== 0 && <span className="lp-metric-pct"> ({ilPercent}%)</span>}
                    </div>
                </div>
            </div>
        </div>
    );
}
