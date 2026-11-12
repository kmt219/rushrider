import type { OrderBook as OrderBookType } from "../types";
import { baseCoin, formatPrice, formatSize } from "../utils/format";
import { useState, useMemo, useEffect, useRef } from "react";

interface OrderBookProps {
    orderBook: OrderBookType;
    coin?: string;
    isOutcome?: boolean;
}

type ViewMode = "tab" | "stacked" | "large";

/** Generate 5 tick sizes scaled to the current mid price magnitude. */
function getTickSizes(midPrice: number): number[] {
    if (midPrice <= 0) return [0.01, 0.05, 0.1, 0.5, 1];
    const mag = Math.pow(10, Math.floor(Math.log10(midPrice)) - 4);
    return [mag, mag * 5, mag * 10, mag * 50, mag * 100];
}

/** Render a tick size without trailing zeros. */
function formatTick(tick: number): string {
    if (tick >= 1) return tick.toFixed(0);
    if (tick >= 0.1) return tick.toFixed(1);
    if (tick >= 0.01) return tick.toFixed(2);
    if (tick >= 0.001) return tick.toFixed(3);
    if (tick >= 0.0001) return tick.toFixed(4);
    return tick.toPrecision(1);
}

/** Compute cumulative sizes from the spread outward and the max individual size. */
function buildCumulatives(
    askLevels: { price: number; size: number }[],
    bidLevels: { price: number; size: number }[]
): { askCumul: number[]; bidCumul: number[]; maxSize: number } {
    const askCumul: number[] = [];
    let s = 0;
    for (let i = askLevels.length - 1; i >= 0; i--) {
        s += askLevels[i]!.size;
        askCumul[i] = s;
    }
    const bidCumul: number[] = [];
    s = 0;
    for (let i = 0; i < bidLevels.length; i++) {
        s += bidLevels[i]!.size;
        bidCumul[i] = s;
    }
    const maxSize = Math.max(...askLevels.map((l) => l.size), ...bidLevels.map((l) => l.size), 1);
    return { askCumul, bidCumul, maxSize };
}

/** Collapse raw order book levels into grouped price buckets. */
function groupLevels(
    levels: { price: number; size: number }[],
    tick: number,
    isAsk: boolean
): { price: number; size: number }[] {
    if (tick <= 0 || levels.length === 0) return levels;
    // Use integer keys (×1e8) to avoid floating-point collisions.
    const map = new Map<number, number>();
    for (const lv of levels) {
        const rounded = isAsk ? Math.ceil(lv.price / tick) * tick : Math.floor(lv.price / tick) * tick;
        const key = Math.round(rounded * 1e8);
        map.set(key, (map.get(key) ?? 0) + lv.size);
    }
    return Array.from(map.entries())
        .map(([key, size]) => ({ price: key / 1e8, size }))
        .sort((a, b) => b.price - a.price); // descending for both asks and bids
}

