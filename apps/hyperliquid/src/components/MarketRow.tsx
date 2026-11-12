import type { HIP3Market } from "../types";
import { baseCoin, formatPrice, formatUSD, formatPercent, formatFundingRate } from "../utils/format";
import { FlashValue } from "./ui/FlashValue";
import { memo } from "react";

type ColumnMode = "perp" | "hip3" | "spot" | "outcome";

interface MarketRowProps {
    market: HIP3Market;
    maxVolume: number;
    selected: boolean;
    onClick: () => void;
    columnMode?: ColumnMode;
    /** @deprecated use columnMode="spot" */
    spotMode?: boolean;
}

/** Annualise an 8-hour funding rate: rate × 3 periods/day × 365 days.
 *  Returns "—" when rate is zero (no stream data yet). */
function fundingApr(rate: number): string {
    if (rate === 0) return "—";
    const apr = rate * 3 * 365 * 100;
    const sign = apr >= 0 ? "+" : "";
    return `${sign}${apr.toFixed(1)}%`;
}

/** Render a mini horizontal bar for OI utilization (0–1). */
function OIGaugeBar({ utilization }: { utilization: number }) {
    const pct = Math.min(utilization * 100, 100);
    const color = pct >= 99 ? "var(--negative)" : pct >= 80 ? "var(--warning)" : "var(--accent-dim)";
    return (
        <div className="oi-gauge-wrap">
            <div className="oi-gauge-bar" style={{ width: `${pct}%`, background: color }} />
            <span className="oi-gauge-label">{pct.toFixed(0)}%</span>
        </div>
    );
}

