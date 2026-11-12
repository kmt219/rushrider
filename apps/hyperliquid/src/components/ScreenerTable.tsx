import type { HIP3Market, PrimaryTab, SortConfig, SortField } from "../types";
import { MarketRow } from "./MarketRow";
import { useMemo } from "react";

interface ColumnDef {
    key: string;
    sortField?: SortField;
    label: string;
    title?: string;
}

// Main-dex perps & tradfi: OI cap not available from public API — no OI UTIL column
const COLUMNS: ColumnDef[] = [
    { key: "coin", sortField: "coin", label: "Symbol" },
    { key: "markPx", sortField: "markPx", label: "Last Price" },
    { key: "change24h", sortField: "change24h", label: "24H Change" },
    { key: "change1h", sortField: "change1h", label: "1H" },
    { key: "fundingRate", sortField: "fundingRate", label: "8H Funding", title: "Perpetuals only" },
    { key: "fundingApr", label: "Fund.APR", title: "Perpetuals only" },
    { key: "volume24h", sortField: "volume24h", label: "Volume" },
    { key: "openInterest", sortField: "openInterest", label: "Open Interest" },
    { key: "oiDeltaRefresh", label: "OI Δ" },
    { key: "premiumBps", sortField: "premiumBps", label: "Basis" },
    { key: "turnover", label: "Turnover" },
    { key: "spreadBps", sortField: "spreadBps", label: "Spread" },
    { key: "makerTakerRatio", sortField: "makerTakerRatio", label: "M/T" },
];

// HIP-3 builder-dex: has real OI cap data from perpDexs → show OI UTIL; no funding/basis
const HIP3_COLUMNS: ColumnDef[] = [
    { key: "coin", sortField: "coin", label: "Symbol" },
    { key: "markPx", sortField: "markPx", label: "Last Price" },
    { key: "change24h", sortField: "change24h", label: "24H Change" },
    { key: "change1h", sortField: "change1h", label: "1H" },
    { key: "volume24h", sortField: "volume24h", label: "Volume" },
    { key: "openInterest", sortField: "openInterest", label: "Open Interest" },
    {
        key: "oiUtilization",
        sortField: "oiUtilization",
        label: "OI Util",
        title: "Open interest as % of streaming cap",
    },
    { key: "spreadBps", sortField: "spreadBps", label: "Spread" },
    { key: "makerTakerRatio", sortField: "makerTakerRatio", label: "M/T" },
];

// Spot & Pre-launch: no OI, no funding, no basis
const SPOT_COLUMNS: ColumnDef[] = [
    { key: "coin", sortField: "coin", label: "Symbol" },
    { key: "markPx", sortField: "markPx", label: "Last Price" },
    { key: "change24h", sortField: "change24h", label: "24H Change" },
    { key: "change1h", sortField: "change1h", label: "1H" },
    { key: "volume24h", sortField: "volume24h", label: "Volume" },
    { key: "spreadBps", sortField: "spreadBps", label: "Spread" },
    { key: "makerTakerRatio", sortField: "makerTakerRatio", label: "M/T" },
];

const OUTCOME_COLUMNS: ColumnDef[] = [
    { key: "coin", sortField: "coin", label: "Outcome" },
    { key: "markPx", sortField: "markPx", label: "% Chance" },
    { key: "volume24h", sortField: "volume24h", label: "Volume" },
    { key: "openInterest", sortField: "openInterest", label: "Open Interest" },
];

type ColumnMode = "perp" | "hip3" | "spot" | "outcome";

function getColumnMode(tab: PrimaryTab): ColumnMode {
    if (tab === "Outcome") return "outcome";
    if (tab === "HIP-3") return "hip3";
    if (tab === "Spot" || tab === "Pre-launch") return "spot";
    return "perp";
}

function getColumns(mode: ColumnMode): ColumnDef[] {
    if (mode === "outcome") return OUTCOME_COLUMNS;
    if (mode === "hip3") return HIP3_COLUMNS;
    if (mode === "spot") return SPOT_COLUMNS;
    return COLUMNS;
}

