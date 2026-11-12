/**
 * HolderMap — D3 force-directed bubble visualization of token holders.
 *
 * Features: MAP/TABLE toggle, zoom/pan (wheel), drag to pin bubbles,
 * cluster rings + labels, rich tooltip (copy + explorer link + USD),
 * risk legend, HHI tier badge.
 *
 * holderMapState is lifted to the parent (HolderMapPanel) so Phase 4
 * hooks (useHolderStream, useWalletCluster) can share it.
 */
import type { UseHolderMapReturn } from "../hooks/useHolderMap";
import type { Cluster, ConcentrationData, TransferEdge } from "../types";
import { getExplorerUrl } from "../utils";
import { hhiColor, hhiLabel } from "../utils/concentration";
import { getHolderTags, TAG_COLORS } from "../utils/holderTags";
import { DistributionBar } from "./DistributionBar";
import { HolderTable } from "./HolderTable";
import { useCallback, useEffect, useRef, useState } from "react";

interface HolderMapProps {
    data: ConcentrationData;
    holderMapState: UseHolderMapReturn;
    clusters?: Cluster[];
    edges?: TransferEdge[];
    chainName: string;
    onWalletClick?: (address: string) => void;
    /** Called when the canvas resizes — lets the parent update useHolderMap dims. */
    onDimsChange?: (dims: { w: number; h: number }) => void;
}

const TIER_LEGEND = [
    { tier: "whale", label: "WHALE ≥10%", color: "var(--danger,#ef4444)" },
    { tier: "large", label: "LARGE ≥3%", color: "var(--warning,#f59e0b)" },
    { tier: "medium", label: "MED ≥0.5%", color: "var(--warning-soft,#fbbf24)" },
    { tier: "small", label: "SMALL", color: "var(--accent,#00d084)" },
] as const;

