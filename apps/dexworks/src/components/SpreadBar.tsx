import type { OHLCVCandle } from "@goldrush-demos/shared-ui";
import { memo } from "react";

const PADDING = { top: 8, right: 12, bottom: 24, left: 64 };
const POS_COLOR = "#22c55e";
const NEG_COLOR = "#ef4444";

/**
 * SpreadBar — shows the spread between Kumbaya and Prism close prices over time
 * as a bar chart. Positive = Kumbaya higher, negative = Prism higher.
 */
export const SpreadBar = memo(function SpreadBar({
    kumbayaCandles,
    prismCandles,
}: {
    kumbayaCandles: OHLCVCandle[];
    prismCandles: OHLCVCandle[];
}) {
    // Build a map of timestamp -> close price for Prism
    const prismMap = new Map<string, number>();
    for (const c of prismCandles) prismMap.set(c.timestamp, c.close);

    // Only include timestamps present in both
    const spreads: { timestamp: string; spreadPct: number }[] = [];
    for (const c of kumbayaCandles) {
        const pClose = prismMap.get(c.timestamp);
        if (pClose == null) continue;
        const mid = (c.close + pClose) / 2;
        if (mid === 0) continue;
        spreads.push({
            timestamp: c.timestamp,
            spreadPct: ((c.close - pClose) / mid) * 100,
        });
    }

    if (spreads.length === 0) return null;

    const viewW = 700;
    const viewH = 80;
    const chartW = viewW - PADDING.left - PADDING.right;
    const chartH = viewH - PADDING.top - PADDING.bottom;

    const maxAbs = spreads.reduce((m, s) => Math.max(m, Math.abs(s.spreadPct)), 0) || 1;
    const barW = Math.max(1, (chartW - spreads.length) / spreads.length);
    const midY = PADDING.top + chartH / 2;

    return (
        <div className="spread-bar-container">
            <div className="spread-bar-label">SPREAD %</div>
            <svg viewBox={`0 0 ${viewW} ${viewH}`} preserveAspectRatio="xMidYMid meet" className="spread-bar-svg">
                {/* Zero line */}
                <line
                    x1={PADDING.left}
                    x2={viewW - PADDING.right}
                    y1={midY}
                    y2={midY}
                    stroke="#444"
                    strokeWidth={0.5}
                />

                {/* Y-axis labels */}
                <text
                    x={PADDING.left - 4}
                    y={PADDING.top + 4}
                    textAnchor="end"
                    fill="#555"
                    fontSize={7}
                    fontFamily="var(--font-mono)"
                >
                    +{maxAbs.toFixed(2)}%
                </text>
                <text
                    x={PADDING.left - 4}
                    y={midY + 3}
                    textAnchor="end"
                    fill="#666"
                    fontSize={7}
                    fontFamily="var(--font-mono)"
                >
                    0
                </text>
                <text
                    x={PADDING.left - 4}
                    y={PADDING.top + chartH + 2}
                    textAnchor="end"
                    fill="#555"
                    fontSize={7}
                    fontFamily="var(--font-mono)"
                >
                    −{maxAbs.toFixed(2)}%
                </text>

                {/* Bars */}
                {spreads.map((s, i) => {
                    const x = PADDING.left + i * (barW + 1);
                    const h = (Math.abs(s.spreadPct) / maxAbs) * (chartH / 2);
                    const isPos = s.spreadPct >= 0;
                    const y = isPos ? midY - h : midY;
                    return (
                        <rect
                            key={s.timestamp}
                            x={x}
                            y={y}
                            width={barW}
                            height={Math.max(0.5, h)}
                            fill={isPos ? POS_COLOR : NEG_COLOR}
                            opacity={0.6}
                        />
                    );
                })}

                {/* X-axis labels */}
                {spreads.map((s, i) => {
                    const step = Math.max(1, Math.floor(spreads.length / 6));
                    if (i % step !== 0 && i !== spreads.length - 1) return null;
                    const x = PADDING.left + i * (barW + 1) + barW / 2;
                    const d = new Date(s.timestamp);
                    const label = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
                    return (
                        <text
                            key={`x-${s.timestamp}`}
                            x={x}
                            y={viewH - 2}
                            textAnchor="middle"
                            fill="#888"
                            fontSize={7}
                            fontFamily="var(--font-mono)"
                        >
                            {label}
                        </text>
                    );
                })}
            </svg>
        </div>
    );
});
