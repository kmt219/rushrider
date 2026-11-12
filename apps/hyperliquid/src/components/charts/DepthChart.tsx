import type { OrderBook } from "../../types";
import { formatPrice, formatSize } from "../../utils/format";
import { useState } from "react";

interface DepthChartProps {
    orderBook: OrderBook;
}

interface TooltipState {
    svgX: number;
    dotY: number;
    price: number;
    cumSize: number;
    side: "bid" | "ask";
}

const W = 600;
const H = 150;
const PAD = { top: 8, right: 12, bottom: 22, left: 12 };
const CHART_W = W - PAD.left - PAD.right;
const CHART_H = H - PAD.top - PAD.bottom;

/** Build a step-chart polyline string: for each point, emit a horizontal segment
 *  then a vertical drop, producing the staircase look of a depth chart. */
function stepPoints(pts: { x: number; y: number }[]): string {
    if (pts.length === 0) return "";
    const segments: string[] = [];
    for (let i = 0; i < pts.length; i++) {
        const cur = pts[i]!;
        const prev = pts[i - 1];
        if (prev) {
            // horizontal from prev.x to cur.x at prev.y, then vertical to cur.y
            segments.push(`${cur.x},${prev.y}`);
        }
        segments.push(`${cur.x},${cur.y}`);
    }
    return segments.join(" ");
}

