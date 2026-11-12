import { DetailSkeleton } from "./components/DetailSkeleton";
import { ExtensionSlot } from "./components/ExtensionSlot";
import { FilterBar } from "./components/FilterBar";
import { Header } from "./components/Header";
import { ScreenerTable } from "./components/ScreenerTable";
import { StatusBar } from "./components/StatusBar";
import { TapeTicker } from "./components/TapeTicker";
import { WorldClock } from "./components/WorldClock";
import { getMarketAlias } from "./constants";
import { useGoldRushClient } from "./context/GoldRushContext";
import { useNodeStreamContext } from "./context/NodeStreamContext";
import { useMarkets } from "./hooks/useMarkets";
import type { Filters, SortConfig, HIP3Market, PrimaryTab } from "./types";
import { formatPrice } from "./utils/format";
import React, { useState, useCallback, useEffect, useMemo, lazy, Suspense } from "react";

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: "2rem", color: "var(--color-text-muted, #888)" }}>
                    Something went wrong loading this panel.
                </div>
            );
        }
        return this.props.children;
    }
}

const CommandPalette = lazy(() => import("./components/CommandPalette").then((m) => ({ default: m.CommandPalette })));
const DetailView = lazy(() => import("./components/DetailView").then((m) => ({ default: m.DetailView })));
const LiveTV = lazy(() => import("./components/LiveTV").then((m) => ({ default: m.LiveTV })));
const SectorHeatmap = lazy(() => import("./components/SectorHeatmap").then((m) => ({ default: m.SectorHeatmap })));

