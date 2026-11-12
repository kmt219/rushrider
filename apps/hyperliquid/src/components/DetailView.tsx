import { IS_GOLDRUSH_ACTIVE } from "../context/GoldRushContext";
import { useCandles } from "../hooks/useCandles";
import { useFundingHistory } from "../hooks/useFundingHistory";
import type { OHLCVTimeframe } from "../hooks/useOHLCVStream";
import { useOrderBook } from "../hooks/useOrderBook";
import { useTradeFeed } from "../hooks/useTradeFeed";
import type { HIP3Market, MockCandle } from "../types";
import {
    baseCoin,
    formatPrice,
    formatUSD,
    formatPercent,
    formatFundingRate,
    formatBps,
    formatNumber,
} from "../utils/format";
import { computeHealthScore, getHealthGradeColor } from "../utils/health";
import type { HealthScore } from "../utils/health";
import { FeeEconomics } from "./FeeEconomics";
import { OrderBookDisplay } from "./OrderBook";
import { OrderFlowPanel } from "./OrderFlowPanel";
import { TradeFeed } from "./TradeFeed";
import { DepthChart } from "./charts/DepthChart";
import { FundingChart } from "./charts/FundingChart";
import { LightweightChart, type OHLCVCandle } from "@goldrush-demos/shared-ui";
import { useState, useEffect, useMemo } from "react";

type DetailTab = "trades" | "orderbook" | "funding" | "fees" | "flow";

interface DetailViewProps {
    market: HIP3Market;
}

const TABS: { key: DetailTab; label: string }[] = [
    { key: "trades", label: "Trades" },
    { key: "orderbook", label: "Book" },
    { key: "funding", label: "Funding" },
    { key: "fees", label: "Fees" },
    { key: "flow", label: "Flow" },
];

const TIMEFRAMES: OHLCVTimeframe[] = ["1s", "5m", "1h", "D"];

/** Seconds until the next Hyperliquid funding settlement (00:00, 08:00, 16:00 UTC). */
function computeFundingCountdown(): string {
    const now = new Date();
    const totalSecondsNow = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
    const targets = [0, 28800, 57600, 86400]; // 0h, 8h, 16h, next 0h in seconds
    const nextTarget = targets.find((t) => t > totalSecondsNow) ?? 86400;
    const diff = nextTarget - totalSecondsNow;
    const hh = Math.floor(diff / 3600);
    const mm = Math.floor((diff % 3600) / 60)
        .toString()
        .padStart(2, "0");
    const ss = (diff % 60).toString().padStart(2, "0");
    // Show H:MM:SS when hours remain, MM:SS when under 1 hour
    return hh > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
}

function useFundingCountdown(): string {
    const [countdown, setCountdown] = useState(computeFundingCountdown);
    useEffect(() => {
        const id = setInterval(() => setCountdown(computeFundingCountdown()), 1000);
        return () => clearInterval(id);
    }, []);
    return countdown;
}

