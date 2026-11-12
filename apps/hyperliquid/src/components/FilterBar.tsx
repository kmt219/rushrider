import { SUBCATEGORIES } from "../constants";
import type { Filters } from "../types";
import { Search } from "lucide-react";
import { useMemo } from "react";

interface FilterBarProps {
    filters: Filters;
    onFiltersChange: (filters: Filters) => void;
    onOpenCommandPalette?: () => void;
    dynamicBuilders?: string[];
    hip3Dexes?: string[];
    activeCats?: Set<string>;
}

// Canonical order for the "All" tab dynamic pills — broad market-class labels
const ALL_TAB_ORDER = [
    "L1/L2",
    "DeFi",
    "Meme",
    "AI",
    "Gaming",
    "RWA",
    "Bridge",
    "Spot",
    "Commodities",
    "Stocks",
    "Indices",
    "FX",
    "Pre-IPO",
    "Pre-launch",
];

export function FilterBar({
    filters,
    onFiltersChange,
    onOpenCommandPalette,
    dynamicBuilders = [],
    hip3Dexes = [],
    activeCats,
}: FilterBarProps) {
    const pt = filters.primaryTab;

    // Determine the base subcategory list for this tab, then filter to active categories.
    // Memoized so the branching + spread work only reruns when the tab or active cats change.
    const subcats = useMemo(() => {
        let baseSubcats: string[];
        if (pt === "HIP-3") {
            // Dynamic dex names from actual loaded markets
            baseSubcats = hip3Dexes;
        } else if (pt === "All") {
            baseSubcats = [];
        } else if (pt === "Trending" || pt === "Outcome") {
            // Derive from activeCats, sorted by canonical order then alphabetically
            if (activeCats && activeCats.size > 0) {
                const ordered = ALL_TAB_ORDER.filter((c) => activeCats.has(c));
                const rest = [...activeCats].filter((c) => !ALL_TAB_ORDER.includes(c)).sort();
                baseSubcats = ["All", ...ordered, ...rest];
            } else {
                baseSubcats = [];
            }
        } else {
            baseSubcats = [...(SUBCATEGORIES[pt] ?? [])];
            // Ensure "All" is always the first pill when there are subcategory options
            if (baseSubcats.length > 0 && baseSubcats[0] !== "All") {
                baseSubcats = ["All", ...baseSubcats];
            }
        }

        // Hide pills that yield no results in the current tab (except "All" which always shows).
        // Spot tab always shows all defined quote-currency pills (USDC/USDH/USDT) regardless
        // of activeCats — these are fixed known quote currencies on HL, not dynamic categories.
        // Clicking a pill with no matching markets simply shows an empty list (correct UX).
        return pt === "Spot" || !activeCats ? baseSubcats : baseSubcats.filter((s) => s === "All" || activeCats.has(s));
    }, [pt, activeCats, hip3Dexes]);

    const toggleSubcategory = (sub: string) => {
        if (sub === "All") {
            onFiltersChange({ ...filters, subcategories: [] });
        } else {
            // Single-select: clicking the active sub deselects it (→ All), clicking another switches to it
            const isActive = filters.subcategories.length === 1 && filters.subcategories[0] === sub;
            onFiltersChange({ ...filters, subcategories: isActive ? [] : [sub] });
        }
    };

    const setBuilder = (builder: string) => {
        onFiltersChange({ ...filters, builders: builder ? [builder] : [] });
    };

    // On the HIP-3 tab, dex selection is handled by the subcategory pills — hide the builder
    // dropdown to avoid the two controls conflicting (both filter on m.builder).
    // Also hide when there are no non-default builders in the current tab (e.g. Trending).
    const showBuilderDropdown = pt !== "HIP-3" && dynamicBuilders.length > 0;

    return (
        <div className="filter-bar">
            {/* Subcategory pills (when tab has them) */}
            {subcats.length > 0 && (
                <>
                    <div className="filter-pills">
                        {subcats.map((sub) => {
                            const isActive =
                                sub === "All"
                                    ? filters.subcategories.length === 0
                                    : filters.subcategories.length === 1 && filters.subcategories[0] === sub;
                            return (
                                <button
                                    key={sub}
                                    className={`filter-pill ${isActive ? "filter-pill--active" : ""}`}
                                    onClick={() => toggleSubcategory(sub)}
                                >
                                    {sub}
                                </button>
                            );
                        })}
                    </div>
                    <div className="filter-divider" />
                </>
            )}
            <div className="filter-search-wrap" onClick={onOpenCommandPalette}>
                <Search size={12} className="filter-search-icon" />
                <span className="filter-search-placeholder">Search markets...</span>
                <kbd className="filter-search-kbd">⌘K</kbd>
            </div>
            {showBuilderDropdown && (
                <>
                    <div className="filter-divider" />
                    <select
                        className="filter-select"
                        value={filters.builders[0] ?? ""}
                        onChange={(e) => setBuilder(e.target.value)}
                    >
                        <option value="">All Builders</option>
                        {dynamicBuilders.map((b) => (
                            <option key={b} value={b}>
                                {b}
                            </option>
                        ))}
                    </select>
                </>
            )}
            <div className="filter-divider" />
            <label className="filter-label">Min Vol:</label>
            <select
                className="filter-select"
                value={filters.minVolume}
                onChange={(e) => onFiltersChange({ ...filters, minVolume: Number(e.target.value) })}
            >
                <option value={0}>Any</option>
                <option value={100000}>$100K</option>
                <option value={500000}>$500K</option>
                <option value={1000000}>$1M</option>
                <option value={5000000}>$5M</option>
            </select>
        </div>
    );
}
