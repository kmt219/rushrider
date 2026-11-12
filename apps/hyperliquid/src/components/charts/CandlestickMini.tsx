import type { OHLCVTimeframe } from "../../hooks/useOHLCVStream";
import type { MockCandle } from "../../types";
import { formatPrice } from "../../utils/format";

interface CandlestickMiniProps {
    candles: MockCandle[];
    activeTimeframe?: OHLCVTimeframe;
    onTimeframeChange?: (tf: OHLCVTimeframe) => void;
}

const TIMEFRAMES: OHLCVTimeframe[] = ["1s", "5m", "1h", "D"];

export function CandlestickMini({ candles, activeTimeframe = "1s", onTimeframeChange }: CandlestickMiniProps) {
    if (candles.length < 2) {
        return (
            <div className="candle-chart-empty">
                <span>Loading chart data...</span>
            </div>
        );
    }

    const width = 800;
    const height = 340;
    const padding = { top: 20, right: 60, bottom: 30, left: 10 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const allPrices = candles.flatMap((c) => [c.high, c.low]);
    const minP = Math.min(...allPrices);
    const maxP = Math.max(...allPrices);
    const priceRange = maxP - minP || 1;

    const candleW = Math.max(2, (chartW / candles.length) * 0.7);
    const gap = (chartW / candles.length) * 0.3;

    const scaleY = (price: number) => padding.top + chartH - ((price - minP) / priceRange) * chartH;

    const last = candles[candles.length - 1]!;
    const prev = candles[candles.length - 2]!;
    const isUp = last.close >= prev.close;

    // Volume bars
    const maxVol = Math.max(...candles.map((c) => c.volume));
    const volH = 60;

    return (
        <div className="candle-chart">
            <div className="candle-chart-info">
                <span className="candle-chart-ohlc">
                    O <span className="val-muted">{formatPrice(last.open)}</span> H{" "}
                    <span className="val-muted">{formatPrice(last.high)}</span> L{" "}
                    <span className="val-muted">{formatPrice(last.low)}</span> C{" "}
                    <span className={isUp ? "val-positive" : "val-negative"}>{formatPrice(last.close)}</span>
                </span>
            </div>
            <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                {/* Price grid lines */}
                {Array.from({ length: 5 }, (_, i) => {
                    const price = minP + (priceRange / 4) * i;
                    const y = scaleY(price);
                    return (
                        <g key={i}>
                            <line
                                x1={padding.left}
                                y1={y}
                                x2={width - padding.right}
                                y2={y}
                                stroke="var(--border-light)"
                                strokeWidth="0.5"
                                strokeDasharray="3,3"
                            />
                            <text x={width - padding.right + 4} y={y + 3} fill="var(--fg-muted)" fontSize="9">
                                {formatPrice(price)}
                            </text>
                        </g>
                    );
                })}

                {/* Candles */}
                {candles.map((c, i) => {
                    const x = padding.left + (i / candles.length) * chartW + gap / 2;
                    const bullish = c.close >= c.open;
                    const color = bullish ? "var(--gain)" : "var(--loss)";
                    const bodyTop = scaleY(Math.max(c.open, c.close));
                    const bodyBot = scaleY(Math.min(c.open, c.close));
                    const bodyH = Math.max(bodyBot - bodyTop, 1);

                    return (
                        <g key={i}>
                            {/* Wick */}
                            <line
                                x1={x + candleW / 2}
                                y1={scaleY(c.high)}
                                x2={x + candleW / 2}
                                y2={scaleY(c.low)}
                                stroke={color}
                                strokeWidth="1"
                            />
                            {/* Body */}
                            <rect x={x} y={bodyTop} width={candleW} height={bodyH} fill={color} />
                        </g>
                    );
                })}

                {/* Volume bars at bottom */}
                {candles.map((c, i) => {
                    const x = padding.left + (i / candles.length) * chartW + gap / 2;
                    const barH = (c.volume / maxVol) * volH;
                    const bullish = c.close >= c.open;
                    return (
                        <rect
                            key={`v-${i}`}
                            x={x}
                            y={height - padding.bottom - barH}
                            width={candleW}
                            height={barH}
                            fill={bullish ? "var(--gain)" : "var(--loss)"}
                            opacity={0.2}
                        />
                    );
                })}

                {/* Current price line */}
                <line
                    x1={padding.left}
                    y1={scaleY(last.close)}
                    x2={width - padding.right}
                    y2={scaleY(last.close)}
                    stroke={isUp ? "var(--gain)" : "var(--loss)"}
                    strokeWidth="0.8"
                    strokeDasharray="4,2"
                />
                <rect
                    x={width - padding.right}
                    y={scaleY(last.close) - 8}
                    width={55}
                    height={16}
                    rx={2}
                    fill={isUp ? "var(--gain)" : "var(--loss)"}
                />
                <text
                    x={width - padding.right + 4}
                    y={scaleY(last.close) + 3}
                    fill="var(--bg)"
                    fontSize="9"
                    fontWeight="600"
                >
                    {formatPrice(last.close)}
                </text>
            </svg>
            <div className="candle-chart-timeframes">
                {TIMEFRAMES.map((tf) => (
                    <button
                        key={tf}
                        className={`candle-tf-btn ${tf === activeTimeframe ? "candle-tf-btn--active" : ""}`}
                        onClick={() => onTimeframeChange?.(tf)}
                    >
                        {tf}
                    </button>
                ))}
            </div>
        </div>
    );
}
