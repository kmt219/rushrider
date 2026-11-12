import { useState, useEffect, useCallback, useRef } from "react";

interface DepthTick {
    tick: number;
    liquidity_net: string;
    price: string;
}

interface DepthResponse {
    current_tick: number;
    current_price: string;
    tick_spacing: number;
    fee_tier: string;
    token0_symbol: string;
    token1_symbol: string;
    ticks: DepthTick[];
}

interface BarData {
    tickLow: number;
    tickHigh: number;
    midTick: number;
    liquidity: number;
    price: number;
    isAbove: boolean; // true = above current tick (token1/blue side)
}

interface TooltipState {
    bar: BarData;
    pctX: number; // 0–100, relative to chart width
}

// 5-color palette cycling for multiple position overlays
const POSITION_COLORS = [
    "var(--accent)", // green (primary)
    "#f59e0b", // amber
    "#8b5cf6", // violet
    "#ec4899", // pink
    "#06b6d4", // cyan
] as const;

interface PositionRange {
    price_lower: number;
    price_upper: number;
    token_id?: string;
}

interface Props {
    pool: string;
    positions?: PositionRange[];
}

const depthCache = new Map<string, { data: DepthResponse; ts: number }>();
const DEPTH_TTL_MS = 2 * 60 * 1000;

// Zoom levels as tick ranges around current price
const ZOOM_LEVELS = [500, 1000, 2000, 4000, 8000] as const;
const DEFAULT_ZOOM_IDX = 2; // 2000 ticks

const W = 600;
const H = 200;
const PAD = { top: 8, right: 8, bottom: 24, left: 8 };
const CHART_W = W - PAD.left - PAD.right;
const CHART_H = H - PAD.top - PAD.bottom;
const TARGET_BARS = 32;

function groupIntoBars(ticks: DepthTick[], targetCount: number, currentTick: number): BarData[] {
    if (ticks.length === 0) return [];
    const chunkSize = Math.max(1, Math.ceil(ticks.length / targetCount));
    const bars: BarData[] = [];

    for (let i = 0; i < ticks.length; i += chunkSize) {
        const chunk = ticks.slice(i, i + chunkSize);
        const avgLiq = chunk.reduce((s, t) => s + Math.max(0, parseFloat(t.liquidity_net)), 0) / chunk.length;
        if (avgLiq <= 0) continue;
        const midIdx = Math.floor(chunk.length / 2);
        const first = chunk[0]!;
        const last = chunk[chunk.length - 1]!;
        const mid = chunk[midIdx]!;
        bars.push({
            tickLow: first.tick,
            tickHigh: last.tick,
            midTick: mid.tick,
            liquidity: avgLiq,
            price: parseFloat(mid.price),
            isAbove: mid.tick > currentTick,
        });
    }
    return bars;
}

function fmtLiq(n: number): string {
    if (n >= 1e15) return `${(n / 1e15).toFixed(1)}P`;
    if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return n.toFixed(0);
}

function fmtPrice(p: number): string {
    if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (p >= 1) return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return p.toPrecision(4);
}

