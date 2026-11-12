import { ClusterCard } from "./components/ClusterCard";
import { ConcentrationBadge } from "./components/ConcentrationBadge";
import { HolderActivityFeed } from "./components/HolderActivityFeed";
import { HolderAlerts } from "./components/HolderAlerts";
import { HolderMap } from "./components/HolderMap";
import { PairDetailDrawer } from "./components/PairDetailDrawer";
import { PriceDisplay } from "./components/PriceDisplay";
import { SafetyAlertsOverlay } from "./components/SafetyAlert";
import type { SafetyAlertData } from "./components/SafetyAlert";
import { SafetyBadge } from "./components/SafetyBadge";
import { SafetyScoreModal } from "./components/SafetyScoreModal";
import { WalletFlyout } from "./components/WalletFlyout";
import { useAllSpotPrices } from "./hooks/useAllSpotPrices";
import { useAppsLive24h } from "./hooks/useAppsLive24h";
import { useETHPrice } from "./hooks/useETHPrice";
import { useFeeVolume24h } from "./hooks/useFeeVolume24h";
import { useGlobalTxStream } from "./hooks/useGlobalTxStream";
import { useHolderAlerts } from "./hooks/useHolderAlerts";
import { useHolderConcentration } from "./hooks/useHolderConcentration";
import { useHolderMap } from "./hooks/useHolderMap";
import { useHolderStream } from "./hooks/useHolderStream";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useNewPairsStream } from "./hooks/useNewPairsStream";
import { useOHLCVStream, prefetchOHLCV } from "./hooks/useOHLCVStream";
import { useSafetyScore, prefetchSafetyScore, pushTimelineEvent, clearSafetyCache } from "./hooks/useSafetyScore";
import { useTokenSearch } from "./hooks/useTokenSearch";
import { useUSDMSupply } from "./hooks/useUSDMSupply";
import { useUpdatePairsStream } from "./hooks/useUpdatePairsStream";
import { useWalletCluster } from "./hooks/useWalletCluster";
import { useWalletStream } from "./hooks/useWalletStream";
import { getChainCaps } from "./lib/chainCaps";
import { SUPPORTED_CHAINS, DEFAULT_CHAIN_GQL, getChainByGql, getChainBySlug } from "./lib/chains";
import { setPageMeta, resetPageMeta } from "./lib/pageMeta";
import { recordLiquidityUpdate, getLiquidityDrop, clearLiquidityHistory } from "./scoring/liquiditySignal";
import type {
    GemTimeframe,
    NewPairData,
    OHLCVCandle,
    Pair,
    PriceSnapshot,
    TxData,
    UpdatePairData,
    GemTab,
    WhaleTx,
    TokenSearchResult,
    HolderEvent,
} from "./types";
import { formatUSD, getTimeAgo, getExplorerUrl, shortenAddress, exportData, exportOHLCV } from "./utils";
import { LightweightChart, copyToClipboard } from "@goldrush-demos/shared-ui";
import { ethers } from "ethers";
import {
    Anchor,
    ArrowLeftRight,
    ArrowUpDown,
    ChartCandlestick,
    Check,
    Copy,
    Download,
    ExternalLink,
    Globe,
    Info,
    Keyboard,
    Link2,
    Send,
    ShieldCheck,
    Sparkles,
    Star,
    TrendingDown,
    TrendingUp,
    Upload,
    Layers,
    Zap,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState, useEffect, lazy, Suspense } from "react";
import { useParams, useNavigate } from "react-router-dom";

const CommandPalette = lazy(() => import("./components/CommandPalette").then((m) => ({ default: m.CommandPalette })));
const KeyboardShortcutsDialog = lazy(() =>
    import("./components/KeyboardShortcutsDialog").then((m) => ({ default: m.KeyboardShortcutsDialog }))
);
const LPPanel = lazy(() => import("./components/lp/LPPanel").then((m) => ({ default: m.LPPanel })));

const WHALE_TYPE_ICONS: Record<string, typeof Send> = {
    transfer: Send,
    swap: ArrowLeftRight,
    bridge: Link2,
    deposit: Download,
    withdraw: Upload,
    approve: ShieldCheck,
};

const GEM_TABS: { key: GemTab; label: string; Icon: typeof Sparkles; tooltip: string }[] = [
    {
        key: "new",
        label: "NEW",
        Icon: Star,
        tooltip: "Pairs launched within the timeframe. Sorted by block timestamp.",
    },
    {
        key: "momentum",
        label: "MOMENTUM",
        Icon: Sparkles,
        tooltip: "Most active pairs sorted by swap activity / volume.",
    },
    {
        key: "gainers",
        label: "GAINERS",
        Icon: TrendingUp,
        tooltip: "Pairs with the highest price increase.",
    },
    {
        key: "losers",
        label: "LOSERS",
        Icon: TrendingDown,
        tooltip: "Pairs with the largest price drop.",
    },
    {
        key: "spikes",
        label: "SPIKES",
        Icon: Zap,
        tooltip: "Pairs with the largest absolute price movement (up or down).",
    },
];

interface MetricsDisplay {
    avgLatency: number;
    throughput: string;
    barWidth: number;
    showSubLabel: boolean;
    speedup: string;
    uptime: string;
    liveUpdates: number;
    ohlcvPoints: number;
    whaleCount: number;
    avgGas: number;
    networkTps: string;
}

type SortOption = "txCount" | "age" | "token" | "dex" | "liquidity" | "marketCap" | "price";

// Must be module-level so each entry is a stable object reference —
// if declared inside the component the object identity changes every render,
// which would make forcedInterval a new value each cycle and cause the
// useOHLCVStream effect to re-subscribe on every render (endless loading).
// Confirmed valid intervals (docs): ONE_SECOND, ONE_MINUTE, ONE_HOUR
// Confirmed valid timeframes (docs): ONE_MINUTE, FIFTEEN_MINUTES, ONE_HOUR, ONE_DAY
const CHART_INTERVAL_CONFIGS: Record<string, { interval: string; timeframe: string; label: string }> = {
    "1S": { interval: "ONE_SECOND", timeframe: "ONE_MINUTE", label: "1s/1m" },
    "15M": { interval: "ONE_MINUTE", timeframe: "FIFTEEN_MINUTES", label: "1m/15m" },
    "1M": { interval: "ONE_MINUTE", timeframe: "ONE_HOUR", label: "1m/1h" },
    "1H": { interval: "ONE_HOUR", timeframe: "ONE_DAY", label: "1h/1d" },
};
// Reverse: resolved config label → button key (strip "[T]" token-query suffix)
const CONFIG_LABEL_TO_TF: Record<string, string> = Object.fromEntries(
    Object.entries(CHART_INTERVAL_CONFIGS).map(([tf, cfg]) => [cfg.label, tf])
);

// Gap 14 fix: pure helpers at module scope — allocated once, not per-render.

