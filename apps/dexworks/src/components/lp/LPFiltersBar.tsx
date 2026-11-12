export type StatusFilter = "all" | "active" | "out_of_range" | "closed";
export type SortKey = "net_pnl" | "fees" | "il" | "value" | "newest" | "oldest";

interface Props {
    total: number;
    activeCnt: number;
    outOfRangeCnt: number;
    closedCnt: number;
    status: StatusFilter;
    sortKey: SortKey;
    sortDesc: boolean;
    onStatus: (s: StatusFilter) => void;
    onSort: (k: SortKey) => void;
    onSortDir: () => void;
}

const TABS: Array<{ key: StatusFilter; label: string }> = [
    { key: "all", label: "ALL" },
    { key: "active", label: "ACTIVE" },
    { key: "out_of_range", label: "OUT OF RANGE" },
    { key: "closed", label: "CLOSED" },
];

const SORTS: Array<{ key: SortKey; label: string }> = [
    { key: "net_pnl", label: "NET P&L" },
    { key: "fees", label: "FEES" },
    { key: "il", label: "IL COST" },
    { key: "value", label: "VALUE" },
    { key: "newest", label: "NEWEST" },
    { key: "oldest", label: "OLDEST" },
];

export function LPFiltersBar({
    total,
    activeCnt,
    outOfRangeCnt,
    closedCnt,
    status,
    sortKey,
    sortDesc,
    onStatus,
    onSort,
    onSortDir,
}: Props) {
    const counts: Record<StatusFilter, number> = {
        all: total,
        active: activeCnt,
        out_of_range: outOfRangeCnt,
        closed: closedCnt,
    };

    return (
        <div className="lp-filters-bar">
            <div className="lp-filters-tabs">
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        className={`lp-filter-tab${status === t.key ? " lp-filter-tab--active" : ""}`}
                        onClick={() => onStatus(t.key)}
                    >
                        {t.label}
                        {counts[t.key] > 0 && <span className="lp-filter-count">{counts[t.key]}</span>}
                    </button>
                ))}
            </div>
            <div className="lp-filters-sort">
                <span className="lp-sort-label">SORT</span>
                <select className="lp-sort-select" value={sortKey} onChange={(e) => onSort(e.target.value as SortKey)}>
                    {SORTS.map((s) => (
                        <option key={s.key} value={s.key}>
                            {s.label}
                        </option>
                    ))}
                </select>
                <button
                    className="lp-sort-dir-btn"
                    onClick={onSortDir}
                    title={sortDesc ? "Descending — click for ascending" : "Ascending — click for descending"}
                >
                    {sortDesc ? "↓" : "↑"}
                </button>
            </div>
        </div>
    );
}
