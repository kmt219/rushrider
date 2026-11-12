import { useAllLiqs } from "../hooks/useAllLiqs";
import type { HIP3Market } from "../types";
import { detectOrExtendCascade } from "../utils/liquidation";
import type { CascadeChain } from "../utils/liquidation";
import { CascadeBanner } from "./CascadeBanner";
import { LiquidationFeed } from "./LiquidationFeed";
import { LiquidationTable } from "./LiquidationTable";
import { useState, useMemo } from "react";

interface LiquidationsViewProps {
    markets: HIP3Market[];
    selectedCoin: string | null;
    onSelectCoin: (coin: string) => void;
}

export function LiquidationsView({ markets, selectedCoin, onSelectCoin }: LiquidationsViewProps) {
    const [dismissedCascades, setDismissedCascades] = useState<Set<string>>(new Set());

    // Full cross-market liquidation feed from node stream ring buffers
    const nodeLiqs = useAllLiqs();

    // Fallback: 1 event per market from the market state snapshot (pre-stream)
    const snapshotLiqs = useMemo(
        () =>
            markets
                .filter((m) => m.lastLiquidation !== null)
                .map((m) => m.lastLiquidation!)
                .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()),
        [markets]
    );

    // Prefer node stream ring buffers; fall back to snapshot when stream not active
    const allLiqs = nodeLiqs.length > 0 ? nodeLiqs : snapshotLiqs;

    // Cascade detection from the live liq feed
    const activeCascadesMap = useMemo(() => {
        const map = new Map<string, CascadeChain>();
        for (const liq of allLiqs) {
            detectOrExtendCascade(liq, new Date(liq.time).getTime(), liq.markPx, map);
        }
        return map;
    }, [allLiqs]);

    const activeCascade =
        [...activeCascadesMap.values()].find((c) => c.isActive && !dismissedCascades.has(c.id)) ?? null;

    const backstopCount = allLiqs.filter((l) => l.method === "BACKSTOP").length;
    const marketCount = new Set(allLiqs.map((l) => l.coin)).size;

    return (
        <div className="liq-view">
            {activeCascade && (
                <CascadeBanner
                    cascade={activeCascade}
                    onDismiss={() => setDismissedCascades((prev) => new Set([...prev, activeCascade.id]))}
                />
            )}

            <div className="liq-view-summary-strip">
                <div className="liq-summary-item">
                    <span className="liq-summary-label">EVENTS IN FEED</span>
                    <span className="liq-summary-val">{allLiqs.length}</span>
                </div>
                <div className="liq-summary-item">
                    <span className="liq-summary-label">MARKETS HIT</span>
                    <span className="liq-summary-val">{marketCount}</span>
                </div>
                <div className="liq-summary-item">
                    <span className="liq-summary-label">BACKSTOP LIQS</span>
                    <span
                        className="liq-summary-val"
                        style={{ color: backstopCount > 0 ? "#f97316" : "var(--fg-muted)" }}
                    >
                        {backstopCount}
                    </span>
                </div>
                <div className="liq-summary-item">
                    <span className="liq-summary-label">ACTIVE CASCADE</span>
                    <span
                        className="liq-summary-val"
                        style={{ color: activeCascade ? "var(--negative)" : "var(--fg-dim)" }}
                    >
                        {activeCascade ? activeCascade.coin : "—"}
                    </span>
                </div>
            </div>

            <div className="liq-view-header">
                <span className="liq-view-title">LIVE LIQUIDATION FEED</span>
                <span className="liq-view-count val-muted">{allLiqs.length} events</span>
            </div>

            <div className="liq-view-feed">
                <LiquidationFeed liquidations={allLiqs} selectedCoin={selectedCoin} />
            </div>

            <div className="liq-view-table-header">
                <span className="liq-view-title">LIQUIDATION SCREENER</span>
            </div>

            <div className="liq-view-table">
                <LiquidationTable markets={markets} selectedCoin={selectedCoin} onSelectMarket={onSelectCoin} />
            </div>
        </div>
    );
}