export function DepthChart({ orderBook }: DepthChartProps) {
    const { bids, asks } = orderBook;
    const [tooltip, setTooltip] = useState<TooltipState | null>(null);

    if (bids.length === 0 && asks.length === 0) return <div className="empty-msg">No order book data</div>;

    // Build cumulative arrays
    // bids: sorted highest price first → cumulate going left (away from mid)
    const cumBids: { price: number; cum: number }[] = [];
    let runB = 0;
    for (const b of bids) {
        runB += b.size;
        cumBids.push({ price: b.price, cum: runB });
    }

    // asks: sorted lowest price first → cumulate going right (away from mid)
    const cumAsks: { price: number; cum: number }[] = [];
    let runA = 0;
    for (const a of asks) {
        runA += a.size;
        cumAsks.push({ price: a.price, cum: runA });
    }

    if (cumBids.length === 0 || cumAsks.length === 0)
        return <div className="empty-msg">Insufficient order book data</div>;

    const bestBid = bids[0]!.price;
    const bestAsk = asks[0]!.price;
    const midPrice = (bestBid + bestAsk) / 2;

    // Symmetric price range around mid (use whichever side extends further)
    const bidSpread = midPrice - cumBids[cumBids.length - 1]!.price;
    const askSpread = cumAsks[cumAsks.length - 1]!.price - midPrice;
    const halfRange = Math.max(bidSpread, askSpread) * 1.05 || midPrice * 0.02;
    const priceMin = midPrice - halfRange;
    const priceMax = midPrice + halfRange;
    const priceRange = priceMax - priceMin;

    const maxCum = Math.max(runB, runA, 1);

    const toX = (price: number) => PAD.left + ((price - priceMin) / priceRange) * CHART_W;
    const toY = (cum: number) => PAD.top + CHART_H - (cum / maxCum) * CHART_H;
    const midX = toX(midPrice);
    const baseY = PAD.top + CHART_H;

    // Bid points: lowest price → highest price (left → right, approaching mid)
    const bidPts = [...cumBids].reverse().map(({ price, cum }) => ({
        x: toX(price),
        y: toY(cum),
    }));

    // Ask points: lowest price → highest price (left → right, away from mid)
    const askPts = cumAsks.map(({ price, cum }) => ({
        x: toX(price),
        y: toY(cum),
    }));

    const bidSteps = stepPoints(bidPts);
    const askSteps = stepPoints(askPts);

    const bidFirst = bidPts[0];
    const bidLast = bidPts[bidPts.length - 1];
    const askFirst = askPts[0];
    const askLast = askPts[askPts.length - 1];

    const bidArea = bidFirst && bidLast ? `${bidFirst.x},${baseY} ${bidSteps} ${midX},${baseY}` : "";
    const askArea = askFirst && askLast ? `${midX},${baseY} ${askSteps} ${askLast.x},${baseY}` : "";

    const bidLine = bidFirst ? `${midX},${baseY} ${bidSteps}` : "";
    const askLine = askFirst ? `${midX},${baseY} ${askSteps}` : "";

    // Price axis labels (3 ticks)
    const priceTicks = [priceMin, midPrice, priceMax];

    function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
        const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const relX = (e.clientX - rect.left) / rect.width;
        const svgX = relX * W;
        const hoverPrice = priceMin + ((svgX - PAD.left) / CHART_W) * priceRange;

        if (hoverPrice <= midPrice) {
            // bid side — find level with nearest price (bids sorted high→low)
            const match = cumBids.find((b) => b.price <= hoverPrice) ?? cumBids[cumBids.length - 1];
            if (!match) return;
            setTooltip({
                svgX: toX(match.price),
                dotY: toY(match.cum),
                price: match.price,
                cumSize: match.cum,
                side: "bid",
            });
        } else {
            // ask side — find level with nearest price (asks sorted low→high)
            const match = cumAsks.find((a) => a.price >= hoverPrice) ?? cumAsks[cumAsks.length - 1];
            if (!match) return;
            setTooltip({
                svgX: toX(match.price),
                dotY: toY(match.cum),
                price: match.price,
                cumSize: match.cum,
                side: "ask",
            });
        }
    }

    const TIP_W = 116;
    const TIP_H = 38;

    return (
        <div className="depth-chart">
            <div className="chart-title">Order Book Depth</div>
            <svg
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                style={{ width: "100%", height: `${H}px`, display: "block", cursor: "crosshair" }}
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setTooltip(null)}
            >
                {/* Bid area fill */}
                {bidArea && <polygon points={bidArea} fill="var(--gain)" opacity="0.12" />}
                {/* Ask area fill */}
                {askArea && <polygon points={askArea} fill="var(--loss)" opacity="0.12" />}

                {/* Bid step line */}
                {bidLine && <polyline points={bidLine} fill="none" stroke="var(--gain)" strokeWidth="1.5" />}
                {/* Ask step line */}
                {askLine && <polyline points={askLine} fill="none" stroke="var(--loss)" strokeWidth="1.5" />}

                {/* Mid price dashed line */}
                <line
                    x1={midX}
                    y1={PAD.top}
                    x2={midX}
                    y2={baseY}
                    stroke="var(--border)"
                    strokeWidth="0.6"
                    strokeDasharray="3,3"
                />

                {/* Price axis labels */}
                {priceTicks.map((p, i) => (
                    <text
                        key={i}
                        x={toX(p)}
                        y={H - 5}
                        textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
                        fontSize="8.5"
                        fill="var(--fg-muted)"
                        opacity="0.7"
                    >
                        {formatPrice(p)}
                    </text>
                ))}

                {/* Hover crosshair + tooltip */}
                {tooltip && (
                    <>
                        <line
                            x1={tooltip.svgX}
                            y1={PAD.top}
                            x2={tooltip.svgX}
                            y2={baseY}
                            stroke="var(--fg-muted)"
                            strokeWidth="0.6"
                            strokeDasharray="2,2"
                            opacity="0.6"
                        />
                        <circle
                            cx={tooltip.svgX}
                            cy={tooltip.dotY}
                            r="3"
                            fill={tooltip.side === "bid" ? "var(--gain)" : "var(--loss)"}
                        />
                        {(() => {
                            const tipX = tooltip.svgX > W / 2 ? tooltip.svgX - TIP_W - 6 : tooltip.svgX + 6;
                            const tipY = Math.max(PAD.top, Math.min(tooltip.dotY - TIP_H / 2, baseY - TIP_H));
                            const color = tooltip.side === "bid" ? "var(--gain)" : "var(--loss)";
                            return (
                                <>
                                    <rect
                                        x={tipX}
                                        y={tipY}
                                        width={TIP_W}
                                        height={TIP_H}
                                        rx="3"
                                        fill="var(--bg-panel)"
                                        stroke="var(--border)"
                                        strokeWidth="0.6"
                                    />
                                    <text
                                        x={tipX + TIP_W / 2}
                                        y={tipY + 13}
                                        textAnchor="middle"
                                        fontSize="9.5"
                                        fontWeight="600"
                                        fill={color}
                                    >
                                        {tooltip.side === "bid" ? "BID" : "ASK"} {formatPrice(tooltip.price)}
                                    </text>
                                    <text
                                        x={tipX + TIP_W / 2}
                                        y={tipY + 27}
                                        textAnchor="middle"
                                        fontSize="9"
                                        fill="var(--fg-muted)"
                                    >
                                        Cum: {formatSize(tooltip.cumSize)}
                                    </text>
                                </>
                            );
                        })()}
                    </>
                )}
            </svg>
        </div>
    );
}