export function OrderBookDisplay({ orderBook, coin, isOutcome }: OrderBookProps) {
    const { bids, asks } = orderBook;

    const midPrice = bids[0] && asks[0] ? (bids[0].price + asks[0].price) / 2 : 0;

    // Only recompute tick options when the price order-of-magnitude changes.
    const magnitudeKey = Math.floor(Math.log10(Math.max(midPrice, 0.0001)));

    const tickSizes = useMemo(() => getTickSizes(midPrice), [magnitudeKey]);

    const [tickIdx, setTickIdx] = useState(0);
    const [viewMode, setViewMode] = useState<ViewMode>("tab");
    const [showViewMenu, setShowViewMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Reset tick index when price magnitude changes.
    useEffect(() => {
        setTickIdx(0);
    }, [magnitudeKey]);

    // Close the view menu on outside click.
    useEffect(() => {
        if (!showViewMenu) return;
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowViewMenu(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [showViewMenu]);

    const tick = tickSizes[tickIdx] ?? 0.01;
    const levels = viewMode === "tab" ? 12 : 20;

    const askLevels = useMemo(() => groupLevels(asks, tick, true).slice(0, levels), [asks, tick, levels]);
    const bidLevels = useMemo(() => groupLevels(bids, tick, false).slice(0, levels), [bids, tick, levels]);

    // Cumulative sizes from spread outward for the Total column.
    const { askCumul, bidCumul, maxSize } = useMemo(
        () => buildCumulatives(askLevels, bidLevels),
        [askLevels, bidLevels]
    );

    if (bids.length === 0 && asks.length === 0) {
        return <div className="empty-msg">No order book data</div>;
    }

    const coinLabel = coin ? baseCoin(coin) : "";

    const spread = asks[0] && bids[0] ? asks[0].price - bids[0].price : 0;
    const spreadPct = midPrice > 0 ? ((spread / midPrice) * 100).toFixed(3) : "0.000";

    const sizeHeader = isOutcome ? "Size (Yes)" : coinLabel ? `Size (${coinLabel})` : "Size";
    const totalHeader = isOutcome ? "Total (Yes)" : coinLabel ? `Total (${coinLabel})` : "Total";
    const rowCls = `ob-row${viewMode === "large" ? " ob-row--large" : ""}`;

    return (
        <div className="orderbook">
            {/* ── Controls: tick selector · coin label · view mode ─── */}
            <div className="ob-controls">
                <button
                    className="ob-tick-btn"
                    onClick={() => setTickIdx((prev) => (prev + 1) % tickSizes.length)}
                    title="Cycle tick size"
                >
                    {formatTick(tick)} <span className="ob-tick-arrow">↓</span>
                </button>

                {coinLabel && <span className="ob-coin-label">{coinLabel}</span>}

                <div className="ob-view-menu-wrap" ref={menuRef}>
                    <button className="ob-view-btn" onClick={() => setShowViewMenu((v) => !v)} title="View options">
                        ···
                    </button>
                    {showViewMenu && (
                        <div className="ob-view-menu">
                            {(["tab", "stacked", "large"] as ViewMode[]).map((mode) => (
                                <button
                                    key={mode}
                                    className={`ob-view-option${viewMode === mode ? " ob-view-option--active" : ""}`}
                                    onClick={() => {
                                        setViewMode(mode);
                                        setShowViewMenu(false);
                                    }}
                                >
                                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Column headers ─────────────────────────────────────── */}
            <div className="orderbook-header ob-3col">
                <span>Price</span>
                <span>{sizeHeader}</span>
                <span>{totalHeader}</span>
            </div>

            {/* ── Asks: highest price at top, lowest ask nearest spread ── */}
            {askLevels.map((level, i) => (
                <div key={`a-${i}`} className={`${rowCls} ob-row--ask`}>
                    <div className="ob-row-bg ob-row-bg--ask" style={{ width: `${(level.size / maxSize) * 100}%` }} />
                    <span className="ob-price ob-price--ask">{formatPrice(level.price)}</span>
                    <span className="ob-size">{formatSize(level.size)}</span>
                    <span className="ob-total">{formatSize(askCumul[i] ?? 0)}</span>
                </div>
            ))}

            {/* ── Spread divider ─────────────────────────────────────── */}
            <div className="ob-spread ob-spread--3col">
                <span className="ob-spread-label">Spread</span>
                <span className="ob-spread-val">{formatPrice(spread)}</span>
                <span className="ob-spread-pct">{spreadPct}%</span>
            </div>

            {/* ── Bids: highest bid nearest spread ───────────────────── */}
            {bidLevels.map((level, i) => (
                <div key={`b-${i}`} className={`${rowCls} ob-row--bid`}>
                    <div className="ob-row-bg ob-row-bg--bid" style={{ width: `${(level.size / maxSize) * 100}%` }} />
                    <span className="ob-price ob-price--bid">{formatPrice(level.price)}</span>
                    <span className="ob-size">{formatSize(level.size)}</span>
                    <span className="ob-total">{formatSize(bidCumul[i] ?? 0)}</span>
                </div>
            ))}
        </div>
    );
}
