import { compressRepeatedZeros } from "../utils";
import type { OHLCVCandle } from "@goldrush-demos/shared-ui";
import { memo, useCallback, useRef, useState } from "react";

const PADDING = { top: 16, right: 12, bottom: 36, left: 64 };
const KUMBAYA_COLOR = "#3b82f6";
const PRISM_COLOR = "#f59e0b";

function formatValue(v: number): string {
    return v >= 0.01 ? v.toFixed(4) : compressRepeatedZeros(v);
}

/**
 * Align two candle arrays by timestamp so both lines share the same x-axis.
 * Returns arrays of { timestamp, kClose, pClose } for each unique timestamp.
 */
function alignCandles(
    kCandles: OHLCVCandle[],
    pCandles: OHLCVCandle[]
): { timestamp: string; kClose: number | null; pClose: number | null }[] {
    const map = new Map<string, { kClose: number | null; pClose: number | null }>();

    for (const c of kCandles) {
        const existing = map.get(c.timestamp);
        if (existing) {
            existing.kClose = c.close;
        } else {
            map.set(c.timestamp, { kClose: c.close, pClose: null });
        }
    }
    for (const c of pCandles) {
        const existing = map.get(c.timestamp);
        if (existing) {
            existing.pClose = c.close;
        } else {
            map.set(c.timestamp, { kClose: null, pClose: c.close });
        }
    }

    return [...map.entries()]
        .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
        .map(([ts, vals]) => ({ timestamp: ts, ...vals }));
}