function formatSupply(val: number): string {
    if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(2)}B`;
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
    return val.toLocaleString();
}

function formatMetricOrPending(value: number | null | undefined): string {
    if (value == null || isNaN(value)) return "—";
    if (value === 0) return "—";
    // Sanity cap: values above $10T are almost certainly raw-supply bugs (e.g. wei not divided by decimals).
    if (value > 1e13) return "—";
    return formatUSD(value);
}

function getEmptyTabLabel(tab: GemTab, timeframe: GemTimeframe): string {
    switch (tab) {
        case "new":
            return "WAITING FOR NEW PAIRS...";
        case "gainers":
        case "losers":
        case "momentum":
        case "spikes":
            return `NO ${tab.toUpperCase()} IN LAST ${timeframe.toUpperCase()}`;
    }
}

/**
 * Buckets raw price ticks (from updatePairs stream) into OHLCV candles.
 * This is the same "virtual candles" approach used by DexScreener — always
 * renders a real chart from live price data even when the OHLCV stream has
 * no history yet (e.g. brand-new pair or chain without OHLCV indexing).
 *
 * bucketMs — width of each candle in milliseconds (auto-computed by caller).
 */
function buildCandlesFromTicks(ticks: PriceSnapshot[], bucketMs: number): OHLCVCandle[] {
    if (ticks.length < 2) return [];
    const buckets = new Map<number, { open: number; high: number; low: number; close: number }>();
    for (const tick of ticks) {
        const slot = Math.floor(tick.timestamp / bucketMs) * bucketMs;
        const b = buckets.get(slot);
        if (!b) {
            buckets.set(slot, { open: tick.price, high: tick.price, low: tick.price, close: tick.price });
        } else {
            if (tick.price > b.high) b.high = tick.price;
            if (tick.price < b.low) b.low = tick.price;
            b.close = tick.price;
        }
    }
    return [...buckets.entries()]
        .sort(([a], [b]) => a - b)
        .map(([ts, c]) => ({
            timestamp: new Date(ts).toISOString(),
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: 0,
        }));
}

// Gap 13 fix: module-scope constants — created once, never recreated on re-render.
const WHALE_ACTIVITY_TYPES = new Set(["TRANSFER", "SWAP", "BRIDGE", "DEPOSIT", "WITHDRAW", "APPROVE"]);

function extractUsdValue(
    tx: TxData,
    ethPriceUsd: number,
    nativeCurrency = "ETH"
): { usdValue: number; type: string; token: string } | null {
    // decoded_details is intentionally excluded from all walletTxs queries —
    // MegaETH does not support ABI-decoded fields on that subscription.
    // Derive classification from decoded_type and USD from the native tx value
    // (wei string), which IS returned by the wallet stream.
    const txType = (tx.decoded_type || "").toUpperCase();

    // Estimate USD from the native ETH amount carried by this tx.
    // ERC-20 ↔ ERC-20 swaps move no native ETH so this will be 0 for those.
    let usdValue = 0;
    try {
        const valueWei = BigInt(tx.value || "0");
        if (valueWei > 0n && ethPriceUsd > 0) {
            usdValue = Number(ethers.formatEther(valueWei)) * ethPriceUsd;
        }
    } catch {
        // malformed or missing value field — treat as zero
    }

    // Always surface DEX swaps: they are the primary signal on a DEX dashboard
    // and carry no native ETH value (so usdValue stays 0, shown as "SWAP").
    if (txType === "SWAP") {
        return { usdValue, type: "swap", token: "TOKEN" };
    }

    // Surface other classified activity (transfer, bridge, etc.) only when a
    // non-trivial ETH value is present.
    if (usdValue > 0 && WHALE_ACTIVITY_TYPES.has(txType)) {
        return { usdValue, type: txType.toLowerCase(), token: nativeCurrency };
    }

    return null;
}

// Per-pair safety badge that calls useSafetyScore as a proper React component.
// Hooks cannot be called inside .map() — this wrapper makes each invocation valid.
function SafetyBadgeRow({
    pairData,
    chainName,
    metrics,
    isWatched,
    onAlert,
    onOpen,
}: {
    pairData: NewPairData;
    chainName: string;
    metrics: import("./types").PairMetrics | null | undefined;
    isWatched: boolean;
    onAlert: (a: SafetyAlertData) => void;
    onOpen: () => void;
}) {
    // eager=false: badges never fire REST calls — they show cached data only.
    // REST scoring happens when SafetyDetailPanel opens (eager=true default).
    const score = useSafetyScore(pairData, chainName, metrics, false);
    // Start at 100 so first-compute below 30 fires the alert (not just score drops)
    const prevTotalRef = useRef(100);
    useEffect(() => {
        if (score.riskLevel === "LOADING") return;
        const prev = prevTotalRef.current;
        prevTotalRef.current = score.total;
        if (isWatched && prev >= 30 && score.total < 30) {
            const weakest = Object.entries(score.signals)
                .filter(([, s]) => !s.loading)
                .sort(([, a], [, b]) => a.score - b.score)
                .slice(0, 2)
                .map(([, s]) => `${s.label} ${s.score}/20`)
                .join(", ");
            onAlert({
                id: `${pairData.pair_address}-${Date.now()}`,
                pairAddress: pairData.pair_address,
                pairLabel: `${pairData.base_token?.contract_ticker_symbol ?? "?"}/${pairData.quote_token?.contract_ticker_symbol ?? "?"}`,
                message: `Score ${score.total}/100 — Weakest: ${weakest || "scoring…"}`,
                score: score.total,
            });
        }
    }, [score.total, score.riskLevel, isWatched]);
    return <SafetyBadge score={score} onClick={onOpen} />;
}

/**
 * Per-pair HHI concentration badge. Calls useHolderConcentration as a proper
 * React component so hooks are never called inside .map().
 */
function ConcentrationBadgeRow({
    tokenAddress,
    chainName,
}: {
    tokenAddress: string | null | undefined;
    chainName: string;
}) {
    const data = useHolderConcentration(chainName, tokenAddress ?? null);
    if (!tokenAddress) return null;
    if (!data) return <span className="hhi-badge hhi-badge--loading">…</span>;
    return <ConcentrationBadge hhi={data.hhi} tier={data.tier} />;
}

/**
 * HolderMapPanel — coordinates all Phase 2-4 holder intelligence hooks.
 * useHolderMap is lifted here so useHolderStream + useWalletCluster can share it.
 * HolderMap is purely presentational — it receives holderMapState as a prop.
 */
function HolderMapPanel({
    tokenAddress,
    chainName,
    apiKey,
    streamUrl,
}: {
    tokenAddress: string | null | undefined;
    chainName: string;
    apiKey: string;
    streamUrl: string;
}) {
    const data = useHolderConcentration(chainName, tokenAddress ?? null);

    // Simulate container dims for useHolderMap — the map will observe its real dims
    const [dims, setDims] = useState({ w: 0, h: 300 });
    const holderMapState = useHolderMap(data ?? null, dims.w, dims.h);
    const { applyClusterAssignments, triggerPulse, updateBalance } = holderMapState;

    // Phase 3: Cluster X-Ray
    const { clusters, edges } = useWalletCluster(chainName, tokenAddress, data?.holderItems ?? []);

    // Apply cluster assignments to bubble nodes when clusters resolve
    useEffect(() => {
        if (clusters.length > 0) applyClusterAssignments(clusters);
    }, [clusters, applyClusterAssignments]);

    // Phase 4: Live holder activity feed
    const [holderEvents, setHolderEvents] = useState<HolderEvent[]>([]);
    const onActivity = useCallback(
        (address: string, type: "buy" | "sell" | "transfer", valueUsd?: number) => {
            triggerPulse(address, type);
            if (type === "buy" || type === "sell") updateBalance(address, type, valueUsd);
            setHolderEvents((prev) => {
                const ev: HolderEvent = {
                    id: `${address}-${Date.now()}`,
                    address,
                    type,
                    receivedAt: Date.now(),
                    txHash: "",
                    valueUsd,
                };
                return [ev, ...prev].slice(0, 30);
            });
        },
        [triggerPulse, updateBalance]
    );
    useHolderStream(apiKey, streamUrl, chainName, data?.holderItems ?? [], onActivity);

    // Phase 4 alerts: threshold-based toast notifications
    const { alerts, dismiss } = useHolderAlerts(data ?? null, clusters, holderEvents);

    // Wallet flyout state
    const [flyoutAddress, setFlyoutAddress] = useState<string | null>(null);

    if (!tokenAddress) {
        return (
            <div className="chart-empty">
                <span className="chart-empty-text">SELECT A PAIR TO VIEW HOLDERS</span>
            </div>
        );
    }
    if (!data) {
        return (
            <div className="chart-empty">
                <span className="chart-loading-spinner" />
                <span className="chart-empty-text">LOADING HOLDERS…</span>
            </div>
        );
    }
    if (data.holderItems.length === 0) {
        const restChain = chainName.replace(/_/g, "-").toLowerCase();
        const msg = getChainCaps(restChain).restApi
            ? "NO HOLDER DATA AVAILABLE"
            : "HOLDER DATA NOT SUPPORTED ON THIS CHAIN";
        return (
            <div className="chart-empty">
                <span className="chart-empty-text">{msg}</span>
            </div>
        );
    }

    const nodes = holderMapState.nodesRef.current;

    return (
        <div className="hmp-root">
            <HolderMap
                data={data}
                holderMapState={holderMapState}
                clusters={clusters}
                edges={edges}
                chainName={chainName}
                onWalletClick={setFlyoutAddress}
                onDimsChange={setDims}
            />
            {clusters.length > 0 && (
                <div className="cluster-cards-list">
                    {clusters.map((c) => (
                        <ClusterCard
                            key={c.id}
                            cluster={c}
                            nodes={nodes}
                            onMemberClick={setFlyoutAddress}
                            chainName={chainName}
                        />
                    ))}
                </div>
            )}
            {holderEvents.length > 0 && <HolderActivityFeed events={holderEvents} nodes={nodes} />}
            <HolderAlerts alerts={alerts} onDismiss={dismiss} />
            {flyoutAddress && (
                <WalletFlyout
                    address={flyoutAddress}
                    chainName={chainName}
                    holderNode={nodes.find((n) => n.address === flyoutAddress)}
                    clusters={clusters}
                    onClose={() => setFlyoutAddress(null)}
                />
            )}
        </div>
    );
}

export default function App({
    apiKey,
    streamUrl,
    apiUrl: _apiUrl,
}: {
    apiKey: string;
    streamUrl: string;
    apiUrl: string;
}) {
    // URL-driven pair + chain selection
    const { chainName: chainNameParam, pairAddress: pairAddressParam } = useParams<{
        chainName: string;
        pairAddress: string;
    }>();
    const navigate = useNavigate();
    const selectedPairAddress = pairAddressParam?.toLowerCase() ?? null;

    // Chain selector state — URL slug takes priority, then localStorage, then default
    const [activeChainGql, setActiveChainGql] = useState<string>(() => {
        if (chainNameParam) {
            const fromUrl = getChainBySlug(chainNameParam);
            if (fromUrl) return fromUrl.gqlName;
        }
        try {
            const saved = localStorage.getItem("dexworks:selectedChain");
            if (saved && SUPPORTED_CHAINS.some((c) => c.gqlName === saved)) return saved;
        } catch {
            /* ignore */
        }
        return DEFAULT_CHAIN_GQL;
    });
    const activeChain = getChainByGql(activeChainGql);
    const chainSlug = activeChain.slug;
    const chainLabel = activeChain.displayName;
    const restChain = activeChain.restName;

    // Persist chain selection + sync URL
    useEffect(() => {
        try {
            localStorage.setItem("dexworks:selectedChain", activeChainGql);
        } catch {
            /* ignore */
        }
        // Keep URL in sync — only push if slug differs from current URL segment
        if (chainNameParam !== chainSlug) {
            navigate(`/${chainSlug}`, { replace: true });
        }
    }, [activeChainGql]);

    // Chain-switch cleanup — flush all module-level and ref-level caches so
    // stale data from the old chain never contaminates the new chain's signals.
    const _isFirstChainRender = useRef(true);
    useEffect(() => {
        if (_isFirstChainRender.current) {
            _isFirstChainRender.current = false;
            return;
        }
        pairMetricsRef.current.clear();
        clearSafetyCache();
        clearLiquidityHistory();
    }, [activeChainGql]);

    const selectPair = useCallback(
        (address: string) => navigate(`/${chainSlug}/${address.toLowerCase()}`),
        [navigate, chainSlug]
    );
    const deselectPair = useCallback(() => navigate(`/${chainSlug}`), [navigate, chainSlug]);

    // Core state
    const [pairs, setPairs] = useState<Pair[]>([]);
    // True while waiting for the first pair data after mount or chain switch.
    // The existing skeleton timeout (4 s for connecting, 800 ms for connected)
    // sets this to false so inactive chains (e.g. Tempo) don't spin forever.
    const [isChainSwitching, setIsChainSwitching] = useState(true);
    const prevChainRef = useRef<string>(activeChainGql);
    const [activeGemTab, setActiveGemTab] = useState<GemTab>("momentum");
    const [chartInterval, setChartInterval] = useState<string | null>(null);
    const [chartView, setChartView] = useState<"chart" | "holders" | "lp">("chart");
    const [selectedTimeframe, setSelectedTimeframe] = useState<GemTimeframe>("24h");
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState<SortOption>("txCount");
    const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
    const [copiedUrl, setCopiedUrl] = useState(false);
    const copiedUrlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [updatedPairs, setUpdatedPairs] = useState<Set<string>>(new Set());
    const [leavingPairs, setLeavingPairs] = useState<Set<string>>(new Set());
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    // Platform detection for keyboard shortcut label
    const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
    const [focusedPairIndex, setFocusedPairIndex] = useState(-1);
    const [detailPairAddress, setDetailPairAddress] = useState<string | null>(null);
    const [safetyPairAddress, setSafetyPairAddress] = useState<string | null>(null);
    const [safetyAlerts, setSafetyAlerts] = useState<SafetyAlertData[]>([]);
    const alertCooldownRef = useRef(new Map<string, number>());
    const handleSafetyAlert = useCallback((alert: SafetyAlertData) => {
        const now = Date.now();
        const lastFired = alertCooldownRef.current.get(alert.pairAddress) ?? 0;
        // Suppress re-fire within 2 minutes of the last alert for this pair
        if (now - lastFired < 2 * 60_000) return;
        alertCooldownRef.current.set(alert.pairAddress, now);
        setSafetyAlerts((prev) => {
            if (prev.some((a) => a.pairAddress === alert.pairAddress)) return prev;
            return [...prev, alert];
        });
    }, []);
    const dismissSafetyAlert = useCallback((id: string) => {
        setSafetyAlerts((prev) => prev.filter((a) => a.id !== id));
    }, []);

    // Live tx-rate snapshot for momentum tab.
    // Stored in a ref so gemsData reads the latest value without needing it in
    // the dependency array — only signalTick (incremented when rates change) forces
    // a memo recompute.
    //
    // Seeded from localStorage on mount so MOMENTUM tab shows cached activity data
    // immediately without waiting for the live tx stream to accumulate events.
    const TX_RATES_CACHE_KEY = `${activeChainGql}:txRates-cache`;
    // GEM_BASELINE_KEY stores raw { price, mcap } snapshots written every 2 s.
    // On the NEXT session load these become the cross-session baseline so GAINERS /
    // LOSERS / SPIKES can instantly compute % change vs "last time the app was open"
    // — the same pattern MOMENTUM uses with TX_RATES_CACHE_KEY.
    const GEM_BASELINE_KEY = `${activeChainGql}:gem-baseline`;
    const MAKERS_CACHE_KEY = `${activeChainGql}:makers-cache`;
    // PCT_CHANGES_CACHE_KEY persists the fully-computed pct-change values so the
    // GAINERS/LOSERS/SPIKES/MOMENTUM tabs are instantly populated on next session load
    // even when the updatePairs stream returns null for pct_change (e.g. MegaETH).
    const PCT_CHANGES_CACHE_KEY = `${activeChainGql}:pct-changes-cache`;
    // GEMS_RESULT_CACHE_KEY persists the computed gem lists (per tab) so the tabs
    // always show data instantly on load even before the live stream arrives.
    const GEMS_RESULT_CACHE_KEY = `${activeChainGql}:gems-result-cache`;
    const TX_RATES_TTL_MS = 6 * 60 * 60 * 1000; // 6 h — matches newPairs + gems cache TTL
    const initialTxRates = useMemo(() => {
        try {
            const raw = localStorage.getItem(TX_RATES_CACHE_KEY);
            if (raw) {
                const { data, ts } = JSON.parse(raw) as { data: [string, number][]; ts: number };
                if (Array.isArray(data) && Date.now() - ts < TX_RATES_TTL_MS) {
                    return new Map<string, number>(data);
                }
            }
        } catch {
            /* ignore */
        }
        return new Map<string, number>();
    }, []);
    // Cross-session baseline: prices/market-caps from the PREVIOUS session.
    // Written every 2 s during the running session; read back on the NEXT session
    // start so pctChange can compute cross-session % change without waiting for
    // the updatePairs stream to detect movement (same instant-load pattern as MOMENTUM).
    const initialGemBaseline = useMemo(() => {
        try {
            const raw = localStorage.getItem(GEM_BASELINE_KEY);
            if (raw) {
                const { data, ts } = JSON.parse(raw) as {
                    data: [string, { price: number; mcap: number }][];
                    ts: number;
                };
                if (Array.isArray(data) && Date.now() - ts < 6 * 60 * 60 * 1000) {
                    return new Map<string, { price: number; mcap: number }>(data);
                }
            }
        } catch {
            /* ignore */
        }
        return new Map<string, { price: number; mcap: number }>();
    }, []);
    const pairTxRatesRef = useRef<Map<string, number>>(initialTxRates);
    // makersRef — unique wallet count per pair, persisted to localStorage every 2 s.
    // Seeded from cache on mount so MAKERS column is populated before any transactions arrive.
    const makersRef = useRef<Map<string, number>>(
        (() => {
            try {
                const raw = localStorage.getItem(MAKERS_CACHE_KEY);
                if (raw) {
                    const { data, ts } = JSON.parse(raw) as { data: [string, number][]; ts: number };
                    if (Array.isArray(data) && Date.now() - ts < TX_RATES_TTL_MS) return new Map<string, number>(data);
                }
            } catch {
                /* ignore */
            }
            return new Map<string, number>();
        })()
    );
    // gemBaselineRef holds the PREVIOUS session's {price, mcap} per pair.
    // It is intentionally NOT updated in memory during the running session so the
    // comparison always reflects cross-session movement (not intra-session noise).
    // The localStorage copy IS written every 2 s so the next session gets fresh data.
    const gemBaselineRef = useRef<Map<string, { price: number; mcap: number }>>(initialGemBaseline);
    // pairPctChangesRef: computed pct-changes written by the 2 s interval, used as
    // an intra-session cache so gemsData doesn't need to rerun the full computation.
    const pairPctChangesRef = useRef<Map<string, { p1h: number | null; p24h: number | null }>>(
        (() => {
            try {
                // Seed from the persisted computed-pct cache (written every 2s during a session).
                // This includes session-computed values (initial vs current price, priceHistory ticks,
                // cross-session baseline) — not just stream_pct_* which are null on many chains.
                const raw = localStorage.getItem(`${activeChainGql}:pct-changes-cache`);
                if (raw) {
                    const { data, ts } = JSON.parse(raw) as {
                        data: [string, { p1h: number | null; p24h: number | null }][];
                        ts: number;
                    };
                    if (Array.isArray(data) && data.length > 0 && Date.now() - ts < 6 * 60 * 60 * 1000) {
                        return new Map<string, { p1h: number | null; p24h: number | null }>(data);
                    }
                }
            } catch {
                /* ignore */
            }
            return new Map<string, { p1h: number | null; p24h: number | null }>();
        })()
    );
    const [signalTick, setSignalTick] = useState(() => {
        // Start at 1 if ANY cached data exists so gemsData computes on the very
        // first render even when the WS stream is down / hasn't connected yet.
        if (initialTxRates.size > 0 || initialGemBaseline.size > 0) return 1;
        try {
            const raw = localStorage.getItem(`${activeChainGql}:newPairs-cache`);
            if (raw) {
                const { data, ts } = JSON.parse(raw) as { data: unknown[]; ts: number };
                if (Array.isArray(data) && data.length > 0 && Date.now() - ts < 6 * 60 * 60 * 1000) return 1;
            }
        } catch {
            /* ignore */
        }
        return 0;
    });

    const handlePaletteOpenChange = useCallback((v: boolean) => {
        if (!v) setSearchQuery("");
        setPaletteOpen(v);
    }, []);

    // Whale transactions state
    const [minLiquidity, setMinLiquidity] = useState<number>(() => {
        try {
            return Number(localStorage.getItem("dexworks:minLiquidity") ?? "0") || 0;
        } catch {
            return 0;
        }
    });
    const [whaleThreshold, setWhaleThreshold] = useState<number>(0);
    const [whaleTxs, setWhaleTxs] = useState<WhaleTx[]>([]);
    const whaleThresholdRef = useRef(whaleThreshold);
    whaleThresholdRef.current = whaleThreshold;
    const selectedPairRef = useRef(selectedPairAddress);
    selectedPairRef.current = selectedPairAddress;

    // Live ETH/USD price — used to convert native-ETH tx values to USD in whale detection.
    const ethPrice = useETHPrice();
    const ethPriceRef = useRef(ethPrice);
    ethPriceRef.current = ethPrice;
    const nativeCurrencyRef = useRef(getChainByGql(activeChainGql).nativeCurrency);
    nativeCurrencyRef.current = getChainByGql(activeChainGql).nativeCurrency;

    // Refs for high-frequency data
    const pairTxsRef = useRef(new Map<string, TxData[]>());
    // O(1) tx deduplication: tracks seen tx_hashes per pair alongside pairTxsRef.
    // Evicts hashes when the 100-item cap pops old entries from pairTxsRef.
    const pairTxHashesRef = useRef(new Map<string, Set<string>>());
    // Batched pair state updates: accumulated per-tx, flushed every 500 ms by the
    // metrics interval.  Eliminates one setPairs re-render per incoming transaction.
    const pendingPairUpdatesRef = useRef(new Map<string, { txCount: number; lastTx: TxData }>());
    const pairMetricsRef = useRef(new Map<string, import("./types").PairMetrics>());
    // Timer refs for cleanup on unmount — prevents state updates on unmounted component.
    const unwatchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const latenciesRef = useRef<number[]>([]);
    const gasUsageRef = useRef<number[]>([]);
    const countersRef = useRef({
        totalMessages: 0,
        liveUpdates: 0,
        whaleCount: 0,
        startTime: null as number | null,
    });
    // KPI data refs
    const kpiDataRef = useRef({
        // Rolling 10-second window of tx arrival timestamps for live TPS
        tpsWindow: [] as number[],
    });

    // KPI display state (synced from refs)
    const [kpiMetrics, setKpiMetrics] = useState({
        usdmSupply: 0,
        feeVolume24h: 0,
        appsLive: 0,
    });

    // Metrics display (synced periodically from refs)
    const [metrics, setMetrics] = useState<MetricsDisplay>({
        avgLatency: 0,
        throughput: "0",
        barWidth: 0,
        showSubLabel: false,
        speedup: "",
        uptime: "--",
        liveUpdates: 0,
        ohlcvPoints: 0,
        whaleCount: 0,
        avgGas: 0,
        networkTps: "0",
    });

    // Clear pending timers on unmount to prevent state updates on a dead component.
    useEffect(() => {
        return () => {
            if (unwatchTimerRef.current) clearTimeout(unwatchTimerRef.current);
            if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
            if (copiedUrlTimerRef.current) clearTimeout(copiedUrlTimerRef.current);
        };
    }, []);

    // Persist liquidity filter preference
    useEffect(() => {
        try {
            localStorage.setItem("dexworks:minLiquidity", String(minLiquidity));
        } catch {
            /* ignore */
        }
    }, [minLiquidity]);

    // Load watched pairs from localStorage on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem(`${activeChainGql}:dexworks-watchlist`);
            if (saved) {
                const loaded: Pair[] = JSON.parse(saved);
                setPairs(loaded);
                // Initialize pairTxsRef and pairTxHashesRef for loaded pairs
                for (const pair of loaded) {
                    pairTxsRef.current.set(pair.pairAddress.toLowerCase(), []);
                    pairTxHashesRef.current.set(pair.pairAddress.toLowerCase(), new Set<string>());
                }
            }
        } catch (err) {
            console.error("Failed to load watchlist from localStorage:", err);
        }
    }, []);

    // Save watched pairs to localStorage — only when address membership changes,
    // not on every txCount/lastTx flush (G4 fix).  Debounced 300 ms for burst imports.
    const lastPersistedKeyRef = useRef<string>("");
    useEffect(() => {
        if (pairs.length === 0) return;
        // Key derived from addresses only — txCount/lastTx changes don't affect it.
        const addressKey = pairs
            .map((p) => p.pairAddress.toLowerCase())
            .sort()
            .join(",");
        if (addressKey === lastPersistedKeyRef.current) return; // no structural change
        lastPersistedKeyRef.current = addressKey;
        const t = setTimeout(() => {
            try {
                localStorage.setItem(`${activeChainGql}:dexworks-watchlist`, JSON.stringify(pairs));
            } catch (err) {
                console.error("Failed to save watchlist to localStorage:", err);
            }
        }, 300);
        return () => clearTimeout(t);
    }, [pairs]);

    // Lifted new pairs state — synchronously seeded from localStorage so signal tabs
    // (gainers/losers/momentum/spikes) are populated on the very first render.
    const [newPairs, setNewPairs] = useState<NewPairData[]>(() => {
        try {
            const raw = localStorage.getItem(`${activeChainGql}:newPairs-cache`);
            if (raw) {
                const { data, ts } = JSON.parse(raw) as { data: NewPairData[]; ts: number };
                if (Array.isArray(data) && data.length > 0 && Date.now() - ts < 6 * 60 * 60 * 1000) {
                    return data;
                }
            }
        } catch {
            /* ignore */
        }
        return [];
    });
    const newPairsRef = useRef(newPairs);
    newPairsRef.current = newPairs;
    // Mirror pairs (watchlist) state in a ref for access from stable callbacks.
    const pairsRef = useRef(pairs);
    pairsRef.current = pairs;
    // Mirror handleSafetyAlert in a ref so handlePairUpdates (stable callback) can call it.
    const safetyAlertRef = useRef(handleSafetyAlert);
    safetyAlertRef.current = handleSafetyAlert;
    // Cooldown map: prevents the same liq-drop alert from re-firing within 5 min.
    // Entries older than 10 min are pruned on each write to prevent unbounded growth.
    const liqAlertCooldownRef = useRef(new Map<string, number>());
    function pruneCooldownMap() {
        const cutoff = Date.now() - 10 * 60_000;
        for (const [k, t] of liqAlertCooldownRef.current) {
            if (t < cutoff) liqAlertCooldownRef.current.delete(k);
        }
    }
    // Tracks which new pairs have already had their "First trade" timeline event pushed.
    const firstTradeTrackedRef = useRef(new Set<string>());
    // Maps deployer address → pair address for real-time deployer activity detection.
    const deployerToPairRef = useRef(new Map<string, string>());
    // Set of new pair addresses for O(1) lookup in handleTransaction.
    // Updated every render so it's always current without needing a separate effect.
    const newPairAddrsRef = useRef<Set<string>>(new Set(newPairs.map((np) => np.pair_address.toLowerCase())));
    newPairAddrsRef.current = new Set(newPairs.map((np) => np.pair_address.toLowerCase()));

    // Keep deployer → pair map current whenever new pairs arrive.
    // Used by handleTransaction to detect deployer activity on known pairs.
    useEffect(() => {
        const map = new Map<string, string>();
        for (const np of newPairs) {
            if (np.deployer_address) {
                map.set(np.deployer_address.toLowerCase(), np.pair_address.toLowerCase());
            }
        }
        deployerToPairRef.current = map;
    }, [newPairs]);

    // Chain-switch: clear all live state and reload caches for the new chain.
    // Skips the initial mount (prevChainRef is seeded with activeChainGql).
    useEffect(() => {
        if (prevChainRef.current === activeChainGql) return;
        prevChainRef.current = activeChainGql;

        // Show loading skeleton while the new chain's subscription reconnects.
        setIsChainSwitching(true);

        // Clear pair metric / tx history refs immediately so stale data isn't read.
        pairMetricsRef.current.clear();
        pairTxsRef.current.clear();
        pairTxHashesRef.current.clear();
        setWhaleTxs([]);

        // Reload newPairs from the new chain's localStorage cache (or empty).
        let cachedNewPairs: NewPairData[] = [];
        try {
            const raw = localStorage.getItem(`${activeChainGql}:newPairs-cache`);
            if (raw) {
                const { data, ts } = JSON.parse(raw) as { data: NewPairData[]; ts: number };
                if (Array.isArray(data) && data.length > 0 && Date.now() - ts < 6 * 60 * 60 * 1000) {
                    cachedNewPairs = data;
                }
            }
        } catch {
            /* ignore */
        }
        // Normalise cached Tempo pairs: old cache may have stored the shared orderbook
        // address as pair_address.  Re-key by base_token.contract_address so the cache
        // is consistent with what the live stream will produce after normalisation.
        const switchRestChain = activeChainGql.replace(/_/g, "-").toLowerCase();
        if (getChainCaps(switchRestChain).useTokenAddressForOhlcv) {
            const seen = new Set<string>();
            cachedNewPairs = cachedNewPairs
                .map((p) =>
                    p.base_token?.contract_address ? { ...p, pair_address: p.base_token.contract_address } : p
                )
                .filter((p) => {
                    const key = p.pair_address.toLowerCase();
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
        }
        setNewPairs(cachedNewPairs);

        // Reload watchlist from the new chain's localStorage.
        let cachedWatchlist: Pair[] = [];
        try {
            const saved = localStorage.getItem(`${activeChainGql}:dexworks-watchlist`);
            if (saved) {
                cachedWatchlist = JSON.parse(saved) as Pair[];
                for (const p of cachedWatchlist) {
                    pairTxsRef.current.set(p.pairAddress.toLowerCase(), []);
                    pairTxHashesRef.current.set(p.pairAddress.toLowerCase(), new Set<string>());
                }
            }
        } catch {
            /* ignore */
        }
        setPairs(cachedWatchlist);

        // Reset the updatePairs subscription throttle so it reconnects immediately on the new chain.
        hasSubscribedRef.current = false;
        lastSubscriptionUpdateRef.current = 0;

        // Deselect any pair from the previous chain, land on chain root.
        navigate(`/${chainSlug}`);

        // Reset to chart view for chains that don't support the holder map.
        if (!getChainCaps(activeChainGql.replace(/_/g, "-").toLowerCase()).restApi) {
            setChartView("chart");
        }
    }, [activeChainGql]);

    // New pairs stream
    const { status: newPairsStatus } = useNewPairsStream(apiKey, streamUrl, newPairs, setNewPairs, activeChainGql);
    // Lift the chain-switching skeleton once the new-pairs stream reconnects.
    // Also add a 4 s hard timeout so the skeleton doesn't hang forever on
    // chains with no recent pairs (e.g. Tempo with zero activity).
    useEffect(() => {
        if (newPairsStatus === "connected") {
            const t = setTimeout(() => setIsChainSwitching(false), 800);
            return () => clearTimeout(t);
        }
        if (newPairsStatus === "connecting") {
            const t = setTimeout(() => setIsChainSwitching(false), 4000);
            return () => clearTimeout(t);
        }
    }, [newPairsStatus]);

    // Pre-warm safety score cache for top 10 pairs by liquidity whenever newPairs changes.
    // Uses the low-priority withPrefetchSemaphore (max 2 slots) so warm-up never blocks
    // user-triggered safety score loads which use the separate withSemaphore (max 5 slots).
    // No per-session dedup ref — prefetchSafetyScore already skips in-flight or cached
    // pairs, so calling it on every newPairs tick naturally re-warms expired cache entries.
    useEffect(() => {
        if (newPairs.length === 0) return;
        const top10 = [...newPairs].sort((a, b) => (b.liquidity ?? 0) - (a.liquidity ?? 0)).slice(0, 10);
        for (const pair of top10) {
            prefetchSafetyScore(pair, activeChainGql);
        }
    }, [newPairs, activeChainGql]);

    // Stable updateAddresses: only changes when the actual set of monitored addresses
    // changes.  Computed synchronously as a useMemo so useUpdatePairsStream sees the
    // new list in the same render cycle that newPairs/pairs change — no extra setState
    // round-trip.  The hook itself deduplicates via addressesKey so reconnections only
    // happen when the sorted, deduplicated address list actually differs.
    //
    // Gap 2 fix: also include watchlist pairs so that financial data (price, mcap,
    // liquidity) continues to update even after a pair ages off the top-10 new pairs.
    // For order-book chains (e.g. Tempo), pair_address is normalised to
    // base_token.contract_address on ingestion, so the standard address list
    // works for both updatePairs (AMM) and updateTokens (order-book) modes.
    const updateUseTokenMode = getChainCaps(activeChainGql.replace(/_/g, "-").toLowerCase()).useTokenAddressForOhlcv;
    const updateAddresses = useMemo(() => {
        const newPairAddrs = newPairs.map((np) => np.pair_address.toLowerCase());
        const watchlistAddrs = pairs.map((p) => p.pairAddress.toLowerCase());
        return [...new Set([...newPairAddrs, ...watchlistAddrs])].sort();
    }, [newPairs, pairs]);

    // Backfill token0/token1 for watchlist entries that were saved before the names
    // were available (e.g. pairs loaded from old localStorage cache on tempo-mainnet).
    useEffect(() => {
        if (newPairs.length === 0) return;
        setPairs((prev) => {
            let changed = false;
            const next = prev.map((p) => {
                if (p.token0 && p.token1) return p;
                const np = newPairs.find((n) => n.pair_address.toLowerCase() === p.pairAddress.toLowerCase());
                if (!np) return p;
                changed = true;
                return {
                    ...p,
                    token0: np.base_token?.contract_ticker_symbol ?? p.token0,
                    token1: np.quote_token?.contract_ticker_symbol ?? p.token1,
                };
            });
            return changed ? next : prev;
        });
    }, [newPairs]);

    // Throttle subscription restarts to at most once per 30 seconds.
    //
    // A plain debounce was broken on fast chains (MegaETH): new pairs arrive
    // every ~1s, each one reset the 100ms timer, so the subscription NEVER
    // fired and signal tabs stayed empty forever.
    //
    // Strategy:
    //   • Connect immediately on first available addresses (sessionStorage seed).
    //   • After that, only expand the subscription every 30 s so the subscription
    //     stays alive long enough to receive live price/liquidity/volume updates.
    const [deferredUpdateAddresses, setDeferredUpdateAddresses] = useState<string[]>(() => updateAddresses);
    const hasSubscribedRef = useRef(updateAddresses.length > 0);
    const lastSubscriptionUpdateRef = useRef(Date.now());
    useEffect(() => {
        if (!hasSubscribedRef.current) {
            // No subscription yet — connect as soon as the first addresses arrive.
            if (updateAddresses.length === 0) return;
            setDeferredUpdateAddresses(updateAddresses);
            hasSubscribedRef.current = true;
            lastSubscriptionUpdateRef.current = Date.now();
            return;
        }
        // Already subscribed — throttle expansions to prevent constant restarts.
        const elapsed = Date.now() - lastSubscriptionUpdateRef.current;
        const delay = Math.max(0, 30_000 - elapsed);
        const t = setTimeout(() => {
            setDeferredUpdateAddresses(updateAddresses);
            lastSubscriptionUpdateRef.current = Date.now();
        }, delay);
        return () => clearTimeout(t);
    }, [updateAddresses]);

    // Merge handler for update pairs stream.
    //
    // Gap 15 fix: changedAddresses is now a Set<string> so the watchlist check
    // is O(1) instead of O(n) via Array.includes().
    //
    // Gap 16 fix: setNewPairs uses a functional updater so rapid back-to-back
    // calls each see the latest state rather than a potentially stale snapshot
    // from newPairsRef.current.  The ref is still read first as a fast-path
    // bail-out (avoids scheduling any update when nothing actually changed).
    const handlePairUpdates = useCallback((updates: UpdatePairData[]) => {
        const updateMap = new Map<string, UpdatePairData>();
        for (const u of updates) {
            updateMap.set(u.pair_address.toLowerCase(), u);
        }

        const changedAddresses = new Set<string>();
        setNewPairs((prev) => {
            let changed = false;
            const next = prev.map((p) => {
                const key = p.pair_address.toLowerCase();
                const u = updateMap.get(key);
                if (!u) return p;
                // Skip the merge only when NOTHING changed — including timeframe data.
                // Previous check was too narrow: it only compared 24h fields and missed
                // 1h fields entirely, causing last_1hr.volume_usd / unique_buyers data
                // to be silently dropped when base price fields hadn't changed.
                const noTimeframeData = u.last_1hr == null && u.last_24hr == null;
                if (
                    noTimeframeData &&
                    p.liquidity === u.liquidity &&
                    p.market_cap === u.market_cap &&
                    p.quote_rate === u.quote_rate &&
                    p.quote_rate_usd === u.quote_rate_usd
                ) {
                    return p;
                }
                changed = true;
                changedAddresses.add(key);
                const buyers24h = u.last_24hr?.unique_buyers?.current_value;
                const sellers24h = u.last_24hr?.unique_sellers?.current_value;
                const buyers1h = u.last_1hr?.unique_buyers?.current_value;
                const sellers1h = u.last_1hr?.unique_sellers?.current_value;
                return {
                    ...p,
                    liquidity: u.liquidity,
                    market_cap: u.market_cap,
                    quote_rate: u.quote_rate,
                    quote_rate_usd: u.quote_rate_usd,
                    stream_pct_24h: u.last_24hr?.price?.pct_change ?? p.stream_pct_24h,
                    stream_pct_1h: u.last_1hr?.price?.pct_change ?? p.stream_pct_1h,
                    stream_vol_24h: u.last_24hr?.volume_usd?.current_value ?? p.stream_vol_24h,
                    stream_vol_1h: u.last_1hr?.volume_usd?.current_value ?? p.stream_vol_1h,
                    stream_swaps_1h: u.last_1hr?.swap_count?.current_value ?? p.stream_swaps_1h,
                    stream_buys_1h: u.last_1hr?.buy_count?.current_value ?? p.stream_buys_1h,
                    stream_sells_1h: u.last_1hr?.sell_count?.current_value ?? p.stream_sells_1h,
                    stream_makers_24h:
                        buyers24h != null || sellers24h != null
                            ? (buyers24h ?? 0) + (sellers24h ?? 0)
                            : p.stream_makers_24h,
                    stream_makers_1h:
                        buyers1h != null || sellers1h != null ? (buyers1h ?? 0) + (sellers1h ?? 0) : p.stream_makers_1h,
                };
            });
            return changed ? next : prev;
        });

        // Also update watchlist pairs with financial data.
        setPairs((prevPairs) => {
            let pairsChanged = false;
            const updatedWatchlist = prevPairs.map((p) => {
                const key = p.pairAddress.toLowerCase();
                const update = updateMap.get(key);
                if (!update) return p;
                if (
                    p.liquidity === update.liquidity &&
                    p.market_cap === update.market_cap &&
                    p.quote_rate_usd === update.quote_rate_usd &&
                    p.lastMetricsLoaded === true
                ) {
                    return p;
                }
                pairsChanged = true;
                changedAddresses.add(key); // O(1) — Gap 15
                return {
                    ...p,
                    liquidity: update.liquidity,
                    market_cap: update.market_cap,
                    quote_rate_usd: update.quote_rate_usd,
                    lastMetricsLoaded: true,
                };
            });
            return pairsChanged ? updatedWatchlist : prevPairs;
        });

        setUpdatedPairs((prev) => {
            const s = new Set(prev);
            for (const addr of changedAddresses) s.add(addr);
            return s;
        });
        setTimeout(() => {
            setUpdatedPairs((prev) => {
                const s = new Set(prev);
                for (const addr of changedAddresses) s.delete(addr);
                return s;
            });
        }, 800);

        // Record liquidity snapshots for Signal 1 (liquidity drop detection).
        // Also fire safety alerts and timeline events for watched pairs.
        for (const [key, u] of updateMap) {
            if (u.liquidity != null && u.liquidity >= 0) {
                recordLiquidityUpdate(key, u.liquidity);

                const isWatched = pairsRef.current.some((p) => p.pairAddress.toLowerCase() === key);
                const now = Date.now();
                const np = newPairsRef.current.find((p) => p.pair_address.toLowerCase() === key);
                const pairedAt = np ? new Date(np.block_signed_at).getTime() : now;

                const drop2m = getLiquidityDrop(key, 2 * 60_000);
                const drop5m = getLiquidityDrop(key, 5 * 60_000);

                // Timeline event for any >10% change (watched or unwatched new pairs)
                if (np && Math.abs(drop5m) >= 0.1) {
                    const coolKey = `${key}:timeline`;
                    const lastFired = liqAlertCooldownRef.current.get(coolKey) ?? 0;
                    if (now - lastFired > 5 * 60_000) {
                        pruneCooldownMap();
                        liqAlertCooldownRef.current.set(coolKey, now);
                        const pct = (Math.abs(drop5m) * 100).toFixed(0);
                        pushTimelineEvent(key, {
                            timestamp: now,
                            relativeMs: now - pairedAt,
                            event: `Liquidity ${drop5m > 0 ? "dropped" : "increased"} ${pct}% in 5m`,
                            severity: drop5m > 0 ? "warning" : "ok",
                        });
                    }
                }

                if (!isWatched) continue;

                const label = np
                    ? `${np.base_token?.contract_ticker_symbol ?? "?"}/${np.quote_token?.contract_ticker_symbol ?? "?"}`
                    : shortenAddress(key);

                // Deployer-level removal: >50% drop in 2 min
                if (drop2m >= 0.5) {
                    const coolKey = `${key}:remove`;
                    const lastFired = liqAlertCooldownRef.current.get(coolKey) ?? 0;
                    if (now - lastFired > 5 * 60_000) {
                        liqAlertCooldownRef.current.set(coolKey, now);
                        safetyAlertRef.current({
                            id: `${key}-liq-remove-${now}`,
                            pairAddress: key,
                            pairLabel: label,
                            message: `Liquidity removed ${(drop2m * 100).toFixed(0)}% in 2 min — possible rug`,
                            score: 0,
                        });
                        pushTimelineEvent(key, {
                            timestamp: now,
                            relativeMs: now - pairedAt,
                            event: `Liquidity removed: -${(drop2m * 100).toFixed(0)}% in 2m`,
                            severity: "danger",
                        });
                    }
                } else if (drop5m >= 0.3) {
                    // Significant drop: >30% in 5 min
                    const coolKey = `${key}:drop`;
                    const lastFired = liqAlertCooldownRef.current.get(coolKey) ?? 0;
                    if (now - lastFired > 5 * 60_000) {
                        liqAlertCooldownRef.current.set(coolKey, now);
                        safetyAlertRef.current({
                            id: `${key}-liq-drop-${now}`,
                            pairAddress: key,
                            pairLabel: label,
                            message: `Liquidity dropped ${(drop5m * 100).toFixed(0)}% in 5 min`,
                            score: 0,
                        });
                    }
                }
            }
        }

        // Sample quote_rate_usd into pairMetricsRef.priceHistory so that
        // buildCandlesFromTicks can always render a real chart even when the
        // OHLCV stream has no data (new pair / chain without OHLCV indexing).
        // Throttled to 1 sample per 2 s per pair to keep history compact.
        const nowMs = Date.now();
        for (const [key, u] of updateMap) {
            if (!u.quote_rate_usd || u.quote_rate_usd <= 0) continue;
            let m = pairMetricsRef.current.get(key);
            if (!m) {
                // Eagerly initialise so synthetic candles work even before the
                // wallet stream fires for this pair.
                m = {
                    pairAddress: key,
                    priceHistory: [],
                    currentPrice: null,
                    priceChange1h: null,
                    priceChange4h: null,
                    priceChange24h: null,
                    txTimestamps: [],
                    txRate1h: 0,
                    txRate4h: 0,
                    txRate24h: 0,
                    txRateBaseline: 0,
                    txRateStdDev: 0,
                    recentSpikeScore: 0,
                    lastUpdated: nowMs,
                };
                pairMetricsRef.current.set(key, m);
            }
            const last = m.priceHistory[m.priceHistory.length - 1];
            if (!last || nowMs - last.timestamp >= 2_000) {
                m.priceHistory.push({ timestamp: nowMs, price: u.quote_rate_usd });
                m.currentPrice = u.quote_rate_usd;
                m.lastUpdated = nowMs;
                // Keep at most 2 hours of ticks (~3 600 samples at 2 s cadence).
                if (m.priceHistory.length > 3_600) {
                    m.priceHistory = m.priceHistory.slice(-3_600);
                }
            }
        }

        // Stamp stream-sourced buy/sell counts onto PairMetrics so tradingSignal
        // can use real swap counts instead of the price-tick direction proxy.
        for (const [key, u] of updateMap) {
            const buys = u.last_1hr?.buy_count?.current_value;
            const sells = u.last_1hr?.sell_count?.current_value;
            if (buys == null && sells == null) continue;
            const m = pairMetricsRef.current.get(key);
            if (!m) continue; // will be initialised when price data arrives
            if (buys != null) m.buys1h = buys;
            if (sells != null) m.sells1h = sells;
        }
    }, []);

    // Update pairs stream — uses debounced address list (G1 fix).
    const { status: updatePairsStatus } = useUpdatePairsStream(
        apiKey,
        streamUrl,
        deferredUpdateAddresses,
        handlePairUpdates,
        activeChainGql,
        updateUseTokenMode
    );

    // Token search
    const { search, results: searchResults, isSearching, clearResults } = useTokenSearch(apiKey, streamUrl);

    // Debounced search effect.
    // Gap 11 fix: clear stale results immediately when the query changes so
    // the user never sees results from a previous search while typing.
    useEffect(() => {
        clearResults(); // wipe immediately — no stale flash between searches
        if (!searchQuery.trim()) return;

        const timer = setTimeout(() => search(searchQuery.trim()), 500);
        return () => clearTimeout(timer);
    }, [searchQuery, search, clearResults]);

    // Wallet addresses for streaming
    const walletAddresses = useMemo(() => pairs.map((p) => p.pairAddress.toLowerCase()), [pairs]);

    // G1 fix: debounce wallet addresses to avoid reconnecting useWalletStream on every txCount flush.
    const [deferredWalletAddresses, setDeferredWalletAddresses] = useState<string[]>(() => walletAddresses);
    useEffect(() => {
        const t = setTimeout(() => setDeferredWalletAddresses(walletAddresses), 400);
        return () => clearTimeout(t);
    }, [walletAddresses]);

    // Transaction handler
    const handleTransaction = useCallback((tx: TxData, receivedAt: number) => {
        const blockTime = new Date(tx.block_signed_at).getTime();
        const latencyMs = receivedAt - blockTime;

        latenciesRef.current.push(latencyMs);
        if (latenciesRef.current.length > 1000) latenciesRef.current.shift();

        // Track gas usage
        if (tx.gas_used) {
            gasUsageRef.current.push(tx.gas_used);
            if (gasUsageRef.current.length > 1000) gasUsageRef.current.shift();
        }

        const c = countersRef.current;
        c.totalMessages++;
        c.liveUpdates++;
        if (!c.startTime) c.startTime = Date.now();

        // Track for live TPS (rolling 10-second window)
        kpiDataRef.current.tpsWindow.push(receivedAt);

        // Whale detection: high gas usage (>500k gas)
        const isWhale = tx.gas_used > 500000;
        if (isWhale) {
            c.whaleCount++;
        }

        // Extract price from swap transactions
        let swapPrice: number | null = null;
        if (tx.decoded_type === "SWAP" && tx.decoded_details) {
            const details = tx.decoded_details as any;
            if (details.amount_in && details.amount_out) {
                const amountIn = parseFloat(details.amount_in.toString());
                const amountOut = parseFloat(details.amount_out.toString());
                if (amountIn > 0 && amountOut > 0) {
                    swapPrice = amountOut / amountIn;
                }
            }
        }

        const fromAddr = (tx.from_address || "").toLowerCase();
        const toAddr = (tx.to_address || "").toLowerCase();

        // Pair matching — uses pairTxsRef keys to avoid a stale-closure over `pairs` state.
        // State flush is deferred to the 500 ms metrics interval (pendingPairUpdatesRef) so
        // we don't schedule a React re-render for every incoming transaction.
        try {
            for (const pairAddr of pairTxsRef.current.keys()) {
                let count = 0;

                if (fromAddr === pairAddr || toAddr === pairAddr) count++;

                if (tx.logs) {
                    for (const log of tx.logs) {
                        if ((log.emitter_address || "").toLowerCase() === pairAddr) count++;
                    }
                }

                if (count > 0) {
                    const txList = pairTxsRef.current.get(pairAddr)!;
                    const seenHashes = pairTxHashesRef.current.get(pairAddr) ?? new Set<string>();
                    const isFirstTx = txList.length === 0;
                    if (!seenHashes.has(tx.tx_hash)) {
                        seenHashes.add(tx.tx_hash);
                        pairTxHashesRef.current.set(pairAddr, seenHashes);
                        txList.unshift(tx);
                        if (txList.length > 100) {
                            const evicted = txList.pop();
                            if (evicted) seenHashes.delete(evicted.tx_hash);
                        }

                        // Push "First trade" timeline event on the very first tx for this pair
                        if (isFirstTx) {
                            const np = newPairsRef.current.find((p) => p.pair_address.toLowerCase() === pairAddr);
                            const pairedAt = np ? new Date(np.block_signed_at).getTime() : receivedAt;
                            pushTimelineEvent(pairAddr, {
                                timestamp: receivedAt,
                                relativeMs: receivedAt - pairedAt,
                                event: "First trade observed",
                                severity: "info",
                            });
                        }
                    }

                    updatePairMetrics(pairAddr, { txTimestamp: receivedAt, price: swapPrice, fromAddress: fromAddr });

                    const pending = pendingPairUpdatesRef.current.get(pairAddr);
                    if (pending) {
                        pending.txCount += count;
                        pending.lastTx = tx;
                    } else {
                        pendingPairUpdatesRef.current.set(pairAddr, { txCount: count, lastTx: tx });
                    }
                }
            }
        } catch (err) {
            console.error("[WALLET] Pair state update error (non-fatal):", err);
        }

        // Track unique wallet makers for NEW (unwatched) pairs via the global TX stream.
        // Watched pairs are handled above via pairTxsRef. This covers the rest.
        try {
            if (fromAddr && newPairAddrsRef.current.size > 0) {
                // Check direct address match first (fastest)
                let matchedAddr = newPairAddrsRef.current.has(toAddr)
                    ? toAddr
                    : newPairAddrsRef.current.has(fromAddr)
                      ? fromAddr
                      : null;
                // Fall back to log emitter (most reliable for DEX swaps)
                if (!matchedAddr && tx.logs) {
                    for (const log of tx.logs) {
                        const emitter = (log.emitter_address || "").toLowerCase();
                        if (newPairAddrsRef.current.has(emitter) && !pairTxsRef.current.has(emitter)) {
                            matchedAddr = emitter;
                            break;
                        }
                    }
                }
                if (matchedAddr && !pairTxsRef.current.has(matchedAddr)) {
                    updatePairMetrics(matchedAddr, { fromAddress: fromAddr });

                    // Push "First trade" timeline event once per pair for new (unwatched) pairs
                    if (!firstTradeTrackedRef.current.has(matchedAddr)) {
                        firstTradeTrackedRef.current.add(matchedAddr);
                        const np2 = newPairsRef.current.find((p) => p.pair_address.toLowerCase() === matchedAddr);
                        const pairedAt2 = np2 ? new Date(np2.block_signed_at).getTime() : receivedAt;
                        pushTimelineEvent(matchedAddr, {
                            timestamp: receivedAt,
                            relativeMs: receivedAt - pairedAt2,
                            event: "First trade observed",
                            severity: "info",
                        });
                    }
                }
            }
        } catch (err) {
            console.error("[MAKERS] New pair tracking error (non-fatal):", err);
        }

        // Whale detection — only for the active/selected pair.
        // Wrapped in try/catch: wallet detection must never crash the app.
        try {
            const activePair = selectedPairRef.current;
            const matchesActive =
                activePair &&
                (fromAddr === activePair ||
                    toAddr === activePair ||
                    tx.logs?.some((log) => (log.emitter_address || "").toLowerCase() === activePair));
            const whale = matchesActive ? extractUsdValue(tx, ethPriceRef.current, nativeCurrencyRef.current) : null;
            // Show swaps regardless of threshold; filter other types by USD value
            if (whale && (whale.type === "swap" || whale.usdValue >= whaleThresholdRef.current)) {
                setWhaleTxs((prev) => {
                    const next: WhaleTx[] = [
                        {
                            tx,
                            usdValue: whale.usdValue,
                            type: whale.type,
                            token: whale.token,
                            receivedAt,
                        },
                        ...prev,
                    ];
                    if (next.length > 50) next.length = 50;
                    return next;
                });
            }
        } catch (err) {
            console.error("[WHALE] Detection error (non-fatal):", err);
        }

        // Deployer activity detection — push timeline event when a known pair's deployer
        // sends a transaction.  Uses 5-min cooldown to avoid timeline flooding.
        try {
            const deployerPairAddr = deployerToPairRef.current.get(fromAddr);
            if (deployerPairAddr) {
                const coolKey = `deployer:${deployerPairAddr}`;
                const lastFired = liqAlertCooldownRef.current.get(coolKey) ?? 0;
                if (receivedAt - lastFired > 5 * 60_000) {
                    liqAlertCooldownRef.current.set(coolKey, receivedAt);
                    const np = newPairsRef.current.find((p) => p.pair_address.toLowerCase() === deployerPairAddr);
                    const pairedAt = np ? new Date(np.block_signed_at).getTime() : receivedAt;
                    const txType = tx.decoded_type ? tx.decoded_type.toLowerCase() : "transaction";
                    pushTimelineEvent(deployerPairAddr, {
                        timestamp: receivedAt,
                        relativeMs: receivedAt - pairedAt,
                        event: `Deployer active: ${txType} detected`,
                        severity: "warning",
                    });
                }
            }
        } catch (err) {
            console.error("[DEPLOYER] Activity detection error (non-fatal):", err);
        }
    }, []);

    // Metrics helper functions
    function initializePairMetrics(pairAddress: string, createdAt?: number): import("./types").PairMetrics {
        return {
            pairAddress,
            pairCreatedAt: createdAt ?? Date.now(),
            priceHistory: [],
            currentPrice: null,
            priceChange1h: null,
            priceChange4h: null,
            priceChange24h: null,
            txTimestamps: [],
            txRate1h: 0,
            txRate4h: 0,
            txRate24h: 0,
            txRateBaseline: 0,
            txRateStdDev: 0,
            recentSpikeScore: 0,
            makersSet: new Set<string>(),
            lastUpdated: Date.now(),
        };
    }

    const updatePairMetrics = useCallback(
        (
            pairAddress: string,
            update: {
                txTimestamp?: number;
                price?: number | null;
                fromAddress?: string;
            }
        ) => {
            let metrics = pairMetricsRef.current.get(pairAddress);

            if (!metrics) {
                const np = newPairsRef.current.find((p) => p.pair_address.toLowerCase() === pairAddress);
                const createdAt = np ? new Date(np.block_signed_at).getTime() : undefined;
                metrics = initializePairMetrics(pairAddress, createdAt);
                pairMetricsRef.current.set(pairAddress, metrics);
            }

            const now = Date.now();

            // Update transaction timestamps and calculate rates
            if (update.txTimestamp) {
                metrics.txTimestamps.push(update.txTimestamp);

                // Keep only last 24 hours
                const cutoff24h = now - 24 * 60 * 60 * 1000;
                metrics.txTimestamps = metrics.txTimestamps.filter((ts) => ts > cutoff24h);

                // Calculate tx rates for different windows
                const cutoff1h = now - 60 * 60 * 1000;
                const cutoff4h = now - 4 * 60 * 60 * 1000;

                metrics.txRate1h = metrics.txTimestamps.filter((ts) => ts > cutoff1h).length;
                metrics.txRate4h = metrics.txTimestamps.filter((ts) => ts > cutoff4h).length;
                metrics.txRate24h = metrics.txTimestamps.length;

                // Update spike detection baseline
                calculateSpikeBaseline(metrics, now);
            }

            // Update price history and calculate % changes
            if (update.price && update.price > 0) {
                metrics.priceHistory.push({
                    timestamp: now,
                    price: update.price,
                });

                // Keep only last 24 hours of price data
                const cutoff24h = now - 24 * 60 * 60 * 1000;
                metrics.priceHistory = metrics.priceHistory.filter((p) => p.timestamp > cutoff24h);

                // Calculate price changes
                metrics.currentPrice = update.price;
                metrics.priceChange1h = calculatePriceChange(metrics.priceHistory, 1);
                metrics.priceChange4h = calculatePriceChange(metrics.priceHistory, 4);
                metrics.priceChange24h = calculatePriceChange(metrics.priceHistory, 24);
            }

            // Track unique wallet addresses for MAKERS column — first hour only (spec requirement)
            if (update.fromAddress && now - (metrics.pairCreatedAt ?? 0) < 3_600_000) {
                if (!metrics.makersSet) metrics.makersSet = new Set<string>();
                metrics.makersSet.add(update.fromAddress);
            }

            // Track tx count per wallet for wash-trade concentration check (all-time, not gated)
            if (update.fromAddress) {
                if (!metrics.makersTxCount) metrics.makersTxCount = new Map<string, number>();
                // Cap at 500 unique wallets to prevent unbounded growth on high-volume pairs
                if (metrics.makersTxCount.size < 500 || metrics.makersTxCount.has(update.fromAddress)) {
                    metrics.makersTxCount.set(
                        update.fromAddress,
                        (metrics.makersTxCount.get(update.fromAddress) ?? 0) + 1
                    );
                }
            }

            metrics.lastUpdated = now;
        },
        []
    );

    function calculatePriceChange(priceHistory: import("./types").PriceSnapshot[], hoursAgo: number): number | null {
        if (priceHistory.length < 2) return null;

        const now = Date.now();
        const cutoff = now - hoursAgo * 60 * 60 * 1000;
        const currentPrice = priceHistory[priceHistory.length - 1]?.price;

        if (!currentPrice) return null;

        // Find closest price snapshot to cutoff time
        let closestSnapshot: import("./types").PriceSnapshot | null = null;
        let minDiff = Infinity;

        for (const snapshot of priceHistory) {
            const diff = Math.abs(snapshot.timestamp - cutoff);
            if (diff < minDiff && snapshot.timestamp <= now) {
                minDiff = diff;
                closestSnapshot = snapshot;
            }
        }

        if (!closestSnapshot) return null;

        return ((currentPrice - closestSnapshot.price) / closestSnapshot.price) * 100;
    }

    function calculateSpikeBaseline(metrics: import("./types").PairMetrics, now: number) {
        const windowSize = 1 * 60 * 60 * 1000; // 1 hour
        const rates: number[] = [];
        const windowCount = 6; // 6 hours of history

        for (let i = 0; i < windowCount; i++) {
            const windowEnd = now - i * windowSize;
            const windowStart = windowEnd - windowSize;
            const txsInWindow = metrics.txTimestamps.filter((ts) => ts >= windowStart && ts < windowEnd).length;
            rates.push(txsInWindow);
        }

        // Calculate mean and standard deviation
        const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
        const variance = rates.reduce((sum, rate) => sum + Math.pow(rate - mean, 2), 0) / rates.length;
        const stdDev = Math.sqrt(variance);

        metrics.txRateBaseline = mean;
        metrics.txRateStdDev = stdDev;

        // Calculate z-score (how many standard deviations above mean)
        const currentRate = metrics.txRate1h;
        metrics.recentSpikeScore = stdDev > 0 ? (currentRate - mean) / stdDev : 0;
    }

    // Global transaction stream for KPIs (tracks ALL network transactions)
    const { status: globalTxStatus } = useGlobalTxStream(apiKey, streamUrl, handleTransaction, activeChainGql);

    // Log global stream status changes
    useEffect(() => {
        console.log(`[APP] Global TX stream status: ${globalTxStatus}`);
        if (globalTxStatus === "connected") {
            console.log(`[APP] ✅ Global stream connected! Listening for ${activeChainGql} transactions...`);
        } else if (globalTxStatus === "error") {
            console.error(`[APP] ❌ Global stream error! Check API key and stream URL.`);
        }
    }, [globalTxStatus]);

    // Wallet stream — uses debounced address list (G1 fix).
    const { status: walletStatus } = useWalletStream(
        apiKey,
        streamUrl,
        deferredWalletAddresses,
        handleTransaction,
        activeChainGql
    );

    // OHLCV stream for selected pair
    // CHART_INTERVAL_CONFIGS is module-level (stable refs) — do not inline here.
    // For chains that use token-address OHLCV (e.g. Tempo order book), pass null
    // as the pair address and the base token address as the OHLCV key so the hook
    // subscribes via ohlcvCandlesForToken instead of ohlcvCandlesForPair.
    const restChainForOhlcv = activeChainGql.replace(/_/g, "-").toLowerCase();
    const ohlcvUseToken = getChainCaps(restChainForOhlcv).useTokenAddressForOhlcv;
    const selectedBaseTokenAddress =
        newPairs.find((p) => p.pair_address.toLowerCase() === selectedPairAddress)?.base_token?.contract_address ??
        pairs.find((p) => p.pairAddress.toLowerCase() === selectedPairAddress)?.base_token_address;
    const {
        candles,
        config: ohlcvConfig,
        isLoading: ohlcvLoading,
        noData: ohlcvNoData,
    } = useOHLCVStream(
        apiKey,
        streamUrl,
        ohlcvUseToken ? null : selectedPairAddress,
        activeChainGql,
        chartInterval ? CHART_INTERVAL_CONFIGS[chartInterval] : undefined,
        selectedBaseTokenAddress
    );

    // Synthetic candle fallback — computed every 250ms from live price ticks.
    // Always populated for the selected pair (not gated on ohlcvNoData) so the
    // chart renders immediately on pair selection; real OHLCV replaces it when ready.
    const [syntheticCandles, setSyntheticCandles] = useState<OHLCVCandle[]>([]);
    const ohlcvNoDataRef = useRef(false);
    ohlcvNoDataRef.current = ohlcvNoData;

    // Seed pairMetricsRef.priceHistory for ALL cached newPairs on mount.
    // Use initial_quote_rate_usd as the first tick and quote_rate_usd as the second —
    // when they differ, the sessionPct fallback immediately detects price movement and
    // GAINERS/LOSERS/SPIKES populate on the very first render without waiting for the stream.
    useEffect(() => {
        const now = Date.now();
        for (const p of newPairsRef.current) {
            const key = p.pair_address.toLowerCase();
            const seedCurrent = p.quote_rate_usd ?? 0;
            if (seedCurrent <= 0) continue;
            // Use initial_quote_rate_usd as the historical baseline. If it's 0 or missing,
            // fall back to seedCurrent so both ticks are identical (→ sessionPct = null = correct).
            const seedInitial =
                p.initial_quote_rate_usd && p.initial_quote_rate_usd > 0 ? p.initial_quote_rate_usd : seedCurrent;
            const existing = pairMetricsRef.current.get(key);
            if (existing) {
                // handlePairUpdates may have already created an entry with only live ticks (no
                // historical baseline).  Prepend the t-1h anchor so sessionPct can detect price
                // movement between the initial price and now, powering GAINERS/LOSERS/SPIKES.
                // Only skip if the entry already has a proper historical baseline (first tick is
                // old enough — i.e. not a freshly-created entry from the update stream).
                const firstTick = existing.priceHistory[0];
                if (firstTick && firstTick.timestamp < now - 60_000) continue; // already seeded properly
                existing.priceHistory.unshift({ timestamp: now - 3_600_000, price: seedInitial });
            } else {
                pairMetricsRef.current.set(key, {
                    pairAddress: key,
                    priceHistory: [
                        { timestamp: now - 3_600_000, price: seedInitial },
                        { timestamp: now, price: seedCurrent },
                    ],
                    currentPrice: seedCurrent,
                    priceChange1h: null,
                    priceChange4h: null,
                    priceChange24h: null,
                    txTimestamps: [],
                    txRate1h: 0,
                    txRate4h: 0,
                    txRate24h: 0,
                    txRateBaseline: 0,
                    txRateStdDev: 0,
                    recentSpikeScore: 0,
                    lastUpdated: now,
                });
            }
        }
        // Trigger gemsData recompute so GAINERS/LOSERS/SPIKES reflect seeded prices immediately.
        setSignalTick((t) => t + 1);
    }, []); // Run once on mount — newPairsRef is already populated from the sync lazy init

    // Seed pairMetricsRef.priceHistory immediately when a pair is selected so the
    // 250ms metrics interval has data to build synthetic candles on its very first tick.
    useEffect(() => {
        if (!selectedPairAddress) return;
        const key = selectedPairAddress.toLowerCase();
        const existing = pairMetricsRef.current.get(key);
        if (existing && existing.priceHistory.length >= 2) return;

        // Pull cached price from newPairs state (populated from localStorage) or watchlist.
        const np = newPairsRef.current.find((p) => p.pair_address.toLowerCase() === key);
        const watchlistPair = pairs.find((p) => p.pairAddress.toLowerCase() === key);
        const seedCurrent = np?.quote_rate_usd ?? watchlistPair?.quote_rate_usd ?? 0;
        if (seedCurrent <= 0) return;
        const seedInitial =
            np?.initial_quote_rate_usd && np.initial_quote_rate_usd > 0 ? np.initial_quote_rate_usd : seedCurrent;

        const now = Date.now();
        if (!existing) {
            pairMetricsRef.current.set(key, {
                pairAddress: key,
                priceHistory: [
                    { timestamp: now - 3_600_000, price: seedInitial },
                    { timestamp: now, price: seedCurrent },
                ],
                currentPrice: seedCurrent,
                priceChange1h: null,
                priceChange4h: null,
                priceChange24h: null,
                txTimestamps: [],
                txRate1h: 0,
                txRate4h: 0,
                txRate24h: 0,
                txRateBaseline: 0,
                txRateStdDev: 0,
                recentSpikeScore: 0,
                lastUpdated: now,
            });
        } else {
            existing.priceHistory = [
                { timestamp: now - 3_600_000, price: seedInitial },
                { timestamp: now, price: seedCurrent },
            ];
            existing.currentPrice = seedCurrent;
        }
    }, [selectedPairAddress]);

    // G6 fix: warm OHLCV cache for the top 3 watched pairs that aren't currently selected.
    // When the user clicks any of those pairs the chart renders instantly from cache.
    useEffect(() => {
        if (!apiKey || !streamUrl || pairs.length === 0) return;
        const toPreload = pairs.filter((p) => p.pairAddress.toLowerCase() !== selectedPairAddress).slice(0, 3);
        const cancels = toPreload.map((p) => prefetchOHLCV(apiKey, streamUrl, p.pairAddress, activeChainGql));
        return () => cancels.forEach((c) => c());
    }, [pairs, selectedPairAddress, apiKey, streamUrl]);

    // USDM supply — fetched via eth_call through the /api/rpc proxy (no API key needed)
    const { supply: usdmSupply, status: supplyStatus } = useUSDMSupply(activeChainGql);

    // DEX protocol fee volume — polled from GoldRush xy=k REST API every 5 minutes
    const { feeVolume: feeVol24h } = useFeeVolume24h(apiKey, activeChainGql);
    const feeVol24hRef = useRef(0);
    feeVol24hRef.current = feeVol24h;

    // MaFiA apps — unique contracts active in rolling 24h window (GoldRush block sampling)
    const { appsLive: appsLiveVal } = useAppsLive24h(apiKey, activeChainGql);
    const appsLiveRef = useRef(0);
    appsLiveRef.current = appsLiveVal;

    // Bulk spot-price changes — fetched for all visible pairs, CDN-cached 5 min per pair.
    // Primary data source for GAINERS/LOSERS/SPIKES (percent_change_24h) and VOL (volume_24h_usd).
    // Both come from the spot-price REST API, CDN-cached 5 min per pair, localStorage 30 min.
    const allPairAddresses = useMemo(() => newPairs.map((p) => p.pair_address), [newPairs]);
    const { pctChanges: spotPriceChanges, volumes: spotVolumes } = useAllSpotPrices(restChain, allPairAddresses);
    const spotPriceChangesRef = useRef(spotPriceChanges);
    const spotVolumesRef = useRef(spotVolumes);
    useEffect(() => {
        spotPriceChangesRef.current = spotPriceChanges;
        spotVolumesRef.current = spotVolumes;
        if (spotPriceChanges.size > 0) setSignalTick((t) => t + 1);
    }, [spotPriceChanges, spotVolumes]);

    // Sync live tx rates from pairMetricsRef into pairTxRatesRef every 2 s.
    // Also recomputes per-pair price changes and persists them so GAINERS/LOSERS/SPIKES
    // load instantly on the next open, mirroring MOMENTUM's TX_RATES_CACHE_KEY pattern.
    // Only increments signalTick (forcing gemsData to recompute) when rates change.
    useEffect(() => {
        const id = setInterval(() => {
            // --- tx rates (MOMENTUM) ---
            const prev = pairTxRatesRef.current;
            const next = new Map<string, number>();
            for (const [addr, m] of pairMetricsRef.current) {
                if (m.txRate1h > 0) next.set(addr, m.txRate1h);
            }
            let txChanged = next.size !== prev.size;
            if (!txChanged) {
                for (const [addr, rate] of next) {
                    if (Math.abs((prev.get(addr) ?? 0) - rate) > 0.1) {
                        txChanged = true;
                        break;
                    }
                }
            }
            if (txChanged) {
                pairTxRatesRef.current = next;
                try {
                    localStorage.setItem(
                        TX_RATES_CACHE_KEY,
                        JSON.stringify({ data: [...next.entries()], ts: Date.now() })
                    );
                } catch {
                    /* storage full */
                }
            }

            // --- makers (unique wallet count per pair) ---
            let makersChanged = false;
            const nextMakers = new Map(makersRef.current);
            for (const [addr, m] of pairMetricsRef.current) {
                if (m.makersSet && m.makersSet.size > 0) {
                    const prev2 = nextMakers.get(addr) ?? 0;
                    if (m.makersSet.size !== prev2) {
                        nextMakers.set(addr, m.makersSet.size);
                        makersChanged = true;
                    }
                }
            }
            if (makersChanged) {
                makersRef.current = nextMakers;
                try {
                    localStorage.setItem(
                        MAKERS_CACHE_KEY,
                        JSON.stringify({ data: [...nextMakers.entries()], ts: Date.now() })
                    );
                } catch {
                    /* storage full */
                }
            }

            // --- price changes (GAINERS / LOSERS / SPIKES) ---
            // Compute pct changes using three data sources in priority order:
            //   1. API price_deltas (best — available when chain supports it)
            //   2. within-session: initial_quote_rate_usd vs current quote_rate_usd
            //   3. cross-session baseline: current vs PREVIOUS session's {price, mcap}
            //      (gemBaselineRef holds previous-session data; localStorage is updated
            //       below with current-session data for the NEXT session to consume)
            const now2 = Date.now();
            const changes = new Map<string, { p1h: number | null; p24h: number | null }>();
            const nextBaseline = new Map<string, { price: number; mcap: number }>();
            for (const p of newPairsRef.current) {
                const key = p.pair_address.toLowerCase();
                const cp = p.quote_rate_usd ?? 0;
                const cm = p.market_cap ?? 0;
                // Snapshot for localStorage (used as baseline on NEXT session load)
                if (cp > 0 || cm > 0) nextBaseline.set(key, { price: cp, mcap: cm });

                let pct: number | null = null;
                // 1. updatePairs stream timeframe data (most reliable, persisted in 6h cache)
                if (p.stream_pct_1h != null) {
                    pct = p.stream_pct_1h;
                } else if (p.stream_pct_24h != null) {
                    pct = p.stream_pct_24h;
                }
                // 2. Within-session: initial vs current price
                else if (
                    p.initial_quote_rate_usd &&
                    p.initial_quote_rate_usd > 0 &&
                    cp > 0 &&
                    cp !== p.initial_quote_rate_usd
                ) {
                    pct = ((cp - p.initial_quote_rate_usd) / p.initial_quote_rate_usd) * 100;
                }
                // 2b. priceHistory ticks (accumulate from live stream)
                else {
                    const m2 = pairMetricsRef.current.get(key);
                    if (m2 && m2.priceHistory.length >= 2) {
                        const cutoff2 = now2 - 3_660_000; // 1h + 60s grace
                        const recent2 = m2.priceHistory.filter((t) => t.timestamp > cutoff2);
                        if (recent2.length >= 2) {
                            const f = recent2[0]!.price;
                            const l = recent2[recent2.length - 1]!.price;
                            if (f > 0 && f !== l) pct = ((l - f) / f) * 100;
                        }
                    }
                }
                // 3. Cross-session baseline — price OR market_cap
                if (pct == null) {
                    const bl = gemBaselineRef.current.get(key);
                    if (bl) {
                        const bp = bl.price;
                        const bm = bl.mcap;
                        if (bp > 0 && cp > 0 && Math.abs(cp - bp) / bp > 1e-6) {
                            pct = ((cp - bp) / bp) * 100;
                        } else if (bm > 0 && cm > 0 && Math.abs(cm - bm) / bm > 1e-6) {
                            pct = ((cm - bm) / bm) * 100;
                        }
                    }
                }
                // Tertiary: just received a price from zero → surface in GAINERS
                if (pct == null && cp > 0 && (!p.initial_quote_rate_usd || p.initial_quote_rate_usd === 0)) {
                    pct = 0.1;
                }

                if (pct != null) changes.set(key, { p1h: pct, p24h: p.stream_pct_24h ?? pct });
            }
            let pctChanged = changes.size !== pairPctChangesRef.current.size;
            if (!pctChanged) {
                for (const [addr, val] of changes) {
                    const prev2 = pairPctChangesRef.current.get(addr);
                    if (!prev2 || Math.abs((prev2.p1h ?? 0) - (val.p1h ?? 0)) > 0.01) {
                        pctChanged = true;
                        break;
                    }
                }
            }
            if (pctChanged && changes.size > 0) {
                pairPctChangesRef.current = changes;
                // Persist computed pct changes so next session can seed instantly
                // (covers chains where stream_pct_* are always null, e.g. MegaETH).
                try {
                    localStorage.setItem(
                        PCT_CHANGES_CACHE_KEY,
                        JSON.stringify({ data: [...changes.entries()], ts: Date.now() })
                    );
                } catch {
                    /* storage full */
                }
            }
            // Always persist the current-session snapshot so the NEXT session gets
            // a fresh cross-session baseline (overwrite every tick — recency is fine).
            if (nextBaseline.size > 0) {
                try {
                    localStorage.setItem(
                        GEM_BASELINE_KEY,
                        JSON.stringify({ data: [...nextBaseline.entries()], ts: Date.now() })
                    );
                } catch {
                    /* storage full */
                }
            }

            if (txChanged || pctChanged) setSignalTick((t) => t + 1);
        }, 2_000);
        return () => clearInterval(id);
    }, []);

    // Signal tabs: price_deltas / swap_counts from updatePairs (API), with
    // session-local fallbacks for chains where the API doesn't return those fields.
    const gemsData = useMemo(() => {
        if (activeGemTab === "new") return [];
        // use1h drives which stream field to prefer (stream_pct_1h vs stream_pct_24h).
        // For 4h we prefer stream_pct_1h (closer than 24h). timeframeMs drives cutoff calcs.
        const use1h = selectedTimeframe === "1h" || selectedTimeframe === "4h";
        const timeframeMs =
            selectedTimeframe === "1h" ? 3_600_000 : selectedTimeframe === "4h" ? 14_400_000 : 86_400_000;
        const ps = newPairs.filter((p) => p.base_token && p.quote_token);

        const base = (p: NewPairData) => ({
            pair_address: p.pair_address,
            base_token_symbol: p.base_token.contract_ticker_symbol,
            quote_token_symbol: p.quote_token.contract_ticker_symbol,
            price_usd: p.quote_rate_usd ?? 0,
            liquidity_usd: p.liquidity ?? 0,
            marketcap_usd: p.market_cap ?? 0,
        });
        // Price change: API 1h/24h first; fall back to % vs initial price seen this session;
        // last resort: compare first vs last tick in pairMetricsRef.priceHistory.
        const sessionPct = (p: NewPairData): number | null => {
            if (p.initial_quote_rate_usd && p.initial_quote_rate_usd > 0 && p.quote_rate_usd) {
                // Zero is a valid result (stable pair) — let callers decide via their own thresholds.
                return ((p.quote_rate_usd - p.initial_quote_rate_usd) / p.initial_quote_rate_usd) * 100;
            }
            // Fallback: compare first vs last tick in priceHistory.
            // Skip pairs whose history was seeded with identical prices (first === last).
            // Use a 30-second grace buffer on the cutoff so the seeded t-1h anchor tick
            // (placed at now-3600000 at mount time) isn't accidentally filtered out when
            // gemsData evaluates a few seconds later.
            const m = pairMetricsRef.current.get(p.pair_address.toLowerCase());
            if (m && m.priceHistory.length >= 2) {
                const cutoff = Date.now() - timeframeMs - 30_000;
                const recent = m.priceHistory.filter((t) => t.timestamp > cutoff);
                if (recent.length >= 2) {
                    const first = recent[0]!.price;
                    const last = recent[recent.length - 1]!.price;
                    if (first > 0 && first !== last) return ((last - first) / first) * 100;
                }
            }
            return null;
        };
        // Shared baseline lookup — reads gemBaselineRef (previous-session prices/mcaps).
        // This is the same data the 2s interval uses, but accessed directly here so the
        // very first render (before the interval fires) already has cross-session data.
        const baselinePct = (p: NewPairData): number | null => {
            const key = p.pair_address.toLowerCase();
            const bl = gemBaselineRef.current.get(key);
            if (!bl) return null;
            const cp = p.quote_rate_usd ?? 0;
            const cm = p.market_cap ?? 0;
            if (bl.price > 0 && cp > 0 && Math.abs(cp - bl.price) / bl.price > 1e-6)
                return ((cp - bl.price) / bl.price) * 100;
            if (bl.mcap > 0 && cm > 0 && Math.abs(cm - bl.mcap) / bl.mcap > 1e-6)
                return ((cm - bl.mcap) / bl.mcap) * 100;
            return null;
        };
        const pctChange = (p: NewPairData): number => {
            // 1. updatePairs stream — real timeframe price pct_change (most reliable)
            // Always try both windows: pairs <24h old won't have stream_pct_24h,
            // but will have stream_pct_1h; use whichever is available.
            if (use1h) {
                if (p.stream_pct_1h != null) return p.stream_pct_1h;
                if (p.stream_pct_24h != null) return p.stream_pct_24h;
            } else {
                if (p.stream_pct_24h != null) return p.stream_pct_24h;
                if (p.stream_pct_1h != null) return p.stream_pct_1h; // fallback for pairs <24h old
            }
            // 2. REST spot price API (CDN-cached, limited MegaETH coverage)
            const spot = spotPriceChangesRef.current.get(p.pair_address.toLowerCase());
            if (spot != null) return spot;
            // 3. Session price tracking fallback (very new pairs not yet in updatePairs)
            const live = use1h ? sessionPct(p) : sessionPct(p);
            if (live != null) return live;
            // 4. Interval cache (written every 2 s from session price tracking)
            const cached = pairPctChangesRef.current.get(p.pair_address.toLowerCase());
            const cachedVal = use1h ? cached?.p1h : (cached?.p24h ?? cached?.p1h);
            if (cachedVal != null) return cachedVal;
            // 5. Cross-session baseline (previous session stored prices)
            return baselinePct(p) ?? 0;
        };
        // Activity metric for MOMENTUM: API swap count → cached tx rate → price-tick density → volume_usd.
        // Returns { value, isVolume } so the display can format correctly.
        const activityMetric = (p: NewPairData): { value: number; isVolume: boolean } | null => {
            // 1a. Real swap count from updatePairs stream
            if (p.stream_swaps_1h != null && p.stream_swaps_1h > 0)
                return { value: p.stream_swaps_1h, isVolume: false };
            // 1b. buy_count + sell_count — same stream, often populated when swap_count isn't
            const buySell = (p.stream_buys_1h ?? 0) + (p.stream_sells_1h ?? 0);
            if (buySell > 0) return { value: buySell, isVolume: false };
            // 2. Cached tx rate from wallet stream (persisted across reloads, 6h TTL)
            const live = pairTxRatesRef.current.get(p.pair_address.toLowerCase());
            if (live != null) return { value: live, isVolume: false };
            // 3. Price-tick count — each tick = on-chain swap event from updatePairs
            const m = pairMetricsRef.current.get(p.pair_address.toLowerCase());
            if (m && m.priceHistory.length > 0) {
                const cutoff = Date.now() - timeframeMs;
                const recent = m.priceHistory.filter((t) => t.timestamp > cutoff).length;
                if (recent > 0) return { value: recent, isVolume: false };
            }
            // 4. volume as last-resort activity ranking signal
            const vol = p.stream_vol_24h ?? p.stream_vol_1h ?? p.volume_usd;
            if (vol != null && vol > 0) return { value: vol, isVolume: true };
            return null;
        };
        if (activeGemTab === "gainers") {
            // Require at least 1% gain — sub-1% changes are noise from fallback price sources.
            // Precompute pctChange once per pair to avoid triple-computation in filter+sort+map.
            return ps
                .map((p) => ({ p, pct: pctChange(p) }))
                .filter(({ pct }) => pct >= 1)
                .sort((a, b) => b.pct - a.pct)
                .map(({ p, pct }) => ({ ...base(p), pct_change: pct }));
        }
        if (activeGemTab === "losers") {
            // Show any pair with a negative price change (no minimum threshold).
            return ps
                .map((p) => ({ p, pct: pctChange(p) }))
                .filter(({ pct }) => pct < 0)
                .sort((a, b) => a.pct - b.pct)
                .map(({ p, pct }) => ({ ...base(p), pct_change: pct }));
        }
        if (activeGemTab === "momentum") {
            // Require minimum $500 liquidity to filter ghost/rug pairs from the list.
            // Sorted by real swap activity; market_cap is tiebreaker for data-sparse chains.
            // Precompute activityMetric once per pair to avoid calling it in both sort and map.
            return ps
                .filter((p) => (p.liquidity ?? 0) >= 500)
                .map((p) => ({ p, m: activityMetric(p) }))
                .sort((a, b) => {
                    const av = a.m?.value ?? 0;
                    const bv = b.m?.value ?? 0;
                    if (bv !== av) return bv - av;
                    return (b.p.market_cap ?? 0) - (a.p.market_cap ?? 0);
                })
                .map(({ p, m }) => ({
                    ...base(p),
                    pct_change: pctChange(p),
                    // activity_count: raw swap count (or null if only volume is available)
                    // activity_vol: volume fallback when swap count isn't known
                    activity_count: m && !m.isVolume ? m.value : null,
                    activity_vol: m?.isVolume ? m.value : null,
                }));
        }
        if (activeGemTab === "spikes") {
            // Spike signal: absolute % move regardless of direction.
            // Priority: stream_pct_1h → stream_pct_24h → REST spot → sessionPct → cached → baseline.
            const spikeVal = (p: NewPairData): number => {
                if (p.stream_pct_1h != null) return Math.abs(p.stream_pct_1h);
                if (p.stream_pct_24h != null) return Math.abs(p.stream_pct_24h);
                const spot = spotPriceChangesRef.current.get(p.pair_address.toLowerCase());
                if (spot != null) return Math.abs(spot);
                const live = sessionPct(p);
                if (live != null) return Math.abs(live);
                const cached = pairPctChangesRef.current.get(p.pair_address.toLowerCase());
                const cachedVal = cached?.p1h ?? cached?.p24h;
                if (cachedVal != null) return Math.abs(cachedVal);
                return Math.abs(baselinePct(p) ?? 0);
            };
            // Precompute once per pair to avoid triple-computation in filter+sort+map.
            return ps
                .map((p) => ({ p, spike: spikeVal(p) }))
                .filter(({ spike }) => spike > 0)
                .sort((a, b) => b.spike - a.spike)
                .map(({ p, spike }) => ({ ...base(p), pct_change_1h: spike }));
        }
        return [];
        // signalTick triggers recompute when live tx rates change (every ~2 s).
    }, [activeGemTab, selectedTimeframe, newPairs, signalTick]);

    // Cache computed gem lists per tab so they're instantly available on next load.
    // Seeded from localStorage on mount; written whenever gemsData produces results.
    type GemEntry = Record<string, unknown>;
    const [gemResultsCache, setGemResultsCache] = useState<Record<string, GemEntry[]>>(() => {
        const cache: Record<string, GemEntry[]> = {};
        for (const tab of ["gainers", "losers", "spikes", "momentum"] as const) {
            try {
                const raw = localStorage.getItem(`${GEMS_RESULT_CACHE_KEY}-${tab}`);
                if (raw) {
                    const { data, ts } = JSON.parse(raw) as { data: GemEntry[]; ts: number };
                    if (Array.isArray(data) && data.length > 0 && Date.now() - ts < 6 * 60 * 60 * 1000) {
                        cache[tab] = data;
                        continue;
                    }
                }
            } catch {
                /* ignore */
            }
            cache[tab] = [];
        }
        return cache;
    });
    useEffect(() => {
        if (activeGemTab === "new" || gemsData.length === 0) return;
        const entries = gemsData as GemEntry[];
        setGemResultsCache((prev) => ({ ...prev, [activeGemTab]: entries }));
        try {
            localStorage.setItem(
                `${GEMS_RESULT_CACHE_KEY}-${activeGemTab}`,
                JSON.stringify({ data: entries, ts: Date.now() })
            );
        } catch {
            /* storage full */
        }
    }, [gemsData, activeGemTab, GEMS_RESULT_CACHE_KEY]);

    // Server-side cache: fetch on mount to seed tabs for first-ever loads (before any
    // localStorage history exists). Only fills tabs that are currently empty locally.
    useEffect(() => {
        fetch(`/api/gems-cache?chain=${activeChainGql}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data: Record<string, GemEntry[]> | null) => {
                if (!data) return;
                setGemResultsCache((prev) => {
                    const next = { ...prev };
                    for (const tab of ["gainers", "losers", "spikes", "momentum"]) {
                        if (Array.isArray(data[tab]) && data[tab].length > 0 && (next[tab] ?? []).length === 0) {
                            next[tab] = data[tab];
                        }
                    }
                    return next;
                });
            })
            .catch(() => {
                /* server cache unavailable — localStorage fallback is already active */
            });
    }, []);

    // Server-side cache write: after computing live gem data, push to server so other
    // users (and future first loads) benefit immediately. Debounced 10 s to batch tabs.
    const serverCacheWriteRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (activeGemTab === "new" || gemsData.length === 0) return;
        if (serverCacheWriteRef.current) clearTimeout(serverCacheWriteRef.current);
        serverCacheWriteRef.current = setTimeout(() => {
            // Include the active tab's fresh data; also ship any other cached tabs so
            // a single POST keeps the server up to date for all four signal tabs.
            const payload: Record<string, GemEntry[]> = { [activeGemTab]: gemsData as GemEntry[] };
            for (const tab of ["gainers", "losers", "spikes", "momentum"]) {
                const cached = gemResultsCache[tab];
                if (tab !== activeGemTab && cached && cached.length > 0) {
                    payload[tab] = cached;
                }
            }
            fetch(`/api/gems-cache?chain=${activeChainGql}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            }).catch(() => {
                /* non-fatal — localStorage cache still active */
            });
        }, 10_000);
        return () => {
            if (serverCacheWriteRef.current) clearTimeout(serverCacheWriteRef.current);
        };
    }, [gemsData, activeGemTab]);

    // Periodic metrics sync
    useEffect(() => {
        const interval = setInterval(() => {
            const lats = latenciesRef.current;
            const c = countersRef.current;
            const now = Date.now();

            // Synthetic candles — always rebuilt from live price ticks for the
            // selected pair so the chart shows immediately on selection and stays
            // live as new updatePairs events arrive.  Real OHLCV candles take
            // priority in the render (displayCandles = candles || syntheticCandles).
            if (selectedPairRef.current) {
                const key = selectedPairRef.current.toLowerCase();
                const m = pairMetricsRef.current.get(key);
                const ticks = m?.priceHistory;
                if (ticks && ticks.length >= 2) {
                    const span = ticks[ticks.length - 1]!.timestamp - ticks[0]!.timestamp;
                    const bucketMs = Math.max(5_000, Math.ceil(span / 60 / 1000) * 1_000);
                    setSyntheticCandles(buildCandlesFromTicks(ticks, bucketMs));
                }
            } else {
                setSyntheticCandles((prev) => (prev.length === 0 ? prev : []));
            }

            // Flush batched pair txCount / lastTx updates into React state.
            // This runs at most 2×/s instead of once per incoming transaction.
            if (pendingPairUpdatesRef.current.size > 0) {
                const snapshot = new Map(pendingPairUpdatesRef.current);
                pendingPairUpdatesRef.current.clear();
                setPairs((prev) =>
                    prev.map((pair) => {
                        const update = snapshot.get(pair.pairAddress.toLowerCase());
                        if (!update) return pair;
                        return { ...pair, txCount: pair.txCount + update.txCount, lastTx: update.lastTx };
                    })
                );
            }

            // Snapshot makers count from pairMetricsRef into pairs state
            const makersSnapshot = new Map<string, number>();
            for (const [addr, m] of pairMetricsRef.current) {
                if (m.makersSet && m.makersSet.size > 0) {
                    makersSnapshot.set(addr, m.makersSet.size);
                }
            }
            if (makersSnapshot.size > 0) {
                setPairs((prev) => {
                    let changed = false;
                    const next = prev.map((pair) => {
                        const makers = makersSnapshot.get(pair.pairAddress.toLowerCase());
                        if (makers == null || makers === pair.makers) return pair;
                        changed = true;
                        return { ...pair, makers };
                    });
                    return changed ? next : prev;
                });
            }

            // Compute live TPS from rolling 10-second window
            const tpsWindowMs = 10_000;
            kpiDataRef.current.tpsWindow = kpiDataRef.current.tpsWindow.filter((ts) => ts > now - tpsWindowMs);
            const tps = kpiDataRef.current.tpsWindow.length / (tpsWindowMs / 1000);

            // G3 fix: bail early when KPI values haven't changed to avoid forced re-renders.
            setKpiMetrics((prev) => {
                const next = {
                    usdmSupply,
                    feeVolume24h: feeVol24hRef.current,
                    appsLive: appsLiveRef.current,
                };
                if (
                    prev.usdmSupply === next.usdmSupply &&
                    prev.feeVolume24h === next.feeVolume24h &&
                    prev.appsLive === next.appsLive
                )
                    return prev;
                return next;
            });

            if (lats.length === 0) {
                // G3 fix: only update if any of the counters actually changed.
                setMetrics((prev) => {
                    const netTps = tps.toFixed(1);
                    if (
                        prev.liveUpdates === c.liveUpdates &&
                        prev.ohlcvPoints === candles.length &&
                        prev.whaleCount === c.whaleCount &&
                        prev.networkTps === netTps
                    )
                        return prev;
                    return {
                        ...prev,
                        liveUpdates: c.liveUpdates,
                        ohlcvPoints: candles.length,
                        whaleCount: c.whaleCount,
                        networkTps: netTps,
                    };
                });
                return;
            }

            const sorted = [...lats].sort((a, b) => a - b);
            const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length;
            const elapsed = c.startTime ? (Date.now() - c.startTime) / 1000 : 0;
            const rate = elapsed > 0 ? (c.totalMessages / elapsed).toFixed(1) : "0";

            // Calculate average gas
            const gasVals = gasUsageRef.current;
            const avgGas = gasVals.length > 0 ? gasVals.reduce((s, v) => s + v, 0) / gasVals.length : 0;

            // G3 fix: bail early when no metric value changed to avoid forced re-renders.
            setMetrics((prev) => {
                const next: MetricsDisplay = {
                    avgLatency: Math.round(avg),
                    throughput: rate,
                    barWidth: avg < 50 ? Math.min(100, (1 - avg / 50) * 100) : 0,
                    showSubLabel: avg < 50,
                    speedup: avg < 100 ? `${Math.round(100 / avg)}X FASTER` : "",
                    uptime: walletStatus === "connected" ? "99.8%" : "--",
                    liveUpdates: c.liveUpdates,
                    ohlcvPoints: candles.length,
                    whaleCount: c.whaleCount,
                    avgGas: Math.round(avgGas),
                    networkTps: tps.toFixed(1),
                };
                if (
                    prev.avgLatency === next.avgLatency &&
                    prev.throughput === next.throughput &&
                    prev.liveUpdates === next.liveUpdates &&
                    prev.ohlcvPoints === next.ohlcvPoints &&
                    prev.whaleCount === next.whaleCount &&
                    prev.networkTps === next.networkTps
                )
                    return prev;
                return next;
            });
        }, 250); // G3 fix: 250ms (4 Hz) instead of 100ms (10 Hz)
        return () => clearInterval(interval);
    }, [usdmSupply, supplyStatus, walletStatus, candles.length]);

    // Add pairs (from CSV or watch)
    const addPairs = useCallback((newPairsToAdd: Pair[]) => {
        setPairs((prev) => {
            const existing = new Set(prev.map((p) => p.pairAddress.toLowerCase()));
            const toAdd = newPairsToAdd.filter((p) => !existing.has(p.pairAddress.toLowerCase()));
            if (toAdd.length === 0) return prev;
            for (const p of toAdd) {
                pairTxsRef.current.set(p.pairAddress.toLowerCase(), []);
                pairTxHashesRef.current.set(p.pairAddress.toLowerCase(), new Set<string>());
            }
            return [...prev, ...toAdd];
        });
    }, []);

    // Watch a new pair from the stream
    const watchNewPair = useCallback(
        (pairAddress: string) => {
            const np = newPairs.find((p) => p.pair_address === pairAddress);
            if (!np) return;
            addPairs([
                {
                    pairAddress: np.pair_address,
                    token0: np.base_token?.contract_ticker_symbol || "???",
                    token1: np.quote_token?.contract_ticker_symbol || "???",
                    dex: np.protocol || "DEX",
                    addedAt: Date.now(),
                    pairedAt: new Date(np.block_signed_at).getTime(),
                    txCount: 0,
                    lastTx: null,
                    liquidity: np.liquidity,
                    market_cap: np.market_cap,
                    quote_rate_usd: np.quote_rate_usd,
                    base_token_address: np.base_token?.contract_address,
                },
            ]);
        },
        [newPairs, addPairs]
    );

    // Unwatch a pair (animate out, then remove from watchlist)
    const unwatchPair = useCallback(
        (pairAddress: string) => {
            const key = pairAddress.toLowerCase();
            setLeavingPairs((prev) => new Set(prev).add(key));
            // Cancel any pending unwatch timer before starting a new one,
            // and store the ID so the cleanup effect can clear it on unmount.
            if (unwatchTimerRef.current) clearTimeout(unwatchTimerRef.current);
            unwatchTimerRef.current = setTimeout(() => {
                unwatchTimerRef.current = null;
                setPairs((prev) => prev.filter((p) => p.pairAddress.toLowerCase() !== key));
                pairTxsRef.current.delete(key);
                pairMetricsRef.current.delete(key);
                pairTxHashesRef.current.delete(key);
                setLeavingPairs((prev) => {
                    const s = new Set(prev);
                    s.delete(key);
                    return s;
                });
                if (selectedPairAddress === key) {
                    deselectPair();
                }
            }, 200);
        },
        [selectedPairAddress, deselectPair]
    );

    // Copy address to clipboard with visual feedback
    const handleCopy = useCallback(async (address: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const success = await copyToClipboard(address);
        if (success) {
            setCopiedAddress(address);
            if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
            copyTimerRef.current = setTimeout(() => {
                copyTimerRef.current = null;
                setCopiedAddress(null);
            }, 2000);
        }
    }, []);

    // G2 fix: memoize — eliminates O(n) find on every render (>10×/s with live updates).
    const selectedPair = useMemo(
        () => pairs.find((p) => p.pairAddress.toLowerCase() === selectedPairAddress) ?? null,
        [pairs, selectedPairAddress]
    );

    const selectedNewPairData = useMemo(
        () =>
            selectedPairAddress
                ? (newPairs.find((np) => np.pair_address.toLowerCase() === selectedPairAddress) ?? null)
                : null,
        [newPairs, selectedPairAddress]
    );

    // Dynamic page title — live price when focused, ticker scroll when tab is hidden.
    const TITLE_SUFFIX = `${chainLabel} Live DEX Activity`;
    const BASE_TITLE = TITLE_SUFFIX;
    const titleRef = useRef(BASE_TITLE); // current "full" title string
    const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const tickerOffsetRef = useRef(0);

    // Build the static title + meta description whenever pair/candle data changes (Option 3)
    useEffect(() => {
        let title = BASE_TITLE;
        let description = `Real-time DEX pair discovery, OHLCV charting, and transaction streaming on ${chainLabel}. Powered by GoldRush.`;
        const path = selectedPairAddress ? `/${chainSlug}/${selectedPairAddress}` : `/${chainSlug}`;
        let pairLabel = "";
        if (selectedPair) {
            pairLabel = `${selectedPair.token0}/${selectedPair.token1}`;
            if (candles.length > 0) {
                const last = candles[candles.length - 1];
                const price = last != null && last.close != null ? formatUSD(last.close) : "";
                title = price ? `${pairLabel} ${price} — ${TITLE_SUFFIX}` : `${pairLabel} — ${TITLE_SUFFIX}`;
            } else if (ohlcvLoading) {
                title = `${pairLabel} ⏳ — ${TITLE_SUFFIX}`;
            } else {
                title = `${pairLabel} — ${TITLE_SUFFIX}`;
            }
            description = `Live price chart and trades for ${pairLabel} on ${chainLabel}. Powered by GoldRush.`;
        }
        titleRef.current = title;
        const breadcrumbItems: object[] = [
            { "@type": "ListItem", position: 1, name: "GoldRush DEX", item: "https://dex.goldrush.dev" },
            { "@type": "ListItem", position: 2, name: chainLabel, item: `https://dex.goldrush.dev/${chainSlug}` },
        ];
        if (pairLabel) {
            breadcrumbItems.push({
                "@type": "ListItem",
                position: 3,
                name: pairLabel,
                item: `https://dex.goldrush.dev${path}`,
            });
        }
        // If tab is visible, apply immediately
        if (!document.hidden) {
            setPageMeta(title, description, {
                path,
                jsonLd: {
                    "@context": "https://schema.org",
                    "@type": "WebPage",
                    name: title,
                    url: `https://dex.goldrush.dev${path}`,
                    breadcrumb: { "@type": "BreadcrumbList", itemListElement: breadcrumbItems },
                },
            });
        }
        return () => {
            titleRef.current = BASE_TITLE;
            resetPageMeta();
        };
    }, [selectedPair, candles, ohlcvLoading]);

    // Reset to AUTO when pair changes — hook will pick the fastest available interval
    useEffect(() => {
        setChartInterval(null);
    }, [selectedPairAddress]);

    // Ticker scroll when tab is hidden (Option 1) — rotates the title so price
    // changes are visible even in a narrow tab strip.
    useEffect(() => {
        function startTicker() {
            if (tickerRef.current) return;
            tickerOffsetRef.current = 0;
            tickerRef.current = setInterval(() => {
                const full = titleRef.current;
                if (full.length <= 20) {
                    document.title = full;
                    return;
                }
                const padded = full + "   ·   ";
                const offset = tickerOffsetRef.current % padded.length;
                document.title = padded.slice(offset) + padded.slice(0, offset);
                tickerOffsetRef.current++;
            }, 350);
        }
        function stopTicker() {
            if (tickerRef.current) {
                clearInterval(tickerRef.current);
                tickerRef.current = null;
            }
            tickerOffsetRef.current = 0;
            document.title = titleRef.current;
        }
        function onVisibilityChange() {
            if (document.hidden) startTicker();
            else stopTicker();
        }
        // If already hidden on mount, start immediately
        if (document.hidden) startTicker();
        document.addEventListener("visibilitychange", onVisibilityChange);
        return () => {
            document.removeEventListener("visibilitychange", onVisibilityChange);
            stopTicker();
        };
    }, []);

    // Top pairs with search filtering and sorting
    const topPairs = useMemo(() => {
        // If user is searching and have API results, prioritize those
        if (searchQuery.trim() && searchResults.length > 0) {
            // Convert search results to Pair format for display
            return searchResults.slice(0, 10);
        }

        // Start with local pairs
        let filtered = pairs;

        // If searching, filter local pairs by query
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = pairs.filter((pair) => {
                const token0Lower = pair.token0.toLowerCase();
                const token1Lower = pair.token1.toLowerCase();
                const dexLower = pair.dex.toLowerCase();
                const addressLower = pair.pairAddress.toLowerCase();

                return (
                    token0Lower.includes(query) ||
                    token1Lower.includes(query) ||
                    dexLower.includes(query) ||
                    addressLower.includes(query)
                );
            });
        }

        // Apply sorting to filtered results
        const sorted = [...filtered];
        switch (sortBy) {
            case "txCount":
                sorted.sort((a, b) => b.txCount - a.txCount);
                break;
            case "age":
                sorted.sort((a, b) => a.addedAt - b.addedAt); // Oldest first
                break;
            case "token":
                sorted.sort((a, b) => {
                    const aName = `${a.token0}/${a.token1}`.toLowerCase();
                    const bName = `${b.token0}/${b.token1}`.toLowerCase();
                    return aName.localeCompare(bName);
                });
                break;
            case "dex":
                sorted.sort((a, b) => a.dex.localeCompare(b.dex));
                break;
            case "liquidity":
                sorted.sort((a, b) => (b.liquidity ?? 0) - (a.liquidity ?? 0));
                break;
            case "marketCap":
                sorted.sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0));
                break;
            case "price":
                sorted.sort((a, b) => (b.quote_rate_usd ?? 0) - (a.quote_rate_usd ?? 0));
                break;
        }

        return sorted.slice(0, 10);
    }, [pairs, searchQuery, searchResults, sortBy]);

    // Reset keyboard focus when watchlist is re-sorted or search results change
    useEffect(() => {
        setFocusedPairIndex(-1);
    }, [topPairs.length]);

    useKeyboardShortcuts({
        topPairs: topPairs as Array<Pair | TokenSearchResult>,
        activeGemTab,
        setActiveGemTab,
        selectedTimeframe,
        setSelectedTimeframe,
        focusedPairIndex,
        setFocusedPairIndex,
        selectPair,
        unwatchPair,
        exportPairs: () => exportData(pairs),
        setPaletteOpen,
        paletteOpen,
        setShortcutsOpen,
        shortcutsOpen,
    });

    // VOL column: accumulate volume_usd from OHLCV candles per pair (sum across all candles).
    // Only populated for pairs the user has viewed, but better than "—" for those pairs.
    const [pairVolume, setPairVolume] = useState<Map<string, number>>(new Map());
    useEffect(() => {
        if (!selectedPairAddress || candles.length === 0) return;
        const total = candles.reduce((sum, c) => sum + (c.volume_usd ?? 0), 0);
        if (total > 0) {
            setPairVolume((prev) => {
                const next = new Map(prev);
                next.set(selectedPairAddress, total);
                return next;
            });
        }
    }, [candles, selectedPairAddress]);

    // vol24h and makers24h per pair — both derived from the updatePairs stream timeframe data.
    // stream_vol_24h / stream_makers_24h are written by handlePairUpdates and persisted
    // in the newPairs localStorage cache, so they survive page reloads instantly.
    const { vol24hByAddr, makersByAddr } = useMemo(() => {
        const vols = new Map<string, number>();
        const makers = new Map<string, number>();
        for (const np of newPairs) {
            const addr = np.pair_address.toLowerCase();
            // VOL: prefer 24h, fall back to 1h for pairs <24h old, then legacy field
            const vol =
                (np.stream_vol_24h ?? 0) > 0
                    ? np.stream_vol_24h!
                    : (np.stream_vol_1h ?? 0) > 0
                      ? np.stream_vol_1h!
                      : (np.volume_usd ?? 0) > 0
                        ? np.volume_usd!
                        : null;
            if (vol != null) vols.set(addr, vol);
            // MAKERS: prefer 24h, fall back to 1h
            const mkr =
                (np.stream_makers_24h ?? 0) > 0
                    ? np.stream_makers_24h!
                    : (np.stream_makers_1h ?? 0) > 0
                      ? np.stream_makers_1h!
                      : null;
            if (mkr != null) makers.set(addr, mkr);
        }
        // Spot-price API volumes overwrite stream (CDN-cached REST, limited MegaETH coverage)
        for (const [addr, vol] of spotVolumes) {
            if (vol > 0) vols.set(addr, vol);
        }
        // OHLCV-derived volume (sum of candles for viewed pairs) as last-resort fallback
        for (const [addr, vol] of pairVolume) {
            if (vol > 0 && !vols.has(addr)) vols.set(addr, vol);
        }
        // Wallet-stream makers as fallback for pairs not yet updated by updatePairs
        for (const [addr, count] of makersRef.current) {
            if (!makers.has(addr)) makers.set(addr, count);
        }
        return { vol24hByAddr: vols, makersByAddr: makers };
    }, [newPairs, spotVolumes, pairVolume]);

    // Filtered new pairs based on search query and minimum liquidity
    const filteredNewPairs = useMemo(() => {
        let filtered = newPairs;

        // Apply liquidity filter when set
        if (minLiquidity > 0) {
            filtered = filtered.filter((np) => (np.liquidity ?? 0) >= minLiquidity);
        }

        if (!searchQuery.trim()) {
            return filtered;
        }

        const query = searchQuery.toLowerCase();
        return filtered.filter((np) => {
            const baseSymbol = np.base_token?.contract_ticker_symbol?.toLowerCase() || "";
            const quoteSymbol = np.quote_token?.contract_ticker_symbol?.toLowerCase() || "";
            const baseName = np.base_token?.contract_name?.toLowerCase() || "";
            const quoteName = np.quote_token?.contract_name?.toLowerCase() || "";
            const pairAddr = np.pair_address.toLowerCase();
            const protocol = (np.protocol || "").toLowerCase();

            return (
                baseSymbol.includes(query) ||
                quoteSymbol.includes(query) ||
                baseName.includes(query) ||
                quoteName.includes(query) ||
                pairAddr.includes(query) ||
                protocol.includes(query)
            );
        });
    }, [newPairs, searchQuery, minLiquidity]);

    // Filter whale txs by current threshold (for re-filtering when threshold changes)
    // Always show swaps regardless of threshold
    const filteredWhaleTxs = useMemo(
        () => whaleTxs.filter((w) => w.type === "swap" || w.usdValue >= whaleThreshold),
        [whaleTxs, whaleThreshold]
    );

    return (
        <>
            {/* Header */}
            <div className="header">
                <div className="header-left">
                    <span className="header-title">{chainLabel.toUpperCase()} DEX &bull; LIVE</span>
                    <select
                        className="chain-select"
                        value={activeChainGql}
                        onChange={(e) => setActiveChainGql(e.target.value)}
                        title="Switch chain"
                        aria-label="Select chain"
                    >
                        {SUPPORTED_CHAINS.map((c) => (
                            <option key={c.gqlName} value={c.gqlName}>
                                {c.displayName.toUpperCase()}
                            </option>
                        ))}
                    </select>
                    <span className="header-badge">
                        <span className="status-dot connected" /> STREAMING
                    </span>
                </div>
                <div className="header-actions">
                    <a href={`/${chainSlug}/lp`} className="header-btn header-btn--lp" title="Try LP Analyzer">
                        <Layers size={12} />
                        LP
                    </a>
                    <button
                        className="header-btn header-btn--kbd"
                        onClick={() => setPaletteOpen(true)}
                        title="Open command palette (⌘K / Ctrl+K)"
                        aria-label="Open command palette"
                    >
                        {isMac ? "⌘K" : "Ctrl+K"}
                    </button>
                    <span
                        className="btn-tooltip-wrap"
                        title={pairs.length === 0 ? "Add a pair to watchlist before exporting" : undefined}
                    >
                        <button
                            className="header-btn"
                            onClick={() => exportData(pairs)}
                            disabled={pairs.length === 0}
                            title={pairs.length === 0 ? undefined : "Export watchlist as CSV"}
                            aria-label="Export watchlist as CSV"
                        >
                            <Download size={14} />
                        </button>
                    </span>
                    <button
                        className="header-btn"
                        onClick={() => setShortcutsOpen(true)}
                        title="Keyboard shortcuts"
                        aria-label="Show keyboard shortcuts"
                    >
                        <Keyboard size={14} />
                    </button>
                    <a
                        href="https://goldrush.dev/docs"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="header-btn"
                    >
                        <ExternalLink size={14} />
                    </a>
                </div>
            </div>

            {/* Main Grid */}
            <div className="main-grid">
                <div className="col-left">
                    {/* Discovery Panel */}
                    <div className="panel new-pairs">
                        <div className="gem-tabs">
                            <span
                                className={`status-dot gem-tab-status ${newPairsStatus === "connected" && updatePairsStatus === "connected" ? "connected" : newPairsStatus === "error" || updatePairsStatus === "error" ? "error" : newPairsStatus}`}
                            />
                            {GEM_TABS.map((tab) => (
                                <button
                                    key={tab.key}
                                    className={`gem-tab ${activeGemTab === tab.key ? "active" : ""}`}
                                    onClick={() => setActiveGemTab(tab.key)}
                                    title={tab.tooltip}
                                >
                                    {tab.key !== "new" && <tab.Icon size={12} className="gem-tab-icon" />} {tab.label}
                                </button>
                            ))}
                            <div className="gem-tabs-controls">
                                {activeGemTab === "new" ? (
                                    <>
                                        <select
                                            className="liq-filter-select"
                                            value={minLiquidity}
                                            onChange={(e) => setMinLiquidity(Number(e.target.value))}
                                            title="Minimum liquidity filter"
                                        >
                                            <option value={0}>ALL LIQ</option>
                                            <option value={1000}>≥$1K</option>
                                            <option value={10000}>≥$10K</option>
                                            <option value={100000}>≥$100K</option>
                                        </select>
                                        <span className="new-pairs-count">
                                            {filteredNewPairs.length}
                                            {minLiquidity > 0 && newPairs.length !== filteredNewPairs.length && (
                                                <span className="new-pairs-count-total"> / {newPairs.length}</span>
                                            )}
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <span className="time-select-label">created within</span>
                                        <select
                                            className="time-select"
                                            value={selectedTimeframe}
                                            onChange={(e) => setSelectedTimeframe(e.target.value as GemTimeframe)}
                                        >
                                            <option value="1h">1H</option>
                                            <option value="24h">24H</option>
                                        </select>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="panel-body">
                            {activeGemTab !== "new" ? (
                                <div className="gem-content">
                                    {(() => {
                                        // Use live data if available; fall back to cached results so tabs
                                        // are always populated instantly on load.
                                        const displayedGems =
                                            gemsData.length > 0
                                                ? gemsData
                                                : ((gemResultsCache[activeGemTab] ?? []) as typeof gemsData);
                                        return displayedGems.length === 0 ? (
                                            newPairs.length === 0 && isChainSwitching ? (
                                                <div className="gem-loading">
                                                    <div className="gem-loading-ring" />
                                                    <span>SCANNING PAIRS...</span>
                                                </div>
                                            ) : (
                                                <span className="gem-empty">
                                                    {getEmptyTabLabel(activeGemTab, selectedTimeframe)}
                                                </span>
                                            )
                                        ) : (
                                            <div className="gem-table">
                                                <div className="gem-table-header">
                                                    <span>PAIR</span>
                                                    <span>PRICE</span>
                                                    <span>
                                                        {activeGemTab === "momentum"
                                                            ? "SWAPS"
                                                            : activeGemTab === "spikes"
                                                              ? "MOVE"
                                                              : "CHANGE"}
                                                    </span>
                                                    <span>LIQ</span>
                                                    <span>MCAP</span>
                                                    <span>SAFE</span>
                                                    <span />
                                                </div>
                                                <div>
                                                    {displayedGems.map((gem) => {
                                                        const symbol = `${gem.base_token_symbol}/${gem.quote_token_symbol}`;
                                                        const g = gem as {
                                                            price_usd?: number;
                                                            pct_change?: number | null;
                                                            pct_change_1h?: number;
                                                            activity_count?: number | null;
                                                            activity_vol?: number | null;
                                                        };
                                                        // MOMENTUM: show swap count (or vol fallback) in the metric cell.
                                                        // SPIKES: absolute move. GAINERS/LOSERS: signed pct_change.
                                                        let metricValue: string;
                                                        let metricClass = "";
                                                        if (activeGemTab === "momentum") {
                                                            if (g.activity_count != null) {
                                                                metricValue = `${Math.round(g.activity_count)} swaps`;
                                                                metricClass = "gem-muted";
                                                            } else if (g.activity_vol != null) {
                                                                metricValue = formatUSD(g.activity_vol);
                                                                metricClass = "gem-muted";
                                                            } else {
                                                                metricValue = "—";
                                                                metricClass = "gem-muted";
                                                            }
                                                        } else {
                                                            const rawPct =
                                                                activeGemTab === "spikes"
                                                                    ? (g.pct_change_1h ?? null)
                                                                    : (g.pct_change ?? null);
                                                            if (rawPct == null) {
                                                                metricValue = "—";
                                                            } else {
                                                                const sign = rawPct >= 0 ? "+" : "";
                                                                metricValue = `${sign}${rawPct.toFixed(2)}%`;
                                                            }
                                                            metricClass = "gem-muted";
                                                        }
                                                        const priceVal = g.price_usd ?? 0;
                                                        const gemExplorerUrl = getExplorerUrl(
                                                            activeChainGql,
                                                            gem.pair_address,
                                                            "address"
                                                        );
                                                        const gemNp = newPairs.find(
                                                            (np) =>
                                                                np.pair_address.toLowerCase() ===
                                                                gem.pair_address.toLowerCase()
                                                        );
                                                        const gemIsWatched = pairs.some(
                                                            (p) =>
                                                                p.pairAddress.toLowerCase() ===
                                                                gem.pair_address.toLowerCase()
                                                        );
                                                        return (
                                                            <div
                                                                key={gem.pair_address}
                                                                className={
                                                                    selectedPairAddress ===
                                                                    gem.pair_address.toLowerCase()
                                                                        ? "gem-row gem-row-active"
                                                                        : "gem-row"
                                                                }
                                                                onClick={() => {
                                                                    watchNewPair(gem.pair_address);
                                                                    selectPair(gem.pair_address);
                                                                }}
                                                            >
                                                                <span className="pair-tokens" title={gem.pair_address}>
                                                                    {symbol}
                                                                    <button
                                                                        className="copy-btn"
                                                                        onClick={(e) => handleCopy(gem.pair_address, e)}
                                                                        title={
                                                                            copiedAddress === gem.pair_address
                                                                                ? "Copied!"
                                                                                : "Copy address"
                                                                        }
                                                                    >
                                                                        {copiedAddress === gem.pair_address ? (
                                                                            <Check size={10} />
                                                                        ) : (
                                                                            <Copy size={10} />
                                                                        )}
                                                                    </button>
                                                                </span>
                                                                <span className="gem-price">
                                                                    <PriceDisplay
                                                                        value={priceVal > 0 ? priceVal : null}
                                                                    />
                                                                </span>
                                                                <span className={metricClass}>{metricValue}</span>
                                                                <span className="gem-muted">
                                                                    {formatUSD(gem.liquidity_usd)}
                                                                </span>
                                                                <span className="gem-muted">
                                                                    {formatUSD(gem.marketcap_usd)}
                                                                </span>
                                                                <span
                                                                    className="gem-safe"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    {gemNp && (
                                                                        <SafetyBadgeRow
                                                                            pairData={gemNp}
                                                                            chainName={activeChainGql}
                                                                            metrics={pairMetricsRef.current.get(
                                                                                gem.pair_address.toLowerCase()
                                                                            )}
                                                                            isWatched={gemIsWatched}
                                                                            onAlert={handleSafetyAlert}
                                                                            onOpen={() =>
                                                                                setSafetyPairAddress(gem.pair_address)
                                                                            }
                                                                        />
                                                                    )}
                                                                </span>
                                                                <span
                                                                    className="gem-actions"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    {gemExplorerUrl && (
                                                                        <a
                                                                            href={gemExplorerUrl}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className="explorer-link"
                                                                            title="View on block explorer"
                                                                        >
                                                                            <ExternalLink size={10} />
                                                                        </a>
                                                                    )}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            ) : filteredNewPairs.length === 0 ? (
                                <div className="panel-empty">
                                    <span className="panel-empty-text">
                                        {searchQuery.trim()
                                            ? "NO MATCHING NEW PAIRS"
                                            : `WAITING FOR NEW PAIRS ON ${chainLabel.toUpperCase()}...`}
                                    </span>
                                </div>
                            ) : (
                                <>
                                    <div className="new-pair-list-header">
                                        <span>PAIR</span>
                                        <span>PRICE</span>
                                        <span>AGE</span>
                                        <span>LIQ</span>
                                        <span>MCAP</span>
                                        <span>SAFE</span>
                                    </div>
                                    {filteredNewPairs.map((np) => {
                                        const baseSymbol = np.base_token?.contract_ticker_symbol || "???";
                                        const quoteSymbol = np.quote_token?.contract_ticker_symbol || "???";
                                        const age = getTimeAgo(new Date(np.block_signed_at).getTime());
                                        const liq = formatMetricOrPending(np.liquidity);
                                        const mcap = formatMetricOrPending(np.market_cap);
                                        const isWatched = pairs.some(
                                            (p) => p.pairAddress.toLowerCase() === np.pair_address.toLowerCase()
                                        );
                                        const protocol = np.protocol || np.protocol_version || "DEX";
                                        const explorerUrl = getExplorerUrl(np.chain_name, np.pair_address, "address");
                                        const isUpdated = updatedPairs.has(np.pair_address.toLowerCase());

                                        return (
                                            <div
                                                className={`new-pair-row${isWatched ? " watching" : ""}`}
                                                key={np.pair_address}
                                                title={
                                                    isWatched ? "Click to view chart" : "Click to watch & view chart"
                                                }
                                                onClick={() => {
                                                    if (!isWatched) {
                                                        watchNewPair(np.pair_address);
                                                    }
                                                    selectPair(np.pair_address);
                                                }}
                                            >
                                                <span className="new-pair-token-col">
                                                    <span className="pair-tokens">
                                                        {baseSymbol}/{quoteSymbol}
                                                    </span>
                                                    <span className="new-pair-protocol">{protocol}</span>
                                                    <button
                                                        className="copy-btn"
                                                        onClick={(e) => handleCopy(np.pair_address, e)}
                                                        title={
                                                            copiedAddress === np.pair_address
                                                                ? "Copied!"
                                                                : "Copy address"
                                                        }
                                                    >
                                                        {copiedAddress === np.pair_address ? (
                                                            <Check size={10} />
                                                        ) : (
                                                            <Copy size={10} />
                                                        )}
                                                    </button>
                                                    {explorerUrl && (
                                                        <a
                                                            href={explorerUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="explorer-link"
                                                            onClick={(e) => e.stopPropagation()}
                                                            title="View on block explorer"
                                                        >
                                                            <ExternalLink size={12} />
                                                        </a>
                                                    )}
                                                </span>
                                                <span
                                                    className={`new-pair-price${isUpdated ? " value-flash" : ""}`}
                                                    title="Price"
                                                >
                                                    <PriceDisplay value={np.quote_rate_usd} />
                                                </span>
                                                <span className="pair-age">{age}</span>
                                                <span
                                                    className={`new-pair-liq${isUpdated ? " value-flash" : ""}`}
                                                    title="Liquidity"
                                                >
                                                    {liq}
                                                </span>
                                                <span
                                                    className={`new-pair-mcap${isUpdated ? " value-flash" : ""}`}
                                                    title="Market Cap"
                                                >
                                                    {mcap}
                                                </span>
                                                <SafetyBadgeRow
                                                    pairData={np}
                                                    chainName={activeChainGql}
                                                    metrics={pairMetricsRef.current.get(np.pair_address.toLowerCase())}
                                                    isWatched={isWatched}
                                                    onAlert={handleSafetyAlert}
                                                    onOpen={() => setSafetyPairAddress(np.pair_address)}
                                                />
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Top Pairs Panel */}
                    <div className="panel top-pairs">
                        <div className="panel-header">
                            <span>WATCH_LIST</span>
                            <div className="sort-controls">
                                <ArrowUpDown size={12} className="sort-icon" />
                                <select
                                    className="sort-select"
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                                >
                                    <option value="txCount">TX COUNT</option>
                                    <option value="age">AGE</option>
                                    <option value="token">TOKEN</option>
                                    <option value="dex">DEX</option>
                                    <option value="liquidity">LIQUIDITY</option>
                                    <option value="marketCap">MARKET CAP</option>
                                    <option value="price">PRICE</option>
                                </select>
                            </div>
                        </div>
                        <div className="panel-body">
                            {isSearching ? (
                                <div className="panel-empty">
                                    <span className="panel-empty-text">SEARCHING...</span>
                                </div>
                            ) : topPairs.length === 0 ? (
                                <div className="panel-empty">
                                    <span className="panel-empty-text">
                                        {searchQuery.trim() ? (
                                            "NO RESULTS FOUND"
                                        ) : (
                                            <>
                                                ← CLICK ANY NEW PAIR TO START WATCHING
                                                <br />
                                                <span className="panel-empty-hint">OR SEARCH BY TOKEN NAME ABOVE</span>
                                                <br />
                                                <span className="panel-empty-hint">⌘K / CTRL+K — COMMAND PALETTE</span>
                                            </>
                                        )}
                                    </span>
                                </div>
                            ) : (
                                <>
                                    <div className="watchlist-header">
                                        <span>PAIR</span>
                                        <span>PRICE</span>
                                        <span>AGE</span>
                                        <span>LIQ</span>
                                        <span>MCAP</span>
                                        <span>VOL</span>
                                        <span>MAKERS</span>
                                        <span>SAFE</span>
                                        <span />
                                    </div>
                                    {topPairs.map((item, i) => {
                                        // Handle both Pair and TokenSearchResult types
                                        const isSearchResult = "base_token" in item;
                                        const pairAddress = isSearchResult ? item.pair_address : item.pairAddress;
                                        // For watchlist items with empty token names (old localStorage cache),
                                        // look up the live stream data for real names.
                                        const npFallback =
                                            !isSearchResult && (!item.token0 || !item.token1)
                                                ? newPairs.find(
                                                      (np) =>
                                                          np.pair_address.toLowerCase() === pairAddress.toLowerCase()
                                                  )
                                                : null;
                                        const token0 = isSearchResult
                                            ? item.base_token.contract_ticker_symbol
                                            : item.token0 || npFallback?.base_token?.contract_ticker_symbol || "";
                                        const token1 = isSearchResult
                                            ? item.quote_token.contract_ticker_symbol
                                            : item.token1 || npFallback?.quote_token?.contract_ticker_symbol || "";
                                        const liq = isSearchResult ? item.quote_rate : item.liquidity;
                                        const mcap = isSearchResult ? item.market_cap : item.market_cap;
                                        const price = isSearchResult ? item.quote_rate_usd : item.quote_rate_usd;
                                        const addedAt = isSearchResult ? Date.now() : item.addedAt;
                                        const dex = isSearchResult ? item.chain : item.dex;
                                        const pairAge = isSearchResult ? addedAt : (item.pairedAt ?? addedAt);
                                        const isFlashing = updatedPairs.has(pairAddress.toLowerCase());

                                        const explorerChain = isSearchResult ? item.chain : activeChainGql;
                                        const explorerUrl = getExplorerUrl(explorerChain, pairAddress, "address");

                                        const isWatched = pairs.some(
                                            (p) => p.pairAddress.toLowerCase() === pairAddress.toLowerCase()
                                        );
                                        const isLeaving = leavingPairs.has(pairAddress.toLowerCase());
                                        const watchlistItem = isSearchResult ? null : item;
                                        const wlVol = vol24hByAddr.get(pairAddress.toLowerCase());
                                        const wlMakers = watchlistItem?.makers;

                                        return (
                                            <div
                                                className={`pair-row${isLeaving ? " pair-row-leaving" : ""}${selectedPairAddress === pairAddress.toLowerCase() ? " selected" : ""}${i === focusedPairIndex ? " kbd-focused" : ""}`}
                                                key={pairAddress}
                                                ref={
                                                    i === focusedPairIndex
                                                        ? (el) => el?.scrollIntoView({ block: "nearest" })
                                                        : null
                                                }
                                                onClick={() => {
                                                    if (isSearchResult && !isWatched) {
                                                        const searchResult = item;
                                                        addPairs([
                                                            {
                                                                pairAddress: searchResult.pair_address,
                                                                token0: searchResult.base_token.contract_ticker_symbol,
                                                                token1: searchResult.quote_token.contract_ticker_symbol,
                                                                dex: searchResult.chain,
                                                                addedAt: Date.now(),
                                                                txCount: 0,
                                                                lastTx: null,
                                                                market_cap: searchResult.market_cap,
                                                                quote_rate_usd: searchResult.quote_rate_usd,
                                                            },
                                                        ]);
                                                    }
                                                    selectPair(pairAddress);
                                                }}
                                            >
                                                <span className="new-pair-token-col">
                                                    <span className="pair-tokens">
                                                        {token0 && token1
                                                            ? `${token0}/${token1}`
                                                            : shortenAddress(pairAddress)}
                                                    </span>
                                                    <span className="new-pair-protocol">{dex}</span>
                                                    <button
                                                        className="copy-btn"
                                                        onClick={(e) => handleCopy(pairAddress, e)}
                                                        title={
                                                            copiedAddress === pairAddress ? "Copied!" : "Copy address"
                                                        }
                                                    >
                                                        {copiedAddress === pairAddress ? (
                                                            <Check size={10} />
                                                        ) : (
                                                            <Copy size={10} />
                                                        )}
                                                    </button>
                                                    {explorerUrl && (
                                                        <a
                                                            href={explorerUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="explorer-link"
                                                            onClick={(e) => e.stopPropagation()}
                                                            title="View on block explorer"
                                                        >
                                                            <ExternalLink size={12} />
                                                        </a>
                                                    )}
                                                </span>
                                                <span
                                                    className={`new-pair-price${isFlashing ? " value-flash" : ""}`}
                                                    title="Price"
                                                >
                                                    <PriceDisplay value={price} />
                                                </span>
                                                <span className="pair-age">{getTimeAgo(pairAge)}</span>
                                                <span
                                                    className={`new-pair-liq${isFlashing ? " value-flash" : ""}`}
                                                    title="Liquidity"
                                                >
                                                    {formatMetricOrPending(liq)}
                                                </span>
                                                <span
                                                    className={`new-pair-mcap${isFlashing ? " value-flash" : ""}`}
                                                    title="Market Cap"
                                                >
                                                    {formatMetricOrPending(mcap)}
                                                </span>
                                                <span className="pair-vol" title="Volume (USD)">
                                                    {wlVol != null ? (
                                                        formatUSD(wlVol)
                                                    ) : !isSearchResult && watchlistItem?.lastMetricsLoaded !== true ? (
                                                        <span className="cell-skeleton" />
                                                    ) : (
                                                        "—"
                                                    )}
                                                </span>
                                                <span className="pair-makers" title="Unique wallets traded">
                                                    {(() => {
                                                        const makers =
                                                            wlMakers ?? makersByAddr.get(pairAddress.toLowerCase());
                                                        if (makers != null) return makers.toLocaleString();
                                                        if (
                                                            !isSearchResult &&
                                                            watchlistItem?.lastMetricsLoaded !== true
                                                        )
                                                            return <span className="cell-skeleton" />;
                                                        return "—";
                                                    })()}
                                                </span>
                                                <span className="pair-safe-col" onClick={(e) => e.stopPropagation()}>
                                                    {(() => {
                                                        const watchlistNp = newPairs.find(
                                                            (np) =>
                                                                np.pair_address.toLowerCase() ===
                                                                pairAddress.toLowerCase()
                                                        );
                                                        return watchlistNp ? (
                                                            <SafetyBadgeRow
                                                                pairData={watchlistNp}
                                                                chainName={activeChainGql}
                                                                metrics={pairMetricsRef.current.get(
                                                                    pairAddress.toLowerCase()
                                                                )}
                                                                isWatched={true}
                                                                onAlert={handleSafetyAlert}
                                                                onOpen={() => setSafetyPairAddress(pairAddress)}
                                                            />
                                                        ) : null;
                                                    })()}
                                                </span>
                                                <span className="pair-action">
                                                    <button
                                                        className="pair-info-btn"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setDetailPairAddress(pairAddress);
                                                        }}
                                                        title="View pair details"
                                                        aria-label="View pair details"
                                                    >
                                                        <Info size={11} />
                                                    </button>
                                                    {isSearchResult && !isWatched ? (
                                                        <button className="pair-watch-btn" title="Add to watchlist">
                                                            WATCH
                                                        </button>
                                                    ) : (
                                                        <button
                                                            className="pair-watch-btn active"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                unwatchPair(pairAddress);
                                                            }}
                                                            title="Remove from watchlist"
                                                        >
                                                            UNWATCH
                                                        </button>
                                                    )}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="col-right">
                    {/* Chart Panel */}
                    <div className="panel chart-panel">
                        <div className="panel-header">
                            {selectedPairAddress
                                ? selectedPair
                                    ? `${selectedPair.token0}/${selectedPair.token1}`
                                    : shortenAddress(selectedPairAddress)
                                : "CHART"}
                            {selectedPairAddress && (
                                <div className="chart-header-controls">
                                    {/* View toggle: CHART / HOLDERS */}
                                    <div className="chart-view-toggle">
                                        <button
                                            className={`chart-view-btn${chartView === "chart" ? " active" : ""}`}
                                            onClick={() => setChartView("chart")}
                                            title="OHLCV candlestick chart"
                                        >
                                            <ChartCandlestick size={11} />
                                        </button>
                                        {getChainCaps(activeChainGql.replace(/_/g, "-").toLowerCase()).restApi && (
                                            <button
                                                className={`chart-view-btn${chartView === "holders" ? " active" : ""}`}
                                                onClick={() => setChartView("holders")}
                                                title="Live holder bubble map"
                                            >
                                                <Globe size={11} />
                                            </button>
                                        )}
                                        {getChainCaps(activeChainGql.replace(/_/g, "-").toLowerCase()).restApi && (
                                            <button
                                                className={`chart-view-btn${chartView === "lp" ? " active" : ""}`}
                                                onClick={() => setChartView("lp")}
                                                title="Uniswap V3 LP positions"
                                            >
                                                <Layers size={11} />
                                            </button>
                                        )}
                                    </div>
                                    {chartView === "chart" &&
                                        (["1S", "15M", "1M", "1H"] as const).map((tf) => (
                                            <button
                                                key={tf}
                                                className={`chart-tf-btn${
                                                    chartInterval === tf ||
                                                    (chartInterval === null &&
                                                        ohlcvConfig != null &&
                                                        CONFIG_LABEL_TO_TF[ohlcvConfig.label.replace("[T]", "")] === tf)
                                                        ? " active"
                                                        : ""
                                                }`}
                                                onClick={() => setChartInterval(tf)}
                                                disabled={ohlcvLoading}
                                                title={
                                                    ohlcvLoading
                                                        ? "Loading OHLCV data…"
                                                        : tf === "1S"
                                                          ? "1-second candles (1min window)"
                                                          : tf === "15M"
                                                            ? "1-minute candles (15min window)"
                                                            : tf === "1M"
                                                              ? "1-minute candles (1hr window)"
                                                              : "1-hour candles (1day window)"
                                                }
                                            >
                                                {tf}
                                            </button>
                                        ))}
                                    <button
                                        className="chart-action-btn"
                                        onClick={async () => {
                                            const ok = await copyToClipboard(window.location.href);
                                            if (ok) {
                                                setCopiedUrl(true);
                                                if (copiedUrlTimerRef.current) clearTimeout(copiedUrlTimerRef.current);
                                                copiedUrlTimerRef.current = setTimeout(() => {
                                                    copiedUrlTimerRef.current = null;
                                                    setCopiedUrl(false);
                                                }, 2000);
                                            }
                                        }}
                                        title="Copy share link"
                                        aria-label="Copy share link"
                                    >
                                        {copiedUrl ? <Check size={12} /> : <Link2 size={12} />}
                                    </button>
                                    <span
                                        className="btn-tooltip-wrap"
                                        title={
                                            candles.length === 0 && syntheticCandles.length === 0
                                                ? "No candle data to export yet"
                                                : undefined
                                        }
                                    >
                                        <button
                                            className="chart-action-btn"
                                            onClick={() =>
                                                exportOHLCV(
                                                    candles.length > 0 ? candles : syntheticCandles,
                                                    selectedPair
                                                        ? `${selectedPair.token0}-${selectedPair.token1}`
                                                        : (selectedPairAddress ?? "pair")
                                                )
                                            }
                                            title={
                                                candles.length === 0 && syntheticCandles.length === 0
                                                    ? undefined
                                                    : "Export OHLCV as CSV"
                                            }
                                            aria-label="Export OHLCV as CSV"
                                            disabled={candles.length === 0 && syntheticCandles.length === 0}
                                        >
                                            <Download size={12} />
                                        </button>
                                    </span>
                                </div>
                            )}
                        </div>
                        <div className="panel-body">
                            {selectedPairAddress && chartView === "lp" ? (
                                <Suspense fallback={<div className="lp-depth-loading">LOADING LP PANEL...</div>}>
                                    <LPPanel defaultPool={selectedPairAddress} chainName={activeChainGql} />
                                </Suspense>
                            ) : selectedPairAddress && chartView === "holders" ? (
                                <HolderMapPanel
                                    tokenAddress={selectedNewPairData?.base_token?.contract_address}
                                    chainName={activeChainGql}
                                    apiKey={apiKey}
                                    streamUrl={streamUrl}
                                />
                            ) : (
                                <>
                                    {selectedPairAddress && ohlcvLoading && (
                                        <div className="chart-loading-overlay">
                                            <span className="chart-loading-spinner" />
                                        </div>
                                    )}
                                    {selectedPairAddress ? (
                                        (() => {
                                            // Three-tier chart rendering (DexScreener approach):
                                            // 1. Streaming OHLCV candles (primary — from GoldRush WS)
                                            // 2. Synthetic candles bucketed from live updatePairs price ticks
                                            // 3. Empty state (only when truly zero price data available)
                                            const displayCandles = candles.length > 0 ? candles : syntheticCandles;
                                            const isSynthetic = candles.length === 0 && syntheticCandles.length > 0;

                                            if (displayCandles.length > 0) {
                                                return (
                                                    <div
                                                        className={`chart-container${ohlcvLoading ? " chart-container--loading" : ""}`}
                                                    >
                                                        <LightweightChart candles={displayCandles} />
                                                        {!ohlcvLoading && (
                                                            <div
                                                                className="chart-config-badge"
                                                                title={
                                                                    isSynthetic
                                                                        ? "Live price ticks from updatePairs stream bucketed into candles"
                                                                        : ohlcvConfig
                                                                          ? `Interval: ${ohlcvConfig.interval}, Timeframe: ${ohlcvConfig.timeframe}`
                                                                          : undefined
                                                                }
                                                            >
                                                                {isSynthetic
                                                                    ? "PRICE TICKS"
                                                                    : (ohlcvConfig?.label ?? "")}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            }

                                            // Empty state — streaming timed out AND no price ticks yet
                                            return (
                                                <div className="chart-empty">
                                                    <ChartCandlestick
                                                        size={48}
                                                        className={`chart-icon chart-icon--active${!ohlcvNoData && ohlcvConfig ? " chart-icon--searching" : ""}`}
                                                    />
                                                    <span className="chart-empty-text">
                                                        {ohlcvNoData
                                                            ? "WAITING FOR PRICE DATA..."
                                                            : ohlcvConfig
                                                              ? `SEARCHING FOR DATA (${ohlcvConfig.label})...`
                                                              : `LOADING CANDLES FOR ${selectedPair ? `${selectedPair.token0}/${selectedPair.token1}` : shortenAddress(selectedPairAddress)}...`}
                                                    </span>
                                                    {!ohlcvNoData && !ohlcvConfig && (
                                                        <span className="chart-empty-hint">
                                                            CONNECTING TO GOLDRUSH OHLCV STREAM...
                                                        </span>
                                                    )}
                                                    {ohlcvNoData && (
                                                        <span className="chart-empty-hint">
                                                            CHART WILL APPEAR AS SOON AS PRICE UPDATES ARRIVE
                                                        </span>
                                                    )}
                                                    {!ohlcvNoData && ohlcvConfig && (
                                                        <span className="chart-empty-subtext">
                                                            Trying multiple timeframes to find trading history
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })()
                                    ) : (
                                        <div className="chart-empty">
                                            <ChartCandlestick size={48} className="chart-icon" />
                                            <span className="chart-empty-text">SELECT PAIR TO VIEW CHART</span>
                                            <span className="chart-empty-hint">
                                                SELECT A PAIR FROM THE WATCHLIST OR NEW PAIRS PANEL
                                            </span>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Whale Transactions Panel */}
                    {filteredWhaleTxs.length > 0 && (
                        <div className="panel whale-panel">
                            <div className="panel-header">
                                <span>
                                    <Anchor size={14} className="panel-header-icon" />
                                    WHALE_TRANSACTIONS
                                </span>
                                <select
                                    className="whale-threshold-select"
                                    value={whaleThreshold}
                                    onChange={(e) => setWhaleThreshold(Number(e.target.value))}
                                >
                                    <option value={0}>No filter</option>
                                    <option value={1000}>$1,000+</option>
                                    <option value={5000}>$5,000+</option>
                                    <option value={10000}>$10,000+</option>
                                </select>
                            </div>
                            <div className="whale-content">
                                {filteredWhaleTxs.length === 0 ? (
                                    <span className="whale-empty">WAITING FOR WHALE ACTIVITY...</span>
                                ) : (
                                    <table className="whale-table">
                                        <thead>
                                            <tr>
                                                <th>TX HASH</th>
                                                <th>TYPE</th>
                                                <th>FROM</th>
                                                <th>TOKEN</th>
                                                <th>VALUE</th>
                                                <th>AGE</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredWhaleTxs.map((w, i) => {
                                                const TypeIcon = WHALE_TYPE_ICONS[w.type] ?? Zap;
                                                const displayValue = w.usdValue > 0 ? formatUSD(w.usdValue) : "SWAP";
                                                const txExplorerUrl = getExplorerUrl(
                                                    activeChainGql,
                                                    w.tx.tx_hash,
                                                    "tx"
                                                );
                                                const fromAddr = w.tx.from_address;
                                                const fromExplorerUrl = getExplorerUrl(
                                                    activeChainGql,
                                                    fromAddr,
                                                    "address"
                                                );
                                                // Token: for swaps use selected pair's base token, else ETH
                                                const pairToken =
                                                    w.type === "swap"
                                                        ? (newPairs.find(
                                                              (np) =>
                                                                  np.pair_address.toLowerCase() === selectedPairAddress
                                                          )?.base_token?.contract_ticker_symbol ?? "TOKEN")
                                                        : w.token;
                                                return (
                                                    <tr key={`${w.tx.tx_hash}-${i}`}>
                                                        <td>
                                                            {txExplorerUrl ? (
                                                                <a
                                                                    href={txExplorerUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="explorer-link"
                                                                    title={w.tx.tx_hash}
                                                                >
                                                                    {shortenAddress(w.tx.tx_hash)}
                                                                    <ExternalLink size={10} />
                                                                </a>
                                                            ) : (
                                                                <span title={w.tx.tx_hash}>
                                                                    {shortenAddress(w.tx.tx_hash)}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td>
                                                            <span className={`whale-type-badge whale-type--${w.type}`}>
                                                                <TypeIcon size={10} className="whale-type-icon" />
                                                                {w.type.toUpperCase()}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <div className="whale-from">
                                                                {fromExplorerUrl ? (
                                                                    <a
                                                                        href={fromExplorerUrl}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="explorer-link"
                                                                        title={fromAddr}
                                                                    >
                                                                        {shortenAddress(fromAddr, 4, 4)}
                                                                    </a>
                                                                ) : (
                                                                    <span title={fromAddr}>
                                                                        {shortenAddress(fromAddr, 4, 4)}
                                                                    </span>
                                                                )}
                                                                <button
                                                                    className="copy-btn"
                                                                    onClick={(e) => handleCopy(fromAddr, e)}
                                                                    title={
                                                                        copiedAddress === fromAddr
                                                                            ? "Copied!"
                                                                            : "Copy address"
                                                                    }
                                                                >
                                                                    {copiedAddress === fromAddr ? (
                                                                        <Check size={10} />
                                                                    ) : (
                                                                        <Copy size={10} />
                                                                    )}
                                                                </button>
                                                            </div>
                                                        </td>
                                                        <td className="whale-token">{pairToken}</td>
                                                        <td className="whale-value">{displayValue}</td>
                                                        <td>{getTimeAgo(w.receivedAt)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Metrics Panel — MegaETH only */}
                    {activeChain.isMegaeth && (
                        <div className="panel metrics-panel">
                            <div className="panel-header">MEGAETH_METRICS</div>
                            <div className="metrics-grid">
                                {/* MaFiA Apps — unique contracts active in 24h window */}
                                <div className="metric-cell">
                                    <div className="metric-label">MAFIA APPS</div>
                                    <div className="metric-value">5/10</div>
                                </div>

                                {/* USDM Supply — progress toward $500M milestone */}
                                <div className="metric-cell">
                                    <div className="metric-label">USDM SUPPLY</div>
                                    <div className="metric-value">
                                        {kpiMetrics.usdmSupply > 0 ? formatSupply(kpiMetrics.usdmSupply) : "--"}
                                    </div>
                                    <div className="kpi-progress-track">
                                        <div
                                            className="kpi-progress-fill"
                                            style={{
                                                width: `${Math.min((kpiMetrics.usdmSupply / 500_000_000) * 100, 100).toFixed(2)}%`,
                                            }}
                                        />
                                    </div>
                                    <div className="kpi-progress-row">
                                        <span>
                                            {kpiMetrics.usdmSupply > 0
                                                ? `${((kpiMetrics.usdmSupply / 500_000_000) * 100).toFixed(2)}%`
                                                : "0.00%"}
                                        </span>
                                        <span className="kpi-milestone">$500M</span>
                                    </div>
                                </div>

                                {/* Daily Fees — progress toward $50K/day milestone */}
                                <div className="metric-cell">
                                    <div className="metric-label">DAILY FEES</div>
                                    <div className="metric-value">
                                        {kpiMetrics.feeVolume24h > 0 ? formatUSD(kpiMetrics.feeVolume24h) : "--"}
                                    </div>
                                    <div className="kpi-progress-track">
                                        <div
                                            className="kpi-progress-fill"
                                            style={{
                                                width: `${Math.min((kpiMetrics.feeVolume24h / 50_000) * 100, 100).toFixed(2)}%`,
                                            }}
                                        />
                                    </div>
                                    <div className="kpi-progress-row">
                                        <span>
                                            {kpiMetrics.feeVolume24h > 0
                                                ? `${((kpiMetrics.feeVolume24h / 50_000) * 100).toFixed(1)}%`
                                                : "0.0%"}
                                        </span>
                                        <span className="kpi-milestone">$50K</span>
                                    </div>
                                </div>
                            </div>
                            {(metrics.liveUpdates > 0 || metrics.avgLatency > 0) && (
                                <div className="metrics-secondary">
                                    <span>LAT {metrics.avgLatency > 0 ? `${metrics.avgLatency}ms` : "--"}</span>
                                    <span>GAS {metrics.avgGas > 0 ? metrics.avgGas.toLocaleString() : "--"}</span>
                                    <span>UPD {metrics.liveUpdates.toLocaleString()}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="footer">
                POWERED BY <strong>GOLDRUSH</strong>
                <span className="footer-sep">&bull;</span>
                <a href="https://goldrush.dev/docs" target="_blank" rel="noopener noreferrer" className="footer-link">
                    DOCS &rarr;
                </a>
            </div>

            <SafetyAlertsOverlay
                alerts={safetyAlerts}
                onDismiss={dismissSafetyAlert}
                onView={(addr) => {
                    setDetailPairAddress(addr);
                    setSafetyAlerts((prev) => prev.filter((a) => a.pairAddress !== addr));
                }}
            />

            <PairDetailDrawer
                pair={
                    detailPairAddress
                        ? (pairs.find((p) => p.pairAddress.toLowerCase() === detailPairAddress.toLowerCase()) ?? null)
                        : null
                }
                newPairData={
                    detailPairAddress
                        ? (newPairs.find((np) => np.pair_address.toLowerCase() === detailPairAddress.toLowerCase()) ??
                          null)
                        : null
                }
                chainName={activeChainGql}
                onClose={() => setDetailPairAddress(null)}
                onOpenSafety={detailPairAddress ? () => setSafetyPairAddress(detailPairAddress) : undefined}
                metrics={detailPairAddress ? pairMetricsRef.current.get(detailPairAddress.toLowerCase()) : null}
            />

            <SafetyScoreModal
                pairData={
                    safetyPairAddress
                        ? (newPairs.find((np) => np.pair_address.toLowerCase() === safetyPairAddress.toLowerCase()) ??
                          null)
                        : null
                }
                chainName={activeChainGql}
                metrics={safetyPairAddress ? pairMetricsRef.current.get(safetyPairAddress.toLowerCase()) : null}
                onClose={() => setSafetyPairAddress(null)}
            />

            <Suspense fallback={null}>
                <KeyboardShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
            </Suspense>

            <Suspense fallback={null}>
                <CommandPalette
                    open={paletteOpen}
                    onOpenChange={handlePaletteOpenChange}
                    pairs={pairs}
                    newPairs={newPairs}
                    whaleTxs={whaleTxs}
                    setActiveGemTab={setActiveGemTab}
                    setSelectedTimeframe={setSelectedTimeframe}
                    setWhaleThreshold={setWhaleThreshold}
                    selectPair={selectPair}
                    unwatchPair={unwatchPair}
                    exportData={() => exportData(pairs)}
                    selectedPair={selectedPair ?? null}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    searchResults={searchResults}
                    isSearching={isSearching}
                    addPairs={addPairs}
                    chainName={activeChainGql}
                />
            </Suspense>
        </>
    );
}