/** Slim progress-bar breakdown of the three health dimensions. */
function HealthDimsRow({ health }: { health: HealthScore }) {
    if (health.grade === "N/A") return null;
    const dims = [health.dimensions.volume, health.dimensions.volatility, health.dimensions.priceAvailability];
    return (
        <div className="dv-health-dims">
            <span className="dv-health-dims-label">Health</span>
            {dims.map((dim) => {
                const { text } = getHealthGradeColor(dim.grade);
                return (
                    <div key={dim.label} className="dv-health-dim-pill">
                        <span className="dv-health-dim-name">{dim.label}</span>
                        <div className="dv-health-dim-bar-track">
                            <div
                                className="dv-health-dim-bar-fill"
                                style={{
                                    width: `${(dim.score * 100).toFixed(0)}%`,
                                    background: text,
                                }}
                            />
                        </div>
                        <span className="dv-health-dim-score">
                            {dim.pts}/{dim.max}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

function mockToOHLCV(c: MockCandle): OHLCVCandle {
    return {
        timestamp: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
    };
}

export function DetailView({ market }: DetailViewProps) {
    const [activeTab, setActiveTab] = useState<DetailTab>("trades");
    const [timeframe, setTimeframe] = useState<OHLCVTimeframe>("1h");
    const [showMore, setShowMore] = useState(false);
    const fundingCountdown = useFundingCountdown();
    const { trades } = useTradeFeed(market.coin);
    const { orderBook } = useOrderBook(market.coin);
    const { history: fundingHistory } = useFundingHistory(market.coin);
    const isOutcome = market.marketClass === "hip-4";

    useEffect(() => {
        if (activeTab === "funding" && (market.type !== "perp" || isOutcome)) {
            setActiveTab("trades");
        }
    }, [market.type, activeTab, isOutcome]);

    // Candles from nodeStore (populated by tradeProcessor in both node-stream and GoldRush modes)
    const { candles: rawCandles, loading: candlesLoading } = useCandles(market.coin, 80, timeframe);
    const candles: OHLCVCandle[] = useMemo(() => rawCandles.map(mockToOHLCV), [rawCandles]);

    const changeClass = market.change24h >= 0 ? "val-positive" : "val-negative";
    const fundingClass = market.fundingRate >= 0 ? "val-positive" : "val-negative";
    const health = useMemo(
        () => computeHealthScore(market.markPx, market.change24h, market.volume24h),
        [market.markPx, market.change24h, market.volume24h]
    );
    const baseCoin_ = baseCoin(market.coin);
    const pairLabel =
        market.marketClass === "hip-4"
            ? market.name
            : market.type === "spot"
              ? baseCoin_
              : `${baseCoin_}-${market.quoteToken}`;

    // Compute live spread from order book when available
    const liveSpreadBps = useMemo(() => {
        const bestBid = orderBook.bids[0];
        const bestAsk = orderBook.asks[0];
        return bestBid && bestAsk && bestBid.price > 0 && bestAsk.price > 0
            ? ((bestAsk.price - bestBid.price) / ((bestAsk.price + bestBid.price) / 2)) * 10000
            : null;
    }, [orderBook]);

    // Derive 1H change from already-loaded 1h candles when market.change1h is unavailable.
    // The candle data is fetched for the chart anyway — no extra request needed.
    const change1h = useMemo(() => {
        if (market.change1h !== 0) return market.change1h;
        if (timeframe === "1h" && rawCandles.length >= 2) {
            const last = rawCandles[rawCandles.length - 1];
            const prev = rawCandles[rawCandles.length - 2];
            if (last && prev && prev.close > 0) return (last.close - prev.close) / prev.close;
        }
        return 0;
    }, [market.change1h, rawCandles, timeframe]);

    // Compute M/T ratio from recent trades (buy side = "B", sell side = "A")
    const liveMakerRatio = useMemo(() => {
        const buyVol = trades.reduce((s, t) => s + (t.side === "B" ? t.sz * t.px : 0), 0);
        const sellVol = trades.reduce((s, t) => s + (t.side === "A" ? t.sz * t.px : 0), 0);
        const totalTrdVol = buyVol + sellVol;
        return totalTrdVol > 0 ? buyVol / totalTrdVol : null;
    }, [trades]);

    return (
        <div className="dv">
            {/* ─── Compact metrics list — 2 per row ─── */}
            <div className="dv-metrics-list">
                {isOutcome ? (
                    /* ── Outcome market: flat layout, no toggle ── */
                    <>
                        <div className="dv-mrow-pair">
                            <div className="dv-mrow" title="Current implied probability (0–1 = 0–100% chance of Yes)">
                                <span className="dv-mrow-label">Mark Price</span>
                                <span className="dv-mrow-value">{formatPrice(market.markPx)}</span>
                            </div>
                            <div className="dv-mrow" title="Price change over the last 24 hours">
                                <span className="dv-mrow-label">24H Change</span>
                                <span className={`dv-mrow-value ${changeClass}`}>
                                    {market.change24hAbs !== 0 ? (
                                        <>
                                            {market.change24hAbs >= 0 ? "+" : ""}
                                            {formatPrice(Math.abs(market.change24hAbs))}
                                            <span className="dv-mrow-sub">{formatPercent(market.change24h)}</span>
                                        </>
                                    ) : (
                                        formatPercent(market.change24h)
                                    )}
                                </span>
                            </div>
                        </div>
                        <div className="dv-mrow-pair">
                            <div className="dv-mrow" title="Price change over the last 1 hour">
                                <span className="dv-mrow-label">1H Change</span>
                                <span
                                    className={`dv-mrow-value ${change1h > 0 ? "val-positive" : change1h < 0 ? "val-negative" : "val-muted"}`}
                                >
                                    {change1h !== 0 ? formatPercent(change1h) : "—"}
                                </span>
                            </div>
                            <div className="dv-mrow" title="Total notional volume traded in the last 24 hours">
                                <span className="dv-mrow-label">24H Volume</span>
                                <span className="dv-mrow-value">{formatUSD(market.volume24h)}</span>
                            </div>
                        </div>
                        <div className="dv-mrow-pair">
                            <div className="dv-mrow" title="Bid/ask spread from live order book">
                                <span className="dv-mrow-label">Spread</span>
                                <span className="dv-mrow-value val-muted">
                                    {liveSpreadBps !== null
                                        ? formatBps(liveSpreadBps)
                                        : market.spreadBps > 0
                                          ? formatBps(market.spreadBps)
                                          : "—"}
                                </span>
                            </div>
                            <div className="dv-mrow" title="Buy/sell volume split from live trade feed">
                                <span className="dv-mrow-label">M/T Ratio</span>
                                <span className="dv-mrow-value val-muted">
                                    {liveMakerRatio !== null
                                        ? `${(liveMakerRatio * 100).toFixed(0)}%/${((1 - liveMakerRatio) * 100).toFixed(0)}%`
                                        : market.makerTakerRatio > 0
                                          ? `${(market.makerTakerRatio * 100).toFixed(0)}%/${(100 - market.makerTakerRatio * 100).toFixed(0)}%`
                                          : "—/—"}
                                </span>
                            </div>
                        </div>
                        <div className="dv-mrow" title="Number of trades received this session">
                            <span className="dv-mrow-label">Trades</span>
                            <span className="dv-mrow-value val-muted">
                                {trades.length > 0 ? formatNumber(trades.length) : "—"}
                            </span>
                        </div>
                    </>
                ) : (
                    /* ── Perp / spot: existing layout with expand toggle ── */
                    <>
                        {/* Row: Mark Price | 24H Change */}
                        <div className="dv-mrow-pair">
                            <div className="dv-mrow" title="Latest mark price (mid-point of best bid/ask)">
                                <span className="dv-mrow-label">Mark Price</span>
                                <span className="dv-mrow-value">{formatPrice(market.markPx)}</span>
                            </div>
                            <div className="dv-mrow" title="Price change over the last 24 hours">
                                <span className="dv-mrow-label">24H Change</span>
                                <span className={`dv-mrow-value ${changeClass}`}>
                                    {market.change24hAbs !== 0 ? (
                                        <>
                                            {market.change24hAbs >= 0 ? "+" : ""}
                                            {formatPrice(Math.abs(market.change24hAbs))}
                                            <span className="dv-mrow-sub">{formatPercent(market.change24h)}</span>
                                        </>
                                    ) : (
                                        formatPercent(market.change24h)
                                    )}
                                </span>
                            </div>
                        </div>
                        {/* Row: 1H Change | 24H Volume */}
                        <div className="dv-mrow-pair">
                            <div className="dv-mrow" title="Price change over the last 1 hour">
                                <span className="dv-mrow-label">1H Change</span>
                                <span
                                    className={`dv-mrow-value ${change1h > 0 ? "val-positive" : change1h < 0 ? "val-negative" : "val-muted"}`}
                                >
                                    {change1h !== 0 ? formatPercent(change1h) : "—"}
                                </span>
                            </div>
                            <div className="dv-mrow" title="Total notional volume traded in the last 24 hours">
                                <span className="dv-mrow-label">24H Volume</span>
                                <span className="dv-mrow-value">{formatUSD(market.volume24h)}</span>
                            </div>
                        </div>
                        {/* Row: Open Int. | M/T Ratio */}
                        <div className="dv-mrow-pair">
                            <div
                                className="dv-mrow"
                                title="Total open interest — sum of all outstanding long/short positions"
                            >
                                <span className="dv-mrow-label">Open Int.</span>
                                <span className="dv-mrow-value">
                                    {market.openInterest > 0 ? (
                                        formatUSD(market.openInterest)
                                    ) : (
                                        <span className="val-muted">—</span>
                                    )}
                                </span>
                            </div>
                            <div
                                className="dv-mrow"
                                title="Buy/sell volume split from live trade feed (updates as trades arrive)"
                            >
                                <span className="dv-mrow-label">M/T Ratio</span>
                                <span className="dv-mrow-value val-muted">
                                    {liveMakerRatio !== null
                                        ? `${(liveMakerRatio * 100).toFixed(0)}%/${((1 - liveMakerRatio) * 100).toFixed(0)}%`
                                        : market.makerTakerRatio > 0
                                          ? `${(market.makerTakerRatio * 100).toFixed(0)}%/${(100 - market.makerTakerRatio * 100).toFixed(0)}%`
                                          : "—/—"}
                                </span>
                            </div>
                        </div>
                        {/* Row: Funding — full width to avoid clipping the countdown + predicted sub-items */}
                        {market.type === "perp" && (
                            <div
                                className="dv-mrow"
                                title="8-hour funding rate paid by longs to shorts (positive = longs pay)"
                            >
                                <span className="dv-mrow-label">Funding</span>
                                <span className={`dv-mrow-value ${fundingClass}`}>
                                    {formatFundingRate(market.fundingRate)}
                                    <span className="dv-mrow-sub dv-mrow-mono">{fundingCountdown}</span>
                                    {market.predictedFundingRate !== 0 && (
                                        <span
                                            className={`dv-mrow-sub ${market.predictedFundingRate >= 0 ? "val-positive" : "val-negative"}`}
                                        >
                                            ~{market.predictedFundingRate >= 0 ? "+" : ""}
                                            {(market.predictedFundingRate * 100).toFixed(3)}%
                                        </span>
                                    )}
                                </span>
                            </div>
                        )}

                        <button className="dv-metrics-toggle" onClick={() => setShowMore((p) => !p)}>
                            {showMore ? "▲" : "▼"}
                        </button>

                        {showMore && (
                            <>
                                {/* Row: Spread | L/S Ratio */}
                                <div className="dv-mrow-pair">
                                    <div
                                        className="dv-mrow"
                                        title="Bid/ask spread derived from $5M notional impact prices"
                                    >
                                        <span className="dv-mrow-label">Spread</span>
                                        <span className="dv-mrow-value val-muted">
                                            {liveSpreadBps !== null
                                                ? formatBps(liveSpreadBps)
                                                : market.spreadBps > 0
                                                  ? formatBps(market.spreadBps)
                                                  : "—"}
                                        </span>
                                    </div>
                                    <div
                                        className="dv-mrow"
                                        title="Estimated long/short ratio derived from order-book depth asymmetry"
                                    >
                                        <span className="dv-mrow-label">L/S Ratio</span>
                                        <span className="dv-mrow-value">
                                            <span className="val-positive">
                                                {(market.longShortRatio * 100).toFixed(0)}%L
                                            </span>
                                            <span className="val-muted"> / </span>
                                            <span className="val-negative">
                                                {((1 - market.longShortRatio) * 100).toFixed(0)}%S
                                            </span>
                                        </span>
                                    </div>
                                </div>
                                {/* Row: Basis | Turnover */}
                                {market.type === "perp" && (
                                    <div className="dv-mrow-pair">
                                        <div
                                            className="dv-mrow"
                                            title="Mark/oracle basis in basis points — positive means mark price above oracle"
                                        >
                                            <span className="dv-mrow-label">Basis</span>
                                            <span
                                                className={`dv-mrow-value ${market.premiumBps > 0 ? "val-positive" : market.premiumBps < 0 ? "val-negative" : "val-muted"}`}
                                            >
                                                {market.premiumBps !== 0
                                                    ? `${market.premiumBps > 0 ? "+" : ""}${market.premiumBps.toFixed(1)}bp`
                                                    : "—"}
                                            </span>
                                        </div>
                                        <div
                                            className="dv-mrow"
                                            title="24h volume divided by open interest — higher = more active relative to size"
                                        >
                                            <span className="dv-mrow-label">Turnover</span>
                                            <span className="dv-mrow-value val-muted">
                                                {market.openInterest > 0 && market.volume24h > 0
                                                    ? `${(market.volume24h / market.openInterest).toFixed(1)}x`
                                                    : "—"}
                                            </span>
                                        </div>
                                    </div>
                                )}
                                {/* Row: Index Price | Liqs 24h */}
                                <div className="dv-mrow-pair">
                                    <div
                                        className="dv-mrow"
                                        title="Oracle/index price used for funding rate calculations"
                                    >
                                        <span className="dv-mrow-label">Index Price</span>
                                        <span className="dv-mrow-value val-muted">{formatPrice(market.indexPx)}</span>
                                    </div>
                                    <div
                                        className="dv-mrow"
                                        title={
                                            IS_GOLDRUSH_ACTIVE
                                                ? "Liquidations detected in this session via GoldRush stream (grows over time)"
                                                : "Number of liquidations in the last 24 hours"
                                        }
                                    >
                                        <span className="dv-mrow-label">Liqs 24h</span>
                                        <span
                                            className={`dv-mrow-value ${market.liqCount24h > 0 ? "val-warning" : "val-muted"}`}
                                        >
                                            {market.liqCount24h > 0
                                                ? formatNumber(market.liqCount24h)
                                                : IS_GOLDRUSH_ACTIVE
                                                  ? "0"
                                                  : "—"}
                                        </span>
                                    </div>
                                </div>
                                {/* Row: Trades | Health */}
                                <>
                                    <div className="dv-mrow-pair">
                                        <div className="dv-mrow" title="Number of trades received this session">
                                            <span className="dv-mrow-label">Trades</span>
                                            <span className="dv-mrow-value val-muted">
                                                {trades.length > 0 ? formatNumber(trades.length) : "—"}
                                            </span>
                                        </div>
                                        <div
                                            className="dv-mrow"
                                            title="Market health score based on volume, volatility, and price availability"
                                        >
                                            <span className="dv-mrow-label">Health</span>
                                            <span
                                                className="dv-mrow-value"
                                                style={{ color: getHealthGradeColor(health.grade).text }}
                                            >
                                                {health.grade === "N/A"
                                                    ? "N/A"
                                                    : `${health.grade} · ${health.total}/100`}
                                            </span>
                                        </div>
                                    </div>
                                    <HealthDimsRow health={health} />
                                </>
                            </>
                        )}
                    </>
                )}
            </div>

            {/* ─── Main area: chart + sidebar ─── */}
            <div className="dv-body">
                <div className="dv-main">
                    {/* Chart area */}
                    <div className="dv-chart">
                        <div className="candle-chart-header">
                            <div className="candle-chart-coin-row">
                                <span className="candle-chart-coin">{pairLabel}</span>
                                {market.builder && market.builder !== "Hyperliquid" && (
                                    <span className="market-settlement-badge market-settlement-badge--xyz">
                                        {market.builder}
                                    </span>
                                )}
                                {market.leverage && market.leverage !== "1x" && (
                                    <span className="market-leverage-badge">{market.leverage}</span>
                                )}
                            </div>
                            <div className="candle-chart-timeframes">
                                {TIMEFRAMES.map((tf) => (
                                    <button
                                        key={tf}
                                        className={`candle-tf-btn ${tf === timeframe ? "candle-tf-btn--active" : ""}`}
                                        onClick={() => setTimeframe(tf)}
                                    >
                                        {tf}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {candles.length === 0 ? (
                            <div className={`candle-chart-empty ${candlesLoading ? "candle-chart-skeleton" : ""}`} />
                        ) : (
                            <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
                                <LightweightChart candles={candles} showVolume={true} />
                                {candlesLoading && <div className="chart-loading-overlay" />}
                            </div>
                        )}
                    </div>

                    {/* Data tabs below chart */}
                    <div className="dv-data-section">
                        <div className="detail-tabs">
                            {TABS.filter((t) => t.key !== "funding" || (market.type === "perp" && !isOutcome)).map(
                                (tab) => (
                                    <button
                                        key={tab.key}
                                        className={`detail-tab ${activeTab === tab.key ? "detail-tab--active" : ""}`}
                                        onClick={() => setActiveTab(tab.key)}
                                    >
                                        {tab.label}
                                    </button>
                                )
                            )}
                        </div>
                        <div className="dv-data-body">
                            {activeTab === "trades" && (
                                <TradeFeed trades={trades} isOutcome={market.marketClass === "hip-4"} />
                            )}
                            {activeTab === "orderbook" && (
                                <>
                                    <OrderBookDisplay
                                        orderBook={orderBook}
                                        coin={market.coin}
                                        isOutcome={market.marketClass === "hip-4"}
                                    />
                                    {(orderBook.bids.length > 0 || orderBook.asks.length > 0) && (
                                        <DepthChart orderBook={orderBook} />
                                    )}
                                </>
                            )}
                            {activeTab === "funding" && <FundingChart data={fundingHistory} />}
                            {activeTab === "fees" && <FeeEconomics market={market} liveMakerRatio={liveMakerRatio} />}
                            {activeTab === "flow" && <OrderFlowPanel trades={trades} />}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