export function LiquidityDepthChart({ pool, positions = [] }: Props) {
    const [zoomIdx, setZoomIdx] = useState(DEFAULT_ZOOM_IDX);
    const [depthData, setDepthData] = useState<DepthResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [tooltip, setTooltip] = useState<TooltipState | null>(null);

    const fetchDepth = useCallback(async (p: string, range: number) => {
        const key = `${p}:${range}`;
        const cached = depthCache.get(key);
        if (cached && Date.now() - cached.ts < DEPTH_TTL_MS) {
            setDepthData(cached.data);
            setLoading(false);
            return;
        }
        setLoading(true);
        setDepthData(null);
        try {
            const res = await fetch(`/api/lp/liquidity-depth?pool=${p}&tick_range=${range}`);
            const data = (await res.json()) as DepthResponse;
            if (res.ok) {
                depthCache.set(key, { data, ts: Date.now() });
                setDepthData(data);
            }
        } catch {
            // depth is non-critical; fail silently
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (pool) void fetchDepth(pool, ZOOM_LEVELS[zoomIdx] as number);
    }, [pool, zoomIdx, fetchDepth]);

    const ticks = depthData?.ticks ?? [];
    const currentTick = depthData?.current_tick ?? 0;
    const currentPrice = parseFloat(depthData?.current_price ?? "0");
    const token0Symbol = depthData?.token0_symbol ?? "TOKEN0";
    const token1Symbol = depthData?.token1_symbol ?? "TOKEN1";
    const feeTier = depthData?.fee_tier ?? "";

    const bars = groupIntoBars(ticks, TARGET_BARS, currentTick);
    const maxLiq = Math.max(...bars.map((b) => b.liquidity), 1);

    const barW = bars.length > 0 ? CHART_W / bars.length : 0;
    const gap = Math.max(0.5, barW * 0.1);

    // Price scale for position overlays and current price line
    const prices = bars.map((b) => b.price);
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 1;
    const priceRange = maxPrice - minPrice || 1;
    const pToX = (p: number) => PAD.left + ((p - minPrice) / priceRange) * CHART_W;
    const cpX = pToX(currentPrice);

    // Inverse prices for header display
    const price0in1 = currentPrice > 0 ? fmtPrice(currentPrice) : "—";
    const price1in0 = currentPrice > 0 ? fmtPrice(1 / currentPrice) : "—";

    return (
        <div className="lp-depth-chart">
            {/* ── Price strip (pair name lives in PoolSummaryBar above) ── */}
            {currentPrice > 0 && (
                <div className="lp-depth-price-strip">
                    <span>
                        1 {token0Symbol} = {price0in1} {token1Symbol}
                    </span>
                    <span>
                        1 {token1Symbol} = {price1in0} {token0Symbol}
                    </span>
                </div>
            )}

            {/* ── SVG chart ── */}
            <div className="lp-depth-svg-wrap" onMouseLeave={() => setTooltip(null)}>
                <svg
                    viewBox={`0 0 ${W} ${H}`}
                    className="lp-depth-svg"
                    style={{ width: "100%", height: "200px", display: "block" }}
                    preserveAspectRatio="none"
                >
                    {/* Skeleton bars while loading */}
                    {loading &&
                        [38, 22, 30, 48, 62, 72, 85, 95, 78, 65, 88, 70, 50, 40, 28].map((h, i) => (
                            <rect
                                key={i}
                                x={PAD.left + i * (CHART_W / 15) + 1}
                                y={PAD.top + CHART_H * (1 - h / 100)}
                                width={Math.max(1, CHART_W / 15 - 2)}
                                height={CHART_H * (h / 100)}
                                fill="var(--border)"
                                rx={1}
                                className="lp-depth-skel-bar"
                                style={{ animationDelay: `${i * 0.06}s` }}
                            />
                        ))}

                    {/* Position range overlays — cycle through color palette */}
                    {positions.map((pos, i) => {
                        const x1 = pToX(pos.price_lower);
                        const x2 = pToX(pos.price_upper);
                        const color = POSITION_COLORS[i % POSITION_COLORS.length];
                        const rx = Math.min(x1, x2);
                        const rw = Math.abs(x2 - x1);
                        // Skip overlays that are completely off-chart
                        if (rx > W - PAD.right || rx + rw < PAD.left) return null;
                        // Enforce 6px min-width so tight ranges remain visible
                        const displayW = Math.max(6, rw);
                        return (
                            <g key={i}>
                                <rect
                                    x={rx}
                                    y={PAD.top}
                                    width={displayW}
                                    height={CHART_H}
                                    fill={color}
                                    fillOpacity={0.15}
                                />
                                <line
                                    x1={rx}
                                    y1={PAD.top}
                                    x2={rx + displayW}
                                    y2={PAD.top}
                                    stroke={color}
                                    strokeWidth={1.5}
                                    strokeOpacity={0.7}
                                />
                            </g>
                        );
                    })}

                    {/* Liquidity bars */}
                    {bars.map((bar, i) => {
                        const x = PAD.left + i * barW + gap;
                        const bw = Math.max(1, barW - gap * 2);
                        const barH = (bar.liquidity / maxLiq) * CHART_H;
                        const y = PAD.top + CHART_H - barH;
                        const isHovered = tooltip?.bar === bar;
                        return (
                            <rect
                                key={i}
                                x={x}
                                y={y}
                                width={bw}
                                height={barH}
                                fill={bar.isAbove ? "#3b82f6" : "#6b7280"}
                                fillOpacity={isHovered ? 1 : 0.72}
                                style={{ cursor: "crosshair" }}
                                onMouseEnter={() => {
                                    const pctX = ((PAD.left + i * barW + barW / 2) / W) * 100;
                                    setTooltip({ bar, pctX });
                                }}
                            />
                        );
                    })}

                    {/* Current price dashed line */}
                    {cpX >= PAD.left && cpX <= W - PAD.right && (
                        <line
                            x1={cpX}
                            y1={PAD.top}
                            x2={cpX}
                            y2={H - PAD.bottom}
                            stroke="var(--fg)"
                            strokeWidth={1}
                            strokeDasharray="3 2"
                            strokeOpacity={0.45}
                        />
                    )}

                    {/* X-axis price labels */}
                    {bars.length > 0 &&
                        (
                            [
                                { price: minPrice, anchor: "start" as const, x: PAD.left },
                                {
                                    price: currentPrice,
                                    anchor: "middle" as const,
                                    x: Math.max(PAD.left + 20, Math.min(cpX, W - PAD.right - 20)),
                                },
                                { price: maxPrice, anchor: "end" as const, x: W - PAD.right },
                            ] as { price: number; anchor: "start" | "middle" | "end"; x: number }[]
                        ).map(({ price, anchor, x }) => (
                            <text
                                key={anchor}
                                x={x}
                                y={H - 5}
                                fill="var(--fg)"
                                fillOpacity={0.3}
                                fontSize={9}
                                fontFamily="var(--font-mono)"
                                textAnchor={anchor}
                            >
                                ${fmtPrice(price)}
                            </text>
                        ))}
                </svg>

                {/* Tooltip */}
                {tooltip &&
                    (() => {
                        const b = tooltip.bar;
                        const priceLow = Math.pow(1.0001, Math.min(b.tickLow, b.tickHigh));
                        const priceHigh = Math.pow(1.0001, Math.max(b.tickLow, b.tickHigh));
                        const depthPct = Math.round((b.liquidity / maxLiq) * 100);
                        const distPct = currentPrice > 0 ? ((b.price - currentPrice) / currentPrice) * 100 : 0;
                        const side = b.isAbove ? token1Symbol : token0Symbol;
                        const sideLabel = b.isAbove ? "ASK SIDE" : "BID SIDE";
                        return (
                            <div
                                className="lp-depth-tooltip"
                                style={{ left: `${Math.min(Math.max(tooltip.pctX, 5), 72)}%` }}
                            >
                                <div className="lp-depth-tt-range">
                                    ${fmtPrice(priceLow)} – ${fmtPrice(priceHigh)}
                                </div>
                                <div className="lp-depth-tt-row">
                                    <span
                                        className={`lp-depth-tt-side ${b.isAbove ? "lp-depth-tt-side--ask" : "lp-depth-tt-side--bid"}`}
                                    >
                                        {side} · {sideLabel}
                                    </span>
                                </div>
                                <div className="lp-depth-tt-row lp-depth-tt-stats">
                                    <span className="lp-depth-tt-stat">
                                        <span className="lp-depth-tt-stat-label">DEPTH</span>
                                        <span className="lp-depth-tt-stat-value">{depthPct}%</span>
                                    </span>
                                    <span className="lp-depth-tt-stat">
                                        <span className="lp-depth-tt-stat-label">FROM MKT</span>
                                        <span className="lp-depth-tt-stat-value">
                                            {distPct >= 0 ? "+" : ""}
                                            {distPct.toFixed(1)}%
                                        </span>
                                    </span>
                                </div>
                            </div>
                        );
                    })()}
            </div>

            {/* ── Footer: zoom + tab ── */}
            <div className="lp-depth-footer">
                <div className="lp-depth-zoom">
                    <button
                        className="lp-depth-zoom-btn"
                        onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}
                        disabled={zoomIdx === 0}
                        title="Zoom in"
                    >
                        −
                    </button>
                    <button
                        className="lp-depth-zoom-btn"
                        onClick={() => setZoomIdx(DEFAULT_ZOOM_IDX)}
                        title="Reset zoom"
                    >
                        ⊞
                    </button>
                    <button
                        className="lp-depth-zoom-btn"
                        onClick={() => setZoomIdx((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
                        disabled={zoomIdx === ZOOM_LEVELS.length - 1}
                        title="Zoom out"
                    >
                        +
                    </button>
                </div>
                <div className="lp-depth-label-inline">LIQUIDITY DEPTH</div>
            </div>
        </div>
    );
}
