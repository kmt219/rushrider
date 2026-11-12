import type { OHLCVCandle } from "../types";
import { compressRepeatedZeros } from "../utils";
import { memo, useCallback, useRef, useState } from "react";

const PADDING = { top: 16, right: 12, bottom: 36, left: 56 };
const CANDLE_GAP = 2;
const VOLUME_H = 46; // fixed pixel height for the volume bar area
const VOLUME_GAP = 8; // gap between candle chart and volume bars

function formatValue(v: number): string {
    return v >= 0.01 ? v.toFixed(4) : compressRepeatedZeros(v);
}

function formatVolume(v: number): string {
    if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return v.toFixed(0);
}

export const CandlestickChart = memo(function CandlestickChart({
    candles,
    showVolume = true,
}: {
    candles: OHLCVCandle[];
    showVolume?: boolean;
}) {
    const svgRef = useRef<SVGSVGElement>(null);
    const [hover, setHover] = useState<{ svgX: number; svgY: number; index: number } | null>(null);

    const viewW = 600;
    const volSpace = showVolume ? VOLUME_H + VOLUME_GAP : 0;
    const viewH = PADDING.top + PADDING.bottom + volSpace + 174; // 174 ≈ base candle chart height
    const candleChartH = viewH - PADDING.top - PADDING.bottom - volSpace;
    const volumeTop = PADDING.top + candleChartH + VOLUME_GAP;

    const chartW = viewW - PADDING.left - PADDING.right;
    const candleW = candles.length > 0 ? Math.max(2, (chartW - CANDLE_GAP * (candles.length - 1)) / candles.length) : 0;

    // Safe min/max via reduce — avoids stack overflow from spread on large arrays
    const allHigh = candles.reduce((m, c) => (c.high > m ? c.high : m), candles[0]?.high ?? 0);
    const allLow = candles.reduce((m, c) => (c.low < m ? c.low : m), candles[0]?.low ?? 0);
    const maxVol = candles.reduce((m, c) => (c.volume > m ? c.volume : m), 0);

    // When all candles share the same price (flat line), add ±2% padding so the
    // candle renders visibly in the centre of the chart instead of at the bottom.
    // For charts with a real range, add 5% headroom on each side for readability.
    const rawRange = allHigh - allLow;
    const paddedRange = rawRange > 0 ? rawRange * 1.1 : allLow > 0 ? allLow * 0.04 : 1;
    const yLow = rawRange > 0 ? allLow - rawRange * 0.05 : allLow > 0 ? allLow * 0.98 : 0;

    const yScale = (v: number) => PADDING.top + candleChartH - ((v - yLow) / paddedRange) * candleChartH;
    const yInverse = (svgY: number) => yLow + ((candleChartH - (svgY - PADDING.top)) / candleChartH) * paddedRange;

    // Y-axis grid lines (5 ticks spanning the price range)
    const ticks = Array.from({ length: 5 }, (_, i) => yLow + (paddedRange * i) / 4);

    // Detect if candles span multiple calendar days — drives x-axis label format
    const firstDate = candles.length > 0 ? new Date(candles[0]!.timestamp) : null;
    const lastDate = candles.length > 0 ? new Date(candles[candles.length - 1]!.timestamp) : null;
    const spansMultipleDays =
        firstDate !== null &&
        lastDate !== null &&
        (firstDate.getDate() !== lastDate.getDate() || firstDate.getMonth() !== lastDate.getMonth());

    function formatXLabel(ts: string): string {
        const d = new Date(ts);
        const h = d.getHours().toString().padStart(2, "0");
        const m = d.getMinutes().toString().padStart(2, "0");
        if (!spansMultipleDays) return `${h}:${m}`;
        const mon = d.toLocaleString("default", { month: "short" });
        return `${mon} ${d.getDate()} ${h}:${m}`;
    }

    const toSVGCoords = useCallback(
        (e: React.MouseEvent<SVGSVGElement>) => {
            const svg = svgRef.current;
            if (!svg) return null;
            const rect = svg.getBoundingClientRect();
            const scaleX = viewW / rect.width;
            const scaleY = viewH / rect.height;
            return {
                svgX: (e.clientX - rect.left) * scaleX,
                svgY: (e.clientY - rect.top) * scaleY,
            };
        },
        [viewW, viewH]
    );

    const handleMouseMove = useCallback(
        (e: React.MouseEvent<SVGSVGElement>) => {
            const coords = toSVGCoords(e);
            if (!coords || candles.length === 0) return;
            const relX = coords.svgX - PADDING.left;
            const index = Math.max(0, Math.min(candles.length - 1, Math.round(relX / (candleW + CANDLE_GAP))));
            setHover({ svgX: coords.svgX, svgY: coords.svgY, index });
        },
        [candles.length, candleW, toSVGCoords]
    );

    const handleMouseLeave = useCallback(() => setHover(null), []);

    if (candles.length === 0) return null;

    // Crosshair — vertical snaps to candle center; horizontal follows mouse but clamped to price area
    const hoveredCandle = hover ? candles[hover.index] : null;
    const crosshairX = hover ? PADDING.left + hover.index * (candleW + CANDLE_GAP) + candleW / 2 : 0;
    const crosshairY = hover ? Math.max(PADDING.top, Math.min(PADDING.top + candleChartH, hover.svgY)) : 0;
    const crosshairPrice = hover ? yInverse(crosshairY) : 0;

    // Tooltip: 155 × 110 (with volume) or 155 × 90 (without)
    const tooltipW = 155;
    const tooltipH = showVolume ? 110 : 90;
    const tooltipX = hover ? (crosshairX + tooltipW + 8 > viewW ? crosshairX - tooltipW - 8 : crosshairX + 8) : 0;
    const tooltipY = hover ? Math.max(PADDING.top, Math.min(viewH - tooltipH - 4, crosshairY - tooltipH / 2)) : 0;

    return (
        <svg
            ref={svgRef}
            viewBox={`0 0 ${viewW} ${viewH}`}
            preserveAspectRatio="xMidYMid meet"
            className="candlestick-svg"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{ cursor: hover ? "crosshair" : undefined }}
        >
            {/* Price Y-axis grid lines */}
            {ticks.map((tick) => {
                const y = yScale(tick);
                return (
                    <g key={tick}>
                        <line
                            x1={PADDING.left}
                            x2={viewW - PADDING.right}
                            y1={y}
                            y2={y}
                            stroke="#333"
                            strokeWidth={0.5}
                        />
                        <text
                            x={PADDING.left - 4}
                            y={y + 3}
                            textAnchor="end"
                            fill="#888"
                            fontSize={8}
                            fontFamily="var(--font-mono)"
                        >
                            {tick >= 0.01 ? tick.toFixed(4) : compressRepeatedZeros(tick)}
                        </text>
                    </g>
                );
            })}

            {/* Candles */}
            {candles.map((c, i) => {
                const x = PADDING.left + i * (candleW + CANDLE_GAP);
                const isGreen = c.close >= c.open;
                const color = isGreen ? "#00d084" : "#e74c3c";
                const bodyTop = yScale(Math.max(c.open, c.close));
                const bodyBot = yScale(Math.min(c.open, c.close));
                const bodyH = Math.max(1, bodyBot - bodyTop);
                const wickX = x + candleW / 2;
                return (
                    <g key={c.timestamp}>
                        <line
                            x1={wickX}
                            x2={wickX}
                            y1={yScale(c.high)}
                            y2={yScale(c.low)}
                            stroke={color}
                            strokeWidth={1}
                        />
                        <rect x={x} y={bodyTop} width={candleW} height={bodyH} fill={color} opacity={0.9} />
                    </g>
                );
            })}

            {/* Volume separator line, label, and bars */}
            {showVolume && (
                <>
                    <line
                        x1={PADDING.left}
                        x2={viewW - PADDING.right}
                        y1={volumeTop - 4}
                        y2={volumeTop - 4}
                        stroke="#2a2a2a"
                        strokeWidth={1}
                    />
                    <text
                        x={PADDING.left - 4}
                        y={volumeTop + 8}
                        textAnchor="end"
                        fill="#555"
                        fontSize={7}
                        fontFamily="var(--font-mono)"
                    >
                        VOL
                    </text>
                    {candles.map((c, i) => {
                        const x = PADDING.left + i * (candleW + CANDLE_GAP);
                        const isGreen = c.close >= c.open;
                        const color = isGreen ? "#00d084" : "#e74c3c";
                        const volBarH = maxVol > 0 ? Math.max(1, (c.volume / maxVol) * VOLUME_H) : 1;
                        return (
                            <rect
                                key={`vol-${c.timestamp}`}
                                x={x}
                                y={volumeTop + VOLUME_H - volBarH}
                                width={candleW}
                                height={volBarH}
                                fill={color}
                                opacity={0.35}
                            />
                        );
                    })}
                </>
            )}

            {/* X-axis timestamps — show every ~6th candle + the last */}
            {candles.map((c, i) => {
                const step = Math.max(1, Math.floor(candles.length / 6));
                if (i % step !== 0 && i !== candles.length - 1) return null;
                const x = PADDING.left + i * (candleW + CANDLE_GAP) + candleW / 2;
                return (
                    <text
                        key={`t-${c.timestamp}`}
                        x={x}
                        y={viewH - 4}
                        textAnchor="middle"
                        fill="#888"
                        fontSize={7}
                        fontFamily="var(--font-mono)"
                    >
                        {formatXLabel(c.timestamp)}
                    </text>
                );
            })}

            {/* Crosshair + tooltip overlay */}
            {hover && hoveredCandle && (
                <g pointerEvents="none">
                    {/* Vertical crosshair — extends through candle (and volume) areas */}
                    <line
                        x1={crosshairX}
                        x2={crosshairX}
                        y1={PADDING.top}
                        y2={showVolume ? volumeTop + VOLUME_H : PADDING.top + candleChartH}
                        stroke="rgba(255,255,255,0.3)"
                        strokeWidth={0.5}
                        strokeDasharray="3,3"
                    />
                    {/* Horizontal crosshair — only in price area */}
                    <line
                        x1={PADDING.left}
                        x2={viewW - PADDING.right}
                        y1={crosshairY}
                        y2={crosshairY}
                        stroke="rgba(255,255,255,0.3)"
                        strokeWidth={0.5}
                        strokeDasharray="3,3"
                    />
                    {/* Price label on Y-axis */}
                    <rect x={0} y={crosshairY - 6} width={PADDING.left - 2} height={12} rx={2} fill="#2a2a2a" />
                    <text
                        x={PADDING.left - 4}
                        y={crosshairY + 3}
                        textAnchor="end"
                        fill="#fff"
                        fontSize={7}
                        fontFamily="var(--font-mono)"
                    >
                        {formatValue(crosshairPrice)}
                    </text>

                    {/* Tooltip box */}
                    <rect
                        x={tooltipX}
                        y={tooltipY}
                        width={tooltipW}
                        height={tooltipH}
                        rx={4}
                        fill="rgba(20,20,20,0.92)"
                        stroke="#444"
                        strokeWidth={0.5}
                    />
                    {/* Timestamp row */}
                    <text x={tooltipX + 6} y={tooltipY + 12} fill="#aaa" fontSize={7} fontFamily="var(--font-mono)">
                        {new Date(hoveredCandle.timestamp).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                        })}
                    </text>
                    {/* O / H / L / C rows */}
                    {(
                        [
                            { label: "O", value: hoveredCandle.open, color: "#888" },
                            { label: "H", value: hoveredCandle.high, color: "#00d084" },
                            { label: "L", value: hoveredCandle.low, color: "#e74c3c" },
                            {
                                label: "C",
                                value: hoveredCandle.close,
                                color: hoveredCandle.close >= hoveredCandle.open ? "#00d084" : "#e74c3c",
                            },
                        ] as { label: string; value: number; color: string }[]
                    ).map((item, idx) => (
                        <g key={item.label}>
                            <text
                                x={tooltipX + 6}
                                y={tooltipY + 24 + idx * 12}
                                fill="#555"
                                fontSize={7}
                                fontFamily="var(--font-mono)"
                            >
                                {item.label}
                            </text>
                            <text
                                x={tooltipX + 18}
                                y={tooltipY + 24 + idx * 12}
                                fill={item.color}
                                fontSize={7}
                                fontFamily="var(--font-mono)"
                            >
                                {formatValue(item.value)}
                            </text>
                        </g>
                    ))}
                    {/* % change open → close */}
                    {(() => {
                        const pct =
                            hoveredCandle.open > 0
                                ? ((hoveredCandle.close - hoveredCandle.open) / hoveredCandle.open) * 100
                                : 0;
                        const pctColor = pct >= 0 ? "#00d084" : "#e74c3c";
                        return (
                            <g>
                                <text
                                    x={tooltipX + 6}
                                    y={tooltipY + 72}
                                    fill="#555"
                                    fontSize={7}
                                    fontFamily="var(--font-mono)"
                                >
                                    CHG
                                </text>
                                <text
                                    x={tooltipX + 28}
                                    y={tooltipY + 72}
                                    fill={pctColor}
                                    fontSize={7}
                                    fontFamily="var(--font-mono)"
                                    fontWeight={700}
                                >
                                    {`${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`}
                                </text>
                            </g>
                        );
                    })()}
                    {/* Volume row */}
                    {showVolume && (
                        <>
                            <text
                                x={tooltipX + 6}
                                y={tooltipY + 84}
                                fill="#555"
                                fontSize={7}
                                fontFamily="var(--font-mono)"
                            >
                                VOL
                            </text>
                            <text
                                x={tooltipX + 28}
                                y={tooltipY + 84}
                                fill="#aaa"
                                fontSize={7}
                                fontFamily="var(--font-mono)"
                            >
                                {hoveredCandle.volume_usd != null
                                    ? `$${formatVolume(hoveredCandle.volume_usd)}`
                                    : formatVolume(hoveredCandle.volume)}
                            </text>
                        </>
                    )}
                </g>
            )}
        </svg>
    );
});