export function App() {
    const nodeStream = useNodeStreamContext();
    const goldRush = useGoldRushClient();
    const {
        markets,
        loading,
        error,
        blockNumber,
        perpMarkets,
        spotMarkets,
        tradfiMarkets,
        hip3Markets,
        hip4Markets,
        preLaunchMarkets,
    } = useMarkets();

    const [selectedCoin, setSelectedCoin] = useState<string | null>(() => {
        const hash = window.location.hash.slice(1);
        if (!hash) return null;
        return decodeURIComponent(hash);
    });
    const [sortConfig, setSortConfig] = useState<SortConfig>({ field: "volume24h", direction: "desc" });
    const [filters, setFilters] = useState<Filters>({
        search: "",
        builders: [],
        subcategories: [],
        minVolume: 0,
        primaryTab: "All",
    });
    const [cmdkOpen, setCmdkOpen] = useState(false);
    const [favorites, setFavorites] = useState<Set<string>>(() => {
        try {
            const stored = localStorage.getItem("hl-favorites");
            return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
        } catch {
            return new Set();
        }
    });

    const selectedMarket = selectedCoin ? (markets.find((m) => m.coin === selectedCoin) ?? null) : null;

    // Auto-select highest-volume perp when markets load and nothing is selected
    useEffect(() => {
        if (markets.length > 0 && !selectedCoin) {
            const topPerp = [...markets]
                .filter((m) => m.type === "perp" && m.volume24h > 0)
                .sort((a, b) => b.volume24h - a.volume24h)[0];
            const coin = topPerp?.coin ?? markets[0]!.coin;
            setSelectedCoin(coin);
            const slug = coin.startsWith("#") ? coin : `#${coin}`;
            window.history.replaceState(null, "", slug);
        }
    }, [markets, selectedCoin]);

    // Keep page title in sync with selected market + live price
    useEffect(() => {
        if (selectedMarket) {
            const rawCoin = selectedMarket.coin.includes(":")
                ? (selectedMarket.coin.split(":")[1] ?? selectedMarket.coin)
                : selectedMarket.coin;
            const displayLabel =
                selectedMarket.marketClass === "hip-4"
                    ? selectedMarket.name
                    : selectedMarket.type === "spot"
                      ? rawCoin
                      : `${rawCoin}-${selectedMarket.quoteToken}`;

            document.title = `${formatPrice(selectedMarket.markPx)} ${displayLabel} — Hyperliquid Market Screener`;
        }
    }, [selectedMarket]);

    // Sync selection from browser back/forward navigation
    useEffect(() => {
        const onHashChange = () => {
            const hash = window.location.hash.slice(1);
            if (!hash) return;
            const decoded = decodeURIComponent(hash);
            // Outcome markets use '#' prefix (e.g. #20). If the hash is "20",
            // we should try to match against "#20" too.
            if (markets.length > 0) {
                const found = markets.find((m) => m.coin === decoded || m.coin === `#${decoded}`);
                if (found) {
                    setSelectedCoin(found.coin);
                    return;
                }
            }
            setSelectedCoin(decoded);
        };
        window.addEventListener("hashchange", onHashChange);
        return () => window.removeEventListener("hashchange", onHashChange);
    }, [markets]);

    const handleSort = useCallback((field: SortConfig["field"]) => {
        setSortConfig((prev) => ({
            field,
            direction: prev.field === field && prev.direction === "desc" ? "asc" : "desc",
        }));
    }, []);

    const handleSelectMarket = useCallback((market: HIP3Market) => {
        setSelectedCoin(market.coin);
        const slug = market.coin.startsWith("#") ? market.coin : `#${market.coin}`;
        window.history.replaceState(null, "", slug);
    }, []);

    const handlePrimaryTabChange = useCallback((tab: PrimaryTab) => {
        setFilters((prev) => ({ ...prev, primaryTab: tab, subcategories: [], builders: [] }));
        // Trending tab default sort = biggest movers (24h change desc)
        if (tab === "Trending") {
            setSortConfig({ field: "change24h", direction: "desc" });
        } else {
            // Reset to volume sort on other tabs
            setSortConfig({ field: "volume24h", direction: "desc" });
        }
    }, []);

    const handleToggleFavorite = useCallback((coin: string) => {
        setFavorites((prev) => {
            const next = new Set(prev);
            if (next.has(coin)) next.delete(coin);
            else next.add(coin);
            localStorage.setItem("hl-favorites", JSON.stringify([...next]));
            return next;
        });
    }, []);

    // ⌘K / Ctrl+K to open command palette
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                setCmdkOpen((prev) => !prev);
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, []);

    // Select the pre-classified sub-array for the active tab.
    // No runtime filter on marketClass — data is separated at the API boundary in
    // useHyperliquidMeta, so this is a direct array lookup, not a filter.
    const tabMarkets = useMemo(() => {
        const pt = filters.primaryTab;
        let result: typeof markets;
        if (pt === "Perps") result = perpMarkets;
        else if (pt === "Spot") result = spotMarkets;
        else if (pt === "Crypto") result = perpMarkets;
        else if (pt === "Tradfi") result = tradfiMarkets;
        else if (pt === "HIP-3") result = hip3Markets;
        else if (pt === "Outcome") result = hip4Markets;
        else if (pt === "Trending")
            // Perps + tradfi only: spot, hip-3, hip-4, and pre-launch markets have no OI/funding/
            // basis/spread so every column on the right side of the screener table shows "—".
            // Builder-dex tradfi markets (marketClass="tradfi", builder≠"Hyperliquid") appear
            // in both tradfiMarkets and hip3Markets — filtering on the flat array avoids duplication.
            result = markets.filter(
                (m) =>
                    m.marketClass !== "pre-launch" &&
                    m.marketClass !== "hip-3" &&
                    m.marketClass !== "hip-4" &&
                    m.marketClass !== "spot"
            );
        else if (pt === "Pre-launch") result = preLaunchMarkets;
        else result = markets;

        return result;
    }, [
        filters.primaryTab,
        markets,
        perpMarkets,
        spotMarkets,
        tradfiMarkets,
        hip3Markets,
        hip4Markets,
        preLaunchMarkets,
    ]);

    // Builders that actually exist in the current tab (excludes Hyperliquid — the default)
    const dynamicBuilders = useMemo(() => {
        const seen = new Set<string>();
        for (const m of tabMarkets) {
            if (m.builder && m.builder !== "Hyperliquid") seen.add(m.builder);
        }
        return [...seen].sort();
    }, [tabMarkets]);

    // HIP-3 dex names from actual loaded markets for the HIP-3 tab
    const hip3Dexes = useMemo(() => {
        const seen = new Set<string>();
        for (const m of tabMarkets) {
            if (m.builder) seen.add(m.builder);
        }
        return ["All", ...seen].sort((a, b) => (a === "All" ? -1 : b === "All" ? 1 : a.localeCompare(b)));
    }, [tabMarkets]);

    // Subcategory pills that have at least one market in the current tab.
    // HIP-3 tab subcats are dex names (m.builder); all other tabs use m.category.
    const activeCats = useMemo(() => {
        const seen = new Set<string>();
        const useBuilder = filters.primaryTab === "HIP-3";
        const useQuote = filters.primaryTab === "Spot";
        for (const m of tabMarkets)
            seen.add(useBuilder ? m.builder : useQuote ? (m.quoteAsset ?? m.category) : m.category);
        return seen;
    }, [tabMarkets, filters.primaryTab]);

    // Filter + sort — operates on tabMarkets (already tab-isolated) and applies only
    // subcategory / builder / search / minVolume secondary filters.
    const filteredMarkets = useMemo(() => {
        return tabMarkets
            .filter((m) => {
                const pt = filters.primaryTab;

                // Subcategory filtering (single-select: 0 = All, 1 = specific subcat)
                if (filters.subcategories.length === 1) {
                    const activeSub = filters.subcategories[0]!;
                    // Spot tab pills filter by quote currency (USDC/USDH/USDT), not semantic category
                    const subKey =
                        pt === "HIP-3" ? m.builder : pt === "Spot" ? (m.quoteAsset ?? m.category) : m.category;
                    if (subKey !== activeSub) return false;
                }

                // Builder filter
                if (filters.builders.length > 0 && !filters.builders.includes(m.builder)) return false;

                // Search (includes human-readable alias, e.g. "crude" → BRENTOIL)
                if (filters.search) {
                    const q = filters.search.toLowerCase();
                    const alias = getMarketAlias(m.coin) ?? "";
                    if (
                        !m.coin.toLowerCase().includes(q) &&
                        !m.name.toLowerCase().includes(q) &&
                        !alias.toLowerCase().includes(q)
                    )
                        return false;
                }

                // Min volume
                if (filters.minVolume > 0 && m.volume24h < filters.minVolume) return false;

                return true;
            })
            .sort((a, b) => {
                // Primary: group by market class so data-rich markets (perps, tradfi)
                // always appear above data-sparse ones (spots, hip-3, pre-launch).
                // This prevents spot rows — which have no OI/basis/spread — from
                // scattering through the list just because their volume overlaps perps.
                // This is a no-op on single-class tabs (Perps, Spot, etc.) since all
                // markets in those tabs share the same rank.
                const classRank = (mc: string) =>
                    mc === "perp" || mc === "tradfi" ? 0 : mc === "hip-3" ? 1 : mc === "spot" ? 2 : 3;
                const rankDiff = classRank(a.marketClass) - classRank(b.marketClass);
                if (rankDiff !== 0) return rankDiff;
                // Secondary: sort by configured field within each class group
                const dir = sortConfig.direction === "asc" ? 1 : -1;
                const av = a[sortConfig.field];
                const bv = b[sortConfig.field];
                if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
                return ((av as number) - (bv as number)) * dir;
            });
    }, [tabMarkets, filters, sortConfig]);

    // Tape is always sourced from ALL markets (not the active tab) so switching
    // tabs doesn't change what's scrolling in the top marquee.
    const tapeMarkets = useMemo(
        () =>
            [...markets]
                .filter((m) => m.markPx > 0)
                .sort((a, b) => b.volume24h - a.volume24h)
                .slice(0, 80),
        [markets]
    );
    const totalVolume = useMemo(() => tabMarkets.reduce((s, m) => s + m.volume24h, 0), [tabMarkets]);
    const liveCount = useMemo(() => tabMarkets.filter((m) => m.markPx > 0).length, [tabMarkets]);

    return (
        <div className="app">
            <TapeTicker markets={tapeMarkets} />
            <Header
                marketCount={tabMarkets.length}
                liveCount={liveCount}
                selectedMarket={selectedMarket}
                totalVolume24h={totalVolume}
                filters={filters}
                onPrimaryTabChange={handlePrimaryTabChange}
            />
            <div className="main-content">
                {/* Column 1: Markets table */}
                <div className="col-table">
                    <FilterBar
                        filters={filters}
                        onFiltersChange={setFilters}
                        onOpenCommandPalette={() => setCmdkOpen(true)}
                        dynamicBuilders={dynamicBuilders}
                        hip3Dexes={hip3Dexes}
                        activeCats={activeCats}
                    />
                    {error && markets.length === 0 && (
                        <div className="api-error-banner">API unavailable — retrying&hellip;</div>
                    )}
                    <ScreenerTable
                        markets={filteredMarkets}
                        loading={loading || (Boolean(error) && markets.length === 0)}
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        selectedCoin={selectedCoin}
                        onSelectMarket={handleSelectMarket}
                        primaryTab={filters.primaryTab}
                    />
                </div>

                {/* Column 2: Detail view */}
                <div className="col-detail">
                    {selectedMarket ? (
                        <AppErrorBoundary>
                            <Suspense fallback={<DetailSkeleton />}>
                                <DetailView key={selectedCoin} market={selectedMarket} />
                            </Suspense>
                        </AppErrorBoundary>
                    ) : loading ? (
                        <DetailSkeleton />
                    ) : (
                        <div className="col-empty-state">
                            <div className="col-empty-state-text">Select a market</div>
                        </div>
                    )}
                </div>

                {/* Column 3: Right panel */}
                <div className="col-right">
                    <div className="col-sidebar">
                        <WorldClock />
                        <AppErrorBoundary>
                            <Suspense fallback={null}>
                                <SectorHeatmap markets={tabMarkets} />
                            </Suspense>
                        </AppErrorBoundary>
                    </div>
                    <AppErrorBoundary>
                        <Suspense fallback={null}>
                            <LiveTV />
                        </Suspense>
                    </AppErrorBoundary>
                </div>
            </div>
            <ExtensionSlot />
            <StatusBar
                marketCount={markets.length}
                blockNumber={blockNumber}
                nodeStreamStatus={nodeStream.status}
                nodeLatencyMs={nodeStream.latencyMs}
                goldRushStatus={goldRush.status}
            />
            <AppErrorBoundary>
                <Suspense fallback={null}>
                    <CommandPalette
                        open={cmdkOpen}
                        onOpenChange={setCmdkOpen}
                        markets={markets}
                        favorites={favorites}
                        onToggleFavorite={handleToggleFavorite}
                        onSelectMarket={handleSelectMarket}
                        onPrimaryTabChange={handlePrimaryTabChange}
                    />
                </Suspense>
            </AppErrorBoundary>
        </div>
    );
}
