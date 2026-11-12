interface Props {
    priceLower: number;
    priceUpper: number;
    currentPrice: number;
    inRange: boolean;
    percentThrough: number;
    token0Symbol?: string;
    token1Symbol?: string;
}

function fmtRangePrice(p: number): string {
    if (p >= 10000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 1 });
    if (p >= 1) return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return p.toPrecision(4);
}

function fmtDist(d: number): string {
    // sub-cent distances need 4dp; larger ones need 2dp
    if (d < 0.01) return d.toFixed(4);
    if (d < 1) return d.toFixed(3);
    return d.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PositionRangeSlider({
    priceLower,
    priceUpper,
    currentPrice,
    inRange,
    percentThrough,
    token0Symbol = "TOKEN0",
    token1Symbol = "TOKEN1",
}: Props) {
    const clampedPct = Math.max(0, Math.min(1, percentThrough));
    const rangeWidth = priceUpper - priceLower;
    const pctThrough = rangeWidth > 0 ? Math.round(((currentPrice - priceLower) / rangeWidth) * 100) : 0;
    const distToLower = Math.abs(currentPrice - priceLower);
    const distToUpper = Math.abs(priceUpper - currentPrice);

    const belowRange = currentPrice < priceLower;
    const outDist = belowRange ? distToLower : distToUpper;

    return (
        <div className="lp-range-slider">
            <div className="lp-range-bound-row">
                <div className="lp-range-bound">
                    <span className="lp-range-sym">{token0Symbol}</span>
                    <span className="lp-range-price">${fmtRangePrice(priceLower)}</span>
                </div>
                <div className="lp-range-center-label">
                    {inRange ? (
                        <span className="lp-range-current-price">${fmtRangePrice(currentPrice)}</span>
                    ) : (
                        <span className="lp-range-out-text">{belowRange ? "BELOW RANGE" : "ABOVE RANGE"}</span>
                    )}
                </div>
                <div className="lp-range-bound lp-range-bound--right">
                    <span className="lp-range-sym">{token1Symbol}</span>
                    <span className="lp-range-price">${fmtRangePrice(priceUpper)}</span>
                </div>
            </div>

            <div className="lp-range-track-wrap">
                <div className="lp-range-track">
                    <div className={`lp-range-fill ${inRange ? "lp-range-fill--active" : "lp-range-fill--inactive"}`} />
                    <div
                        className={`lp-range-dot${!inRange ? " lp-range-dot--out" : ""}`}
                        style={{ left: `${clampedPct * 100}%` }}
                        title={`${(clampedPct * 100).toFixed(0)}% through range`}
                    />
                </div>
            </div>

            {/* Distance sub-row */}
            {inRange ? (
                <div className="lp-range-distances">
                    <span className="lp-range-dist">+${fmtDist(distToLower)} from lower</span>
                    <span className="lp-range-dist-mid">{pctThrough}% through</span>
                    <span className="lp-range-dist">−${fmtDist(distToUpper)} to upper</span>
                </div>
            ) : (
                <div className="lp-range-distances lp-range-distances--out">
                    <span className="lp-range-dist-out">
                        {outDist < 0.01
                            ? belowRange
                                ? "AT LOWER BOUND"
                                : "AT UPPER BOUND"
                            : `$${fmtDist(outDist)} ${belowRange ? "below lower bound" : "above upper bound"}`}
                    </span>
                </div>
            )}
        </div>
    );
}