export function HolderMap({
    data,
    holderMapState,
    clusters = [],
    edges = [],
    chainName,
    onWalletClick,
    onDimsChange,
}: HolderMapProps) {
    const [view, setView] = useState<"map" | "table">("map");
    const containerRef = useRef<HTMLDivElement>(null);
    const [dims, setDims] = useState({ w: 0, h: 300 });

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) return;
            const { width, height } = entry.contentRect;
            const next = { w: Math.floor(width), h: Math.max(240, Math.floor(height)) };
            setDims(next);
            onDimsChange?.(next);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [onDimsChange]);

    const { nodesRef, tick, isRunning, reheat } = holderMapState;
    // Unique per-instance marker ID to avoid SVG id collision when multiple HolderMap instances mount
    const markerId = useRef(`hm-arrow-${Math.random().toString(36).slice(2)}`).current;

    // ── Tooltip ──────────────────────────────────────────────────────────
    const tooltipRef = useRef<HTMLDivElement>(null);
    const [hoveredAddr, setHoveredAddr] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const handleMouseMove = useCallback((e: React.MouseEvent<SVGCircleElement>, address: string) => {
        setHoveredAddr(address);
        if (tooltipRef.current) {
            const tipW = 210;
            const left = e.clientX + 14 + tipW > window.innerWidth ? e.clientX - tipW - 8 : e.clientX + 14;
            tooltipRef.current.style.left = `${left}px`;
            tooltipRef.current.style.top = `${e.clientY - 10}px`;
        }
    }, []);

    const handleCopy = useCallback((addr: string) => {
        navigator.clipboard.writeText(addr).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
        });
    }, []);

    // ── Zoom / Pan ───────────────────────────────────────────────────────
    const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });

    const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
        // Let the flyout scroll naturally — don't hijack wheel events originating inside it.
        if ((e.target as HTMLElement).closest(".wallet-flyout")) return;
        e.preventDefault();
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        setTransform((prev) => {
            const factor = e.deltaY < 0 ? 1.12 : 0.9;
            const newScale = Math.min(5, Math.max(0.25, prev.scale * factor));
            return {
                x: mx - (mx - prev.x) * (newScale / prev.scale),
                y: my - (my - prev.y) * (newScale / prev.scale),
                scale: newScale,
            };
        });
    }, []);

    // ── Drag to pin ──────────────────────────────────────────────────────
    const dragRef = useRef<string | null>(null);

    const handleBubblePointerDown = useCallback(
        (e: React.PointerEvent<SVGCircleElement>, address: string) => {
            (e.target as SVGCircleElement).setPointerCapture(e.pointerId);
            dragRef.current = address;
            reheat();
        },
        [reheat]
    );

    const handleSvgPointerMove = useCallback(
        (e: React.PointerEvent<SVGSVGElement>) => {
            if (!dragRef.current || !containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const svgX = (e.clientX - rect.left - transform.x) / transform.scale;
            const svgY = (e.clientY - rect.top - transform.y) / transform.scale;
            const node = nodesRef.current.find((n) => n.address === dragRef.current);
            if (!node) return;
            node.fx = svgX;
            node.fy = svgY;
        },
        [nodesRef, transform]
    );

    const handleSvgPointerUp = useCallback(() => {
        if (!dragRef.current) return;
        const node = nodesRef.current.find((n) => n.address === dragRef.current);
        if (node) {
            node.fx = null;
            node.fy = null;
        }
        dragRef.current = null;
    }, [nodesRef]);

    const nodes = nodesRef.current;
    const hoveredNode = hoveredAddr ? nodes.find((n) => n.address === hoveredAddr) : null;
    const now = Date.now();

    // Build addr → cluster color for fast bubble stroke lookup
    const addrClusterColor = new Map<string, string>();
    for (const c of clusters) {
        for (const addr of c.members) {
            if (!addrClusterColor.has(addr)) addrClusterColor.set(addr, c.color);
        }
    }

    // Compute cluster ring geometry from current node positions
    const clusterRings = clusters
        .map((cluster) => {
            const members = nodes.filter((n) => cluster.members.includes(n.address));
            if (members.length < 2) return null;
            const cx = members.reduce((s, n) => s + n.x, 0) / members.length;
            const cy = members.reduce((s, n) => s + n.y, 0) / members.length;
            const maxR = Math.max(...members.map((n) => n.radius));
            return { cluster, cx, cy, maxR };
        })
        .filter(Boolean) as { cluster: Cluster; cx: number; cy: number; maxR: number }[];

    return (
        <div className="holder-map-root">
            <DistributionBar data={data} />

            {/* ── Toolbar ────────────────────────────────────────────────── */}
            <div className="holder-map-toolbar">
                <button
                    className={`holder-map-view-btn${view === "map" ? " active" : ""}`}
                    onClick={() => setView("map")}
                >
                    MAP
                </button>
                <button
                    className={`holder-map-view-btn${view === "table" ? " active" : ""}`}
                    onClick={() => setView("table")}
                >
                    TABLE
                </button>
                {view === "map" && transform.scale !== 1 && (
                    <button
                        className="holder-map-view-btn hm-reset-btn"
                        onClick={() => setTransform({ x: 0, y: 0, scale: 1 })}
                    >
                        RESET
                    </button>
                )}
                {clusters.length > 0 && (
                    <span className="hm-cluster-count">
                        {clusters.length} CLUSTER{clusters.length > 1 ? "S" : ""}
                    </span>
                )}
                <span
                    className={`hm-tier-badge hm-tier-badge--${data.tier}`}
                    style={{ color: hhiColor(data.tier), borderColor: `${hhiColor(data.tier)}60` }}
                >
                    {hhiLabel(data.tier)} {data.hhi}
                </span>
                <span className="holder-map-count">{data.totalCount.toLocaleString()} HLDR</span>
            </div>

            {/* ── Risk tier legend ──────────────────────────────────────── */}
            <div className="hm-legend-row">
                {TIER_LEGEND.map((l) => (
                    <span key={l.tier} className="hm-legend-item">
                        <span className="hm-legend-dot" style={{ background: l.color }} />
                        {l.label}
                    </span>
                ))}
            </div>

            {/* Canvas stays in DOM always so ResizeObserver never needs to reconnect */}
            <div
                className="holder-map-canvas"
                ref={containerRef}
                onWheel={handleWheel}
                style={view !== "map" ? { display: "none" } : undefined}
            >
                {dims.w > 0 && (
                    <svg
                        width={dims.w}
                        height={dims.h}
                        className="holder-map-svg"
                        data-tick={tick}
                        onPointerMove={handleSvgPointerMove}
                        onPointerUp={handleSvgPointerUp}
                        onPointerLeave={handleSvgPointerUp}
                    >
                        {/* Arrowhead markers — unique IDs per instance to avoid collision */}
                        <defs>
                            {/* White arrowhead for direct transfer edges */}
                            <marker id={markerId} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                                <path d="M0,0 L0,6 L6,3 z" fill="rgba(255,255,255,0.5)" />
                            </marker>
                            {/* context-stroke arrowhead for cluster edges — inherits line color */}
                            <marker
                                id={`${markerId}-c`}
                                markerWidth="6"
                                markerHeight="6"
                                refX="5"
                                refY="3"
                                orient="auto"
                            >
                                <path d="M0,0 L0,6 L6,3 z" fill="context-stroke" />
                            </marker>
                        </defs>
                        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
                            {/* Cluster-member arrows (always visible when clusters exist) */}
                            {clusters.flatMap((cluster) => {
                                const members = nodes.filter((n) => cluster.members.includes(n.address));
                                if (members.length < 2) return [];
                                const arrows = [];
                                for (let i = 0; i < members.length - 1; i++) {
                                    for (let j = i + 1; j < members.length; j++) {
                                        const a = members[i]!;
                                        const b = members[j]!;
                                        const dx = b.x - a.x;
                                        const dy = b.y - a.y;
                                        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                                        const ux = dx / dist;
                                        const uy = dy / dist;
                                        arrows.push(
                                            <line
                                                key={`cl-${cluster.id}-${a.address}-${b.address}`}
                                                x1={a.x + ux * (a.radius + 3)}
                                                y1={a.y + uy * (a.radius + 3)}
                                                x2={b.x - ux * (b.radius + 8)}
                                                y2={b.y - uy * (b.radius + 8)}
                                                stroke={cluster.color}
                                                strokeWidth={1.2}
                                                strokeOpacity={0.55}
                                                markerEnd={`url(#${markerId}-c)`}
                                                style={{ pointerEvents: "none" }}
                                            />
                                        );
                                    }
                                }
                                return arrows;
                            })}

                            {/* Transfer flow arrows — directed on-chain transfers between top holders */}
                            {edges.map((edge) => {
                                const src = nodes.find((n) => n.address === edge.from);
                                const dst = nodes.find((n) => n.address === edge.to);
                                if (!src || !dst) return null;
                                // Shorten line endpoints to stop at bubble surface
                                const dx = dst.x - src.x;
                                const dy = dst.y - src.y;
                                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                                const ux = dx / dist;
                                const uy = dy / dist;
                                const x1 = src.x + ux * (src.radius + 3);
                                const y1 = src.y + uy * (src.radius + 3);
                                const x2 = dst.x - ux * (dst.radius + 8);
                                const y2 = dst.y - uy * (dst.radius + 8);
                                const opacity = Math.min(0.7, 0.3 + edge.count * 0.1);
                                return (
                                    <line
                                        key={`${edge.from}-${edge.to}`}
                                        x1={x1}
                                        y1={y1}
                                        x2={x2}
                                        y2={y2}
                                        stroke="rgba(255,255,255,0.55)"
                                        strokeWidth={Math.min(2.5, 1 + edge.count * 0.3)}
                                        strokeOpacity={opacity}
                                        markerEnd={`url(#${markerId})`}
                                        style={{ pointerEvents: "none" }}
                                    />
                                );
                            })}

                            {/* Cluster rings (behind bubbles) */}
                            <g className="cluster-rings">
                                {clusterRings.map(({ cluster, cx, cy, maxR }) => (
                                    <g key={cluster.id}>
                                        <circle
                                            cx={cx}
                                            cy={cy}
                                            r={maxR + 18}
                                            fill={`${cluster.color}14`}
                                            stroke={cluster.color}
                                            strokeWidth={1.5}
                                            strokeDasharray="4 3"
                                            className="cluster-ring"
                                        />
                                        <text
                                            x={cx}
                                            y={Math.max(14, cy - maxR - 22)}
                                            textAnchor="middle"
                                            fontSize={9}
                                            fill={cluster.color}
                                            className="cluster-ring-label"
                                            style={{ pointerEvents: "none", userSelect: "none" }}
                                        >
                                            {cluster.id}
                                        </text>
                                    </g>
                                ))}
                            </g>

                            {/* Bubbles */}
                            {nodes.map((node) => {
                                const isPulsing = node.activityAt > 0 && now - node.activityAt < 2000;
                                const isHovered = hoveredAddr === node.address;
                                const clusterColor = addrClusterColor.get(node.address);
                                const strokeColor = isHovered ? "var(--fg)" : (clusterColor ?? "var(--bg)");
                                const strokeW = isHovered ? 2 : clusterColor ? 2 : 0.5;

                                let bubbleClass = "holder-bubble";
                                if (isPulsing) bubbleClass += ` holder-pulse-${node.lastActivity ?? "buy"}`;
                                if (node.entering) bubbleClass += " holder-bubble--entering";

                                return (
                                    <g key={node.address}>
                                        <circle
                                            cx={node.x}
                                            cy={node.y}
                                            r={node.radius}
                                            fill={node.color}
                                            fillOpacity={isHovered ? 1 : 0.82}
                                            stroke={strokeColor}
                                            strokeWidth={strokeW}
                                            className={bubbleClass}
                                            style={{ cursor: "grab" }}
                                            onMouseMove={(e) => handleMouseMove(e, node.address)}
                                            onMouseLeave={() => setHoveredAddr(null)}
                                            onClick={() => onWalletClick?.(node.address)}
                                            onPointerDown={(e) => handleBubblePointerDown(e, node.address)}
                                        />
                                        {node.radius >= 14 && (
                                            <text
                                                x={node.x}
                                                y={node.y}
                                                textAnchor="middle"
                                                dominantBaseline="middle"
                                                fontSize={Math.min(10, node.radius * 0.36)}
                                                fill="var(--bg)"
                                                style={{ pointerEvents: "none", userSelect: "none" }}
                                            >
                                                {node.supplyPct >= 1 ? `${node.supplyPct.toFixed(1)}%` : node.label}
                                            </text>
                                        )}
                                    </g>
                                );
                            })}
                        </g>
                    </svg>
                )}
            </div>
            {view === "table" && <HolderTable nodes={nodes} clusters={clusters} />}

            {/* ── Floating tooltip ─────────────────────────────────────── */}
            {hoveredNode && (
                <div className="holder-tooltip" ref={tooltipRef} style={{ position: "fixed" }}>
                    <div className="holder-tooltip-addr">{hoveredNode.address}</div>
                    <div className="holder-tooltip-row">
                        <span>{hoveredNode.supplyPct.toFixed(4)}% supply</span>
                        <span>RANK #{hoveredNode.rank}</span>
                    </div>
                    {hoveredNode.balance_quote !== undefined && hoveredNode.balance_quote > 0 && (
                        <div className="holder-tooltip-usd">
                            $
                            {hoveredNode.balance_quote.toLocaleString(undefined, {
                                maximumFractionDigits: 0,
                            })}
                        </div>
                    )}
                    <div className={`holder-tooltip-tier holder-tier--${hoveredNode.riskTier}`}>
                        {hoveredNode.riskTier.toUpperCase()}
                    </div>
                    {getHolderTags(hoveredNode).length > 0 && (
                        <div className="holder-tooltip-tags">
                            {getHolderTags(hoveredNode).map((tag) => (
                                <span
                                    key={tag}
                                    className="ht-tag"
                                    style={{ color: TAG_COLORS[tag], borderColor: TAG_COLORS[tag] }}
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