function MarketRow({ market, maxVolume, selected, onClick, columnMode, spotMode }: MarketRowProps) {
    // Resolve effective mode — prefer columnMode, fall back to legacy spotMode prop
    const mode: ColumnMode = columnMode ?? (spotMode ? "spot" : "perp");

    const changeClass = market.change24h >= 0 ? "val-positive" : "val-negative";
    const fundingClass =
        Math.abs(market.fundingRate) > 0.001 ? (market.fundingRate > 0 ? "val-positive" : "val-negative") : "val-muted";

    const rowClass = [selected ? "selected" : "", market.isAtCap ? "row-at-cap" : ""].filter(Boolean).join(" ");

    const spreadDisplay =
        market.spreadBps > 0 ? `${market.spreadBps.toFixed(1)}bp` : <span className="val-muted">—</span>;
    const mtDisplay =
        market.makerTakerRatio > 0
            ? `${(market.makerTakerRatio * 100).toFixed(0)}/${(100 - market.makerTakerRatio * 100).toFixed(0)}`
            : "—";

    const aprClass =
        market.fundingRate !== 0 ? (market.fundingRate >= 0 ? "val-positive" : "val-negative") : "val-muted";

    // Strip dex prefix from coin name for display (e.g. "xyz:CL" → "CL")
    const baseCoin_ = baseCoin(market.coin);
    const displayTicker =
        market.marketClass === "hip-4"
            ? market.name
            : market.type === "spot"
              ? baseCoin_
              : `${baseCoin_}-${market.quoteToken}`;

    return (
        <tr className={rowClass} onClick={onClick}>
            {/* Symbol */}
            <td>
                <div className="market-cell">
                    <span className="market-coin">{displayTicker}</span>
                    {market.type === "perp" && <span className="market-leverage-badge">{market.leverage}</span>}
                    {market.builder && market.builder !== "Hyperliquid" && (
                        <span className="market-settlement-badge market-settlement-badge--hip3">{market.builder}</span>
                    )}
                    {market.type === "spot" && (
                        <span className="market-settlement-badge market-settlement-badge--spot">spot</span>
                    )}
                    {market.isAtCap && <span className="market-at-cap-badge">AT CAP</span>}
                </div>
            </td>

            {/* Last Price / % Chance */}
            <td>
                {mode === "outcome" ? (
                    <FlashValue value={market.markPx}>{(market.markPx * 100).toFixed(0)}%</FlashValue>
                ) : (
                    <FlashValue value={market.markPx}>{formatPrice(market.markPx)}</FlashValue>
                )}
            </td>

            {/* 24H Change (skip for outcome) */}
            {mode !== "outcome" && (
                <td className={changeClass}>
                    {market.change24hAbs !== 0 ? (
                        <>
                            <span>{formatPrice(Math.abs(market.change24hAbs))}</span>
                            <span className="val-muted"> / </span>
                        </>
                    ) : null}
                    <span>{formatPercent(market.change24h)}</span>
                </td>
            )}

            {/* 1H (skip for outcome) */}
            {mode !== "outcome" && (
                <td
                    className={
                        market.change1h > 0 ? "val-positive" : market.change1h < 0 ? "val-negative" : "val-muted"
                    }
                >
                    {market.change1h !== 0 ? formatPercent(market.change1h) : "—"}
                </td>
            )}

            {/* ── Perp-only columns: Funding, Fund.APR, OI, OI Δ, Basis, Turnover ── */}
            {mode === "perp" && (
                <>
                    <td
                        className={market.type !== "perp" ? "val-muted" : fundingClass}
                        title={market.type !== "perp" ? "Spot market — no funding rate" : undefined}
                    >
                        {market.type !== "perp" ? "—" : formatFundingRate(market.fundingRate)}
                    </td>
                    <td
                        className={market.type !== "perp" ? "val-muted" : aprClass}
                        title={market.type !== "perp" ? "Spot market — no funding rate" : undefined}
                    >
                        {market.type !== "perp" ? "—" : fundingApr(market.fundingRate)}
                    </td>
                </>
            )}

            {/* Volume (all modes) */}
            <td>
                <div className="vol-with-bar">
                    <FlashValue value={market.volume24h}>{formatUSD(market.volume24h)}</FlashValue>
                    <div className="vol-bar-track">
                        <div
                            className="vol-bar-fill"
                            style={{ width: `${Math.min((market.volume24h / maxVolume) * 100, 100).toFixed(1)}%` }}
                        />
                    </div>
                </div>
            </td>

            {/* Open Interest (perp + hip3 + outcome modes) */}
            {(mode === "perp" || mode === "hip3" || mode === "outcome") && (
                <td>
                    {market.openInterest === 0 ? (
                        <span className="val-muted">—</span>
                    ) : (
                        <FlashValue value={market.openInterest}>{formatUSD(market.openInterest)}</FlashValue>
                    )}
                </td>
            )}

            {/* OI Δ (perp only — not available for HIP-3) */}
            {mode === "perp" && (
                <td
                    className={
                        market.oiDeltaRefresh > 0
                            ? "val-positive"
                            : market.oiDeltaRefresh < 0
                              ? "val-negative"
                              : "val-muted"
                    }
                    title="Change since last data refresh"
                >
                    {market.oiDeltaRefresh !== 0
                        ? `${market.oiDeltaRefresh >= 0 ? "+" : "-"}${formatUSD(Math.abs(market.oiDeltaRefresh))}`
                        : "—"}
                </td>
            )}

            {/* OI Util (HIP-3 only — cap data available from perpDexs) */}
            {mode === "hip3" && (
                <td title="Open interest as % of streaming cap set by builder dex">
                    {market.oiCap > 0 ? (
                        <OIGaugeBar utilization={market.oiUtilization} />
                    ) : (
                        <span className="val-muted">—</span>
                    )}
                </td>
            )}

            {/* Basis + Turnover (perp only) */}
            {mode === "perp" && (
                <>
                    <td
                        className={
                            market.premiumBps > 5
                                ? "val-warning"
                                : market.premiumBps > 0
                                  ? "val-positive"
                                  : market.premiumBps < -5
                                    ? "val-negative"
                                    : "val-muted"
                        }
                    >
                        {market.premiumBps !== 0 ? (
                            `${market.premiumBps > 0 ? "+" : ""}${market.premiumBps.toFixed(1)}bp`
                        ) : (
                            <span className="val-muted">—</span>
                        )}
                    </td>
                    <td className="val-muted">
                        {market.openInterest > 0 && market.volume24h > 0
                            ? `${(market.volume24h / market.openInterest).toFixed(1)}x`
                            : "—"}
                    </td>
                </>
            )}

            {/* Spread (skip for outcome) */}
            {mode !== "outcome" && (
                <td className={market.spreadBps > 100 ? "val-warning" : market.spreadBps > 0 ? "val-muted" : ""}>
                    {spreadDisplay}
                </td>
            )}

            {/* M/T (skip for outcome) */}
            {mode !== "outcome" && <td className="val-muted">{mtDisplay}</td>}
        </tr>
    );
}

function areEqual(prev: MarketRowProps, next: MarketRowProps): boolean {
    if (prev.selected !== next.selected) return false;
    if (prev.maxVolume !== next.maxVolume) return false;
    if (prev.onClick !== next.onClick) return false;
    if (prev.columnMode !== next.columnMode) return false;
    if (prev.spotMode !== next.spotMode) return false;
    const a = prev.market;
    const b = next.market;
    return (
        a.coin === b.coin &&
        a.markPx === b.markPx &&
        a.change24h === b.change24h &&
        a.change1h === b.change1h &&
        a.fundingRate === b.fundingRate &&
        a.volume24h === b.volume24h &&
        a.openInterest === b.openInterest &&
        a.oiDeltaRefresh === b.oiDeltaRefresh &&
        a.oiUtilization === b.oiUtilization &&
        a.premiumBps === b.premiumBps &&
        a.spreadBps === b.spreadBps &&
        a.makerTakerRatio === b.makerTakerRatio &&
        a.isAtCap === b.isAtCap &&
        a.type === b.type
    );
}

// Re-export as memoized version — same name so imports are unchanged
const MarketRowMemo = memo(MarketRow, areEqual);
export { MarketRowMemo as MarketRow };