export const DualPriceChart = memo(function DualPriceChart({
    kumbayaCandles,
    prismCandles,
}: {
    kumbayaCandles: OHLCVCandle[];
    prismCandles: OHLCVCandle[];
}) {
    const svgRef = useRef<SVGSVGElement>(null);
    const [hover, setHover] = useState<{ svgX: number; svgY: number; index: number } | null>(null);

    const aligned = alignCandles(kumbayaCandles, prismCandles);
    if (aligned.length === 0) return null;

    const viewW = 700;
    const viewH = 260;
    const chartW = viewW - PADDING.left - PADDING.right;
    const chartH = viewH - PADDING.top - PADDING.bottom;

    // Compute min/max across both series
    const allValues = aligned.flatMap((a) => [a.kClose, a.pClose].filter((v): v is number => v != null));
    const minVal = allValues.reduce((m, v) => Math.min(m, v), Infinity);
    const maxVal = allValues.reduce((m, v) => Math.max(m, v), -Infinity);
    const range = maxVal - minVal || 1;

    const xScale = (i: number) => PADDING.left + (i / Math.max(1, aligned.length - 1)) * chartW;
    const yScale = (v: number) => PADDING.top + chartH - ((v - minVal) / range) * chartH;

    // Build SVG path strings
    function buildPath(getValue: (a: (typeof aligned)[0]) => number | null): string {
        let d = "";
        for (let i = 0; i < aligned.length; i++) {
            const v = getValue(aligned[i]!);
            if (v == null) continue;
            const x = xScale(i);
            const y = yScale(v);
            d += d === "" ? `M${x},${y}` : ` L${x},${y}`;
        }
        return d;
    }

    // Build the shaded area between the two lines
    function buildFillPath(): string {
        const both = aligned.map((a, i) => (a.kClose != null && a.pClose != null ? i : -1)).filter((i) => i >= 0);
        if (both.length < 2) return "";

        // Forward path (kumbaya line), then reverse (prism line)
        let d = "";
        for (const i of both) {
            const a = aligned[i]!;
            const x = xScale(i);
            const y = yScale(a.kClose!);
            d += d === "" ? `M${x},${y}` : ` L${x},${y}`;
        }
        for (let j = both.length - 1; j >= 0; j--) {
            const i = both[j]!;
            const a = aligned[i]!;
            const x = xScale(i);
            const y = yScale(a.pClose!);
            d += ` L${x},${y}`;
        }
        d += " Z";
        return d;
    }

    const kPath = buildPath((a) => a.kClose);
    const pPath = buildPath((a) => a.pClose);
    const fillPath = buildFillPath();

    // Y-axis ticks
    const ticks = Array.from({ length: 5 }, (_, i) => minVal + (range * i) / 4);

    // X-axis labels
    const firstDate = new Date(aligned[0]!.timestamp);
    const lastDate = new Date(aligned[aligned.length - 1]!.timestamp);
    const spansMultipleDays =
        firstDate.getDate() !== lastDate.getDate() || firstDate.getMonth() !== lastDate.getMonth();

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
            return { svgX: (e.clientX - rect.left) * scaleX, svgY: (e.clientY - rect.top) * (viewH / rect.height) };
        },
        [viewW, viewH]
    );

    const handleMouseMove = useCallback(
        (e: React.MouseEvent<SVGSVGElement>) => {
            const coords = toSVGCoords(e);
            if (!coords || aligned.length === 0) return;
            const relX = coords.svgX - PADDING.left;
            const index = Math.max(0, Math.min(aligned.length - 1, Math.round((relX / chartW) * (aligned.length - 1))));
            setHover({ svgX: coords.svgX, svgY: coords.svgY, index });
        },
        [toSVGCoords, aligned.length, chartW]
    );

    const handleMouseLeave = useCallback(() => setHover(null), []);

    const hoveredData = hover ? aligned[hover.index] : null;
    const crosshairX = hover ? xScale(hover.index) : 0;

    return (
        <svg
            ref={svgRef}
            viewBox={`0 0 ${viewW} ${viewH}`}
            preserveAspectRatio="xMidYMid meet"
            className="dual-price-svg"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{ cursor: hover ? "crosshair" : undefined }}
        >
            {/* Y-axis grid */}
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
                            {formatValue(tick)}
                        </text>
                    </g>
                );
            })}

            {/* Shaded area between lines */}
            {fillPath && <path d={fillPath} fill="rgba(255,255,255,0.04)" />}

            {/* Price lines */}
            <path d={kPath} fill="none" stroke={KUMBAYA_COLOR} strokeWidth={1.5} opacity={0.9} />
            <path d={pPath} fill="none" stroke={PRISM_COLOR} strokeWidth={1.5} opacity={0.9} />

            {/* X-axis labels */}
            {aligned.map((a, i) => {
                const step = Math.max(1, Math.floor(aligned.length / 6));
                if (i % step !== 0 && i !== aligned.length - 1) return null;
                const x = xScale(i);
                return (
                    <text
                        key={`x-${a.timestamp}`}
                        x={x}
                        y={viewH - 4}
                        textAnchor="middle"
                        fill="#888"
                        fontSize={7}
                        fontFamily="var(--font-mono)"
                    >
                        {formatXLabel(a.timestamp)}
                    </text>
                );
            })}

            {/* Crosshair + tooltip */}
            {hover && hoveredData && (
                <g pointerEvents="none">
                    <line
                        x1={crosshairX}
                        x2={crosshairX}
                        y1={PADDING.top}
                        y2={PADDING.top + chartH}
                        stroke="rgba(255,255,255,0.3)"
                        strokeWidth={0.5}
                        strokeDasharray="3,3"
                    />
                    {hoveredData.kClose != null && (
                        <circle cx={crosshairX} cy={yScale(hoveredData.kClose)} r={3} fill={KUMBAYA_COLOR} />
                    )}
                    {hoveredData.pClose != null && (
                        <circle cx={crosshairX} cy={yScale(hoveredData.pClose)} r={3} fill={PRISM_COLOR} />
                    )}

                    {/* Tooltip */}
                    {(() => {
                        const tooltipW = 170;
                        const tooltipH = 58;
                        const tooltipX = crosshairX + tooltipW + 8 > viewW ? crosshairX - tooltipW - 8 : crosshairX + 8;
                        const tooltipY = Math.max(
                            PADDING.top,
                            Math.min(viewH - tooltipH - 4, (hover.svgY || PADDING.top) - tooltipH / 2)
                        );
                        const spread =
                            hoveredData.kClose != null && hoveredData.pClose != null
                                ? (() => {
                                      const mid = (hoveredData.kClose + hoveredData.pClose) / 2;
                                      return mid !== 0 ? ((hoveredData.kClose - hoveredData.pClose) / mid) * 100 : 0;
                                  })()
                                : null;
                        return (
                            <>
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
                                <text
                                    x={tooltipX + 6}
                                    y={tooltipY + 12}
                                    fill="#aaa"
                                    fontSize={7}
                                    fontFamily="var(--font-mono)"
                                >
                                    {new Date(hoveredData.timestamp).toLocaleString(undefined, {
                                        month: "short",
                                        day: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    })}
                                </text>
                                <text
                                    x={tooltipX + 6}
                                    y={tooltipY + 24}
                                    fill={KUMBAYA_COLOR}
                                    fontSize={7}
                                    fontFamily="var(--font-mono)"
                                >
                                    K: {hoveredData.kClose != null ? formatValue(hoveredData.kClose) : "—"}
                                </text>
                                <text
                                    x={tooltipX + 6}
                                    y={tooltipY + 36}
                                    fill={PRISM_COLOR}
                                    fontSize={7}
                                    fontFamily="var(--font-mono)"
                                >
                                    P: {hoveredData.pClose != null ? formatValue(hoveredData.pClose) : "—"}
                                </text>
                                <text
                                    x={tooltipX + 6}
                                    y={tooltipY + 50}
                                    fill={
                                        spread != null
                                            ? spread > 0
                                                ? "#22c55e"
                                                : spread < 0
                                                  ? "#ef4444"
                                                  : "#888"
                                            : "#888"
                                    }
                                    fontSize={7}
                                    fontFamily="var(--font-mono)"
                                    fontWeight={700}
                                >
                                    SPREAD: {spread != null ? `${spread > 0 ? "+" : ""}${spread.toFixed(3)}%` : "—"}
                                </text>
                            </>
                        );
                    })()}
                </g>
            )}
        </svg>
    );
});