// Per-column base widths for skeleton bars (0 = column often shows "—", appears rarely)
// Matches COLUMNS (13 cols), HIP3_COLUMNS (9 cols), SPOT_COLUMNS (7 cols)
const SK_WIDTHS_PERP = [88, 64, 48, 34, 42, 42, 58, 66, 0, 28, 26, 26, 0];
const SK_WIDTHS_HIP3 = [88, 64, 48, 34, 58, 66, 0, 26, 0];
const SK_WIDTHS_SPOT = [88, 64, 48, 34, 58, 26, 0];
const SK_WIDTHS_OUTCOME = [250, 64, 58, 66];
const SK_ROWS = 22;

function ScreenerSkeleton({ columns, skWidths }: { columns: readonly ColumnDef[]; skWidths: number[] }) {
    return (
        <div className="screener-wrap">
            <table className="screener-table">
                <thead>
                    <tr>
                        {columns.map((col) => (
                            <th key={col.key} className="col-nosort">
                                {col.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {Array.from({ length: SK_ROWS }, (_, ri) => (
                        <tr key={ri} className="sk-row" style={{ opacity: Math.max(0.25, 1 - ri * 0.035) }}>
                            {skWidths.map((bw, ci) => {
                                // Stable pseudo-random width variation per cell
                                const noise = ((ri * 13 + ci * 7) % 23) - 11;
                                const show = bw > 0 || (ri * 17 + ci) % 5 === 0;
                                const w = bw > 0 ? Math.max(16, bw + noise) : 22;
                                return (
                                    <td key={ci}>
                                        {show && (
                                            <div
                                                className="sk-bar"
                                                style={{
                                                    width: w,
                                                    animationDelay: `${((ri * 0.05 + ci * 0.01) % 0.55).toFixed(2)}s`,
                                                }}
                                            />
                                        )}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

interface ScreenerTableProps {
    markets: HIP3Market[];
    loading: boolean;
    sortConfig: SortConfig;
    onSort: (field: SortField) => void;
    selectedCoin: string | null;
    onSelectMarket: (market: HIP3Market) => void;
    primaryTab: PrimaryTab;
}

export function ScreenerTable({
    markets,
    loading,
    sortConfig,
    onSort,
    selectedCoin,
    onSelectMarket,
    primaryTab,
}: ScreenerTableProps) {
    const columnMode = getColumnMode(primaryTab);
    const activeColumns = getColumns(columnMode);
    const skWidths =
        columnMode === "outcome"
            ? SK_WIDTHS_OUTCOME
            : columnMode === "hip3"
              ? SK_WIDTHS_HIP3
              : columnMode === "spot"
                ? SK_WIDTHS_SPOT
                : SK_WIDTHS_PERP;
    const maxVolume = useMemo(() => Math.max(...markets.map((m) => m.volume24h), 1), [markets]);

    if (loading && markets.length === 0) {
        return <ScreenerSkeleton columns={activeColumns} skWidths={skWidths} />;
    }

    if (markets.length === 0) {
        return <div className="empty-msg">No markets match filters</div>;
    }

    return (
        <div className="screener-wrap">
            <table className="screener-table">
                <thead>
                    <tr>
                        {activeColumns.map((col) => {
                            const isSorted = col.sortField !== undefined && sortConfig.field === col.sortField;
                            const isSortable = col.sortField !== undefined;
                            return (
                                <th
                                    key={col.key}
                                    className={[isSorted ? "sorted" : "", isSortable ? "" : "col-nosort"]
                                        .filter(Boolean)
                                        .join(" ")}
                                    onClick={() => isSortable && onSort(col.sortField!)}
                                    title={col.title}
                                >
                                    {col.label}
                                    {isSorted && (
                                        <span className="sort-arrow">
                                            {sortConfig.direction === "asc" ? "\u25B2" : "\u25BC"}
                                        </span>
                                    )}
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody>
                    {markets.map((market) => (
                        <MarketRow
                            key={`${market.marketClass}-${market.coin}`}
                            market={market}
                            maxVolume={maxVolume}
                            selected={selectedCoin === market.coin}
                            onClick={() => onSelectMarket(market)}
                            columnMode={columnMode}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    );
}
