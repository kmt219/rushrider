import { setPageMeta, resetPageMeta } from "../../lib/pageMeta";
import { LPFiltersBar } from "./LPFiltersBar";
import type { StatusFilter, SortKey } from "./LPFiltersBar";
import { LPInputBar } from "./LPInputBar";
import { PoolSummaryBar } from "./PoolSummaryBar";
import "./lp.css";
import { useCallback, useEffect, useState, useMemo, lazy, Suspense } from "react";
import { useSearchParams, useParams, useNavigate } from "react-router-dom";

const LP_CHAINS: Array<{ slug: string; label: string; live: boolean }> = [
    { slug: "base", label: "BASE", live: true },
    { slug: "megaeth", label: "MEGAETH", live: false },
    { slug: "bnb", label: "BNB", live: false },
    { slug: "monad", label: "MONAD", live: false },
];

const PositionCard = lazy(() => import("./PositionCard").then((m) => ({ default: m.PositionCard })));
const LiquidityDepthChart = lazy(() =>
    import("./LiquidityDepthChart").then((m) => ({ default: m.LiquidityDepthChart }))
);

const DEMO_POOL = "0xd0b53d9277642d899df5c87a3966a349a798f224";
const DEMO_WALLET = "0x6c331e28b8406da314fbea52a6640787b3827519";

const IS_MOCK = import.meta.env.VITE_LP_MOCK === "true";

interface PoolInfo {
    address: string;
    fee_tier?: string;
    current_tick: number;
    sqrt_price_x96: string;
    current_price_token1_per_token0: string;
    block_number: number;
    block_signed_at?: string;
    token0_symbol?: string;
    token1_symbol?: string;
}

export interface Position {
    token_id: string;
    status: "active" | "closed";
    tick_lower: number;
    tick_upper: number;
    price_lower: string;
    price_upper: string;
    liquidity: string;
    amount0_current: string;
    amount1_current: string;
    amount0_withdrawn: string;
    amount1_withdrawn: string;
    value_usd: string;
    in_range: boolean;
    percent_through_range: number;
    token0_symbol: string;
    token1_symbol: string;
    fees_token0_collected: string;
    fees_token1_collected: string;
    fees_usd_total: string;
    fees_token0_uncollected: string;
    fees_token1_uncollected: string;
    fees_usd_uncollected: string;
    deposit_block: number;
    deposit_tx: string;
    deposit_amount0: string;
    deposit_amount1: string;
    deposit_value_usd: string;
    il_usd: string;
    il_percent: string;
    net_pnl_usd: string;
    fee_apr: string;
    time_in_range_percent: number | null;
}

function safeFloat(s: string | undefined): number {
    const n = parseFloat(s ?? "0");
    return isNaN(n) ? 0 : n;
}

export default function LPDashboard() {
    const { chainName = "base" } = useParams<{ chainName: string }>();
    const [params, setParams] = useSearchParams();
    const navigate = useNavigate();

    const pool = params.get("pool") ?? "";
    const wallet = params.get("wallet") ?? "";
    const block = params.get("block") ?? "";

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [noPositions, setNoPositions] = useState(false);
    const [poolInfo, setPoolInfo] = useState<PoolInfo | null>(null);
    const [positions, setPositions] = useState<Position[]>([]);

    // Filter + sort state
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [sortKey, setSortKey] = useState<SortKey>("newest");
    const [sortDesc, setSortDesc] = useState(true);

    const fetchPositions = useCallback(
        async (p: string, w: string, b: string) => {
            setLoading(true);
            setError(null);
            setNoPositions(false);
            try {
                let data: { pool: PoolInfo; positions: Position[] };

                if (IS_MOCK) {
                    const { MOCK_POSITIONS_RESPONSE } = await import("../../../api/lp/_fixtures");
                    data = MOCK_POSITIONS_RESPONSE as unknown as typeof data;
                } else {
                    const qs = new URLSearchParams({
                        pool: p,
                        wallet: w,
                        chain: `${chainName}-mainnet`,
                    });
                    if (b) qs.set("block", b);
                    const res = await fetch(`/api/lp/positions?${qs}`);
                    const text = await res.text();
                    try {
                        data = JSON.parse(text) as typeof data;
                    } catch {
                        const preview = text.slice(0, 300).replace(/\s+/g, " ");
                        throw new Error(
                            res.status === 404
                                ? "LP API not found (404) — restart pnpm dev after pulling latest changes, or set VITE_LP_MOCK=true to use fixture data"
                                : `LP API error (${res.status.toString()}): ${preview}`
                        );
                    }
                    if (!res.ok) throw new Error((data as { error?: string }).error ?? "Request failed");
                }

                if (!data.pool || (data.positions ?? []).length === 0) {
                    setNoPositions(true);
                    return;
                }
                setPoolInfo(data.pool);
                setPositions(data.positions ?? []);
                // Reset filters on new data load
                setStatusFilter("all");
                setSortKey("newest");
                setSortDesc(true);
            } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
            } finally {
                setLoading(false);
            }
        },
        [chainName]
    );

    useEffect(() => {
        if (pool && wallet) void fetchPositions(pool, wallet, block);
    }, []);

    // Dynamic page title + meta description
    useEffect(() => {
        const chainLabel = LP_CHAINS.find((c) => c.slug === chainName)?.label ?? chainName.toUpperCase();
        const poolParam = pool ? `?pool=${pool}${wallet ? `&wallet=${wallet}` : ""}` : "";
        const lpPath = `/${chainName}/lp${poolParam}`;

        if (poolInfo?.token0_symbol && poolInfo?.token1_symbol) {
            const pair = `${poolInfo.token0_symbol}/${poolInfo.token1_symbol}`;
            const shortWallet = wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : "";
            setPageMeta(
                `${pair} LP on ${chainLabel} — GoldRush DEX`,
                `Uniswap V3 LP positions${shortWallet ? ` for ${shortWallet}` : ""} in the ${pair} pool on ${chainLabel}. Track P&L, fee APR, and impermanent loss. Powered by GoldRush.`,
                {
                    path: lpPath,
                    jsonLd: {
                        "@context": "https://schema.org",
                        "@type": "WebPage",
                        name: `${pair} LP on ${chainLabel} — GoldRush DEX`,
                        url: `https://dex.goldrush.dev${lpPath}`,
                        breadcrumb: {
                            "@type": "BreadcrumbList",
                            itemListElement: [
                                {
                                    "@type": "ListItem",
                                    position: 1,
                                    name: "GoldRush DEX",
                                    item: "https://dex.goldrush.dev",
                                },
                                {
                                    "@type": "ListItem",
                                    position: 2,
                                    name: chainLabel,
                                    item: `https://dex.goldrush.dev/${chainName}`,
                                },
                                {
                                    "@type": "ListItem",
                                    position: 3,
                                    name: "LP Explorer",
                                    item: `https://dex.goldrush.dev/${chainName}/lp`,
                                },
                            ],
                        },
                    },
                }
            );
        } else {
            setPageMeta(
                `${chainLabel} LP Explorer — GoldRush DEX`,
                `Analyze Uniswap V3 liquidity positions on ${chainLabel}. Track P&L, fee APR, and pool depth. Powered by GoldRush.`,
                {
                    path: `/${chainName}/lp`,
                    jsonLd: {
                        "@context": "https://schema.org",
                        "@type": "WebPage",
                        name: `${chainLabel} LP Explorer — GoldRush DEX`,
                        url: `https://dex.goldrush.dev/${chainName}/lp`,
                        breadcrumb: {
                            "@type": "BreadcrumbList",
                            itemListElement: [
                                {
                                    "@type": "ListItem",
                                    position: 1,
                                    name: "GoldRush DEX",
                                    item: "https://dex.goldrush.dev",
                                },
                                {
                                    "@type": "ListItem",
                                    position: 2,
                                    name: chainLabel,
                                    item: `https://dex.goldrush.dev/${chainName}`,
                                },
                                {
                                    "@type": "ListItem",
                                    position: 3,
                                    name: "LP Explorer",
                                    item: `https://dex.goldrush.dev/${chainName}/lp`,
                                },
                            ],
                        },
                    },
                }
            );
        }

        return () => {
            resetPageMeta();
        };
    }, [chainName, poolInfo, wallet, pool]);

    const handleAnalyze = useCallback(
        (p: string, w: string, b: string) => {
            const next = new URLSearchParams({ pool: p, wallet: w });
            if (b) next.set("block", b);
            setParams(next, { replace: true });
            void fetchPositions(p, w, b);
        },
        [fetchPositions, setParams]
    );

    // Derived counts for filter tabs
    const activeCnt = useMemo(() => positions.filter((p) => p.status === "active").length, [positions]);
    const outOfRangeCnt = useMemo(
        () => positions.filter((p) => p.status === "active" && !p.in_range).length,
        [positions]
    );
    const closedCnt = useMemo(() => positions.filter((p) => p.status === "closed").length, [positions]);

    // Filtered + sorted list
    const filteredPositions = useMemo(() => {
        let list = [...positions];

        // Status filter
        if (statusFilter === "active") list = list.filter((p) => p.status === "active");
        else if (statusFilter === "out_of_range") list = list.filter((p) => p.status === "active" && !p.in_range);
        else if (statusFilter === "closed") list = list.filter((p) => p.status === "closed");

        // Sort
        list.sort((a, b) => {
            let av = 0;
            let bv = 0;
            if (sortKey === "net_pnl") {
                av = safeFloat(a.net_pnl_usd);
                bv = safeFloat(b.net_pnl_usd);
            } else if (sortKey === "fees") {
                av = safeFloat(a.fees_usd_total);
                bv = safeFloat(b.fees_usd_total);
            } else if (sortKey === "il") {
                av = Math.abs(safeFloat(a.il_usd));
                bv = Math.abs(safeFloat(b.il_usd));
            } else if (sortKey === "value") {
                av = safeFloat(a.value_usd);
                bv = safeFloat(b.value_usd);
            } else if (sortKey === "newest") {
                av = a.deposit_block;
                bv = b.deposit_block;
            } else if (sortKey === "oldest") {
                av = -a.deposit_block;
                bv = -b.deposit_block;
            }
            return sortDesc ? bv - av : av - bv;
        });

        return list;
    }, [positions, statusFilter, sortKey, sortDesc]);

    const portfolioStats = useMemo(() => {
        if (positions.length === 0) return null;
        const activePositions = positions.filter((p) => p.status === "active");
        const activeCount = activePositions.length;
        const closedCount = positions.length - activeCount;
        const totalValue = activePositions.reduce((s, p) => s + safeFloat(p.value_usd), 0);
        const totalFees = positions.reduce((s, p) => s + safeFloat(p.fees_usd_total), 0);
        const totalPnl = positions.reduce((s, p) => s + safeFloat(p.net_pnl_usd), 0);
        const totalIl = positions.reduce((s, p) => s + safeFloat(p.il_usd), 0);
        // Include all positions (active + closed) that have a measured APR
        const feeAprPositions = positions.filter((p) => safeFloat(p.fee_apr) > 0);
        const avgFeeApr =
            feeAprPositions.length > 0
                ? feeAprPositions.reduce((s, p) => s + safeFloat(p.fee_apr), 0) / feeAprPositions.length
                : 0;
        // At risk: active + (out of range OR negative P&L)
        const atRisk = activePositions.filter((p) => !p.in_range || safeFloat(p.net_pnl_usd) < 0).length;
        return { activeCount, closedCount, totalValue, totalFees, totalPnl, totalIl, avgFeeApr, atRisk };
    }, [positions]);

    const showEmpty = !pool && !wallet && !loading;
    // Check filtered list length so filter tabs don't produce a blank screen
    const showNoResults = !loading && !error && poolInfo !== null && filteredPositions.length === 0;

    return (
        <div className="lp-page">
            <div className="lp-dashboard">
                <div className="lp-dashboard-inner">
                    <div className="lp-header">
                        <button
                            className="lp-back-btn"
                            onClick={() => {
                                void navigate(`/${chainName}`);
                            }}
                            title="Back to DEX"
                        >
                            <span className="lp-back-arrow">←</span>
                            DEX
                        </button>
                        <span className="lp-title">LP EVENT EXPLORER</span>
                    </div>

                    <LPInputBar pool={pool} wallet={wallet} block={block} loading={loading} onAnalyze={handleAnalyze} />

                    {error && (
                        <div className="lp-error">
                            <span className="lp-error-text">{error}</span>
                            <div className="lp-error-actions">
                                <button onClick={() => void fetchPositions(pool, wallet, block)}>↺ retry</button>
                                <button onClick={() => setError(null)}>✕</button>
                            </div>
                        </div>
                    )}

                    {noPositions && (
                        <div className="lp-no-positions">
                            No Uniswap V3 positions found for this wallet in this pool.
                        </div>
                    )}

                    {IS_MOCK && (
                        <div className="lp-mock-banner">
                            MOCK MODE — using fixture data. Remove <code>VITE_LP_MOCK=true</code> for live data.
                        </div>
                    )}

                    {poolInfo && <PoolSummaryBar pool={poolInfo} />}

                    {poolInfo && pool && (
                        <Suspense fallback={<div className="lp-depth-suspense-skel" />}>
                            <LiquidityDepthChart
                                pool={pool}
                                positions={positions
                                    .filter((pos) => pos.status === "active")
                                    .slice(0, 8)
                                    .map((pos) => ({
                                        price_lower: parseFloat(pos.price_lower),
                                        price_upper: parseFloat(pos.price_upper),
                                        token_id: pos.token_id,
                                    }))}
                            />
                        </Suspense>
                    )}

                    {portfolioStats && (
                        <div className="lp-portfolio-strip">
                            <div className="lp-pf-item">
                                <span className="lp-pf-label">POSITIONS</span>
                                <span className="lp-pf-value">
                                    {portfolioStats.activeCount} active
                                    {portfolioStats.closedCount > 0 && (
                                        <span className="lp-pf-closed-count">
                                            {" "}
                                            · {portfolioStats.closedCount} closed
                                        </span>
                                    )}
                                </span>
                            </div>
                            <div className="lp-pf-item">
                                <span className="lp-pf-label">TOTAL VALUE</span>
                                <span className="lp-pf-value">
                                    $
                                    {portfolioStats.totalValue.toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}
                                </span>
                            </div>
                            <div className="lp-pf-item">
                                <span className="lp-pf-label">FEES EARNED</span>
                                <span className="lp-pf-value lp-positive">
                                    +$
                                    {portfolioStats.totalFees.toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}
                                </span>
                            </div>
                            <div className="lp-pf-item">
                                <span className="lp-pf-label">NET P&amp;L</span>
                                <span
                                    className={`lp-pf-value ${portfolioStats.totalPnl >= 0 ? "lp-positive" : "lp-negative"}`}
                                >
                                    {portfolioStats.totalPnl >= 0 ? "+" : ""}$
                                    {portfolioStats.totalPnl.toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}
                                </span>
                            </div>
                            <div className="lp-pf-item">
                                <span className="lp-pf-label">TOTAL IL</span>
                                <span
                                    className={`lp-pf-value ${portfolioStats.totalIl >= 0 ? "lp-positive" : "lp-negative"}`}
                                >
                                    {portfolioStats.totalIl >= 0 ? "+" : "−"}$
                                    {Math.abs(portfolioStats.totalIl).toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}
                                </span>
                            </div>
                            <div className="lp-pf-item">
                                <span className="lp-pf-label">AVG FEE APR</span>
                                <span className={`lp-pf-value ${portfolioStats.avgFeeApr > 0 ? "lp-positive" : ""}`}>
                                    {`${portfolioStats.avgFeeApr.toFixed(1)}%`}
                                </span>
                            </div>
                            {portfolioStats.atRisk > 0 && (
                                <div className="lp-pf-item">
                                    <span className="lp-pf-label">AT RISK</span>
                                    <span className="lp-pf-value lp-negative">{portfolioStats.atRisk} pos</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Filters bar — only shown when we have positions */}
                    {positions.length > 0 && (
                        <LPFiltersBar
                            total={positions.length}
                            activeCnt={activeCnt}
                            outOfRangeCnt={outOfRangeCnt}
                            closedCnt={closedCnt}
                            status={statusFilter}
                            sortKey={sortKey}
                            sortDesc={sortDesc}
                            onStatus={setStatusFilter}
                            onSort={setSortKey}
                            onSortDir={() => setSortDesc((d) => !d)}
                        />
                    )}

                    {showEmpty && (
                        <div className="lp-empty">
                            <p className="lp-empty-headline">UNISWAP V3 POSITION ANALYZER</p>
                            <p className="lp-empty-sub">No wallet connection required · Read-only · Base mainnet</p>
                            <ul className="lp-empty-features">
                                <li>Current position value &amp; token amounts</li>
                                <li>Impermanent loss vs HODL</li>
                                <li>Fees collected + APR</li>
                                <li>Liquidity depth chart</li>
                                <li>Historical P&amp;L over time</li>
                                <li>Full mint / burn / collect log</li>
                            </ul>
                            <button className="lp-demo-btn" onClick={() => handleAnalyze(DEMO_POOL, DEMO_WALLET, "")}>
                                ↳ TRY DEMO — WETH/USDC Base
                            </button>
                            <p className="lp-empty-hint">
                                Powered by GoldRush Pipeline API → Neon Postgres → Edge Functions
                            </p>
                        </div>
                    )}

                    {showNoResults && (
                        <div className="lp-empty">
                            <p className="lp-empty-headline">
                                {statusFilter !== "all"
                                    ? `NO ${statusFilter.replace("_", " ").toUpperCase()} POSITIONS`
                                    : "NO POSITIONS FOUND"}
                            </p>
                            <p className="lp-empty-sub">
                                {statusFilter !== "all"
                                    ? "Try a different filter above"
                                    : `No LP positions for this wallet in this pool${poolInfo ? ` at block ${poolInfo.block_number.toLocaleString()}` : ""}`}
                            </p>
                        </div>
                    )}

                    {filteredPositions.map((pos) => (
                        <Suspense key={pos.token_id} fallback={<div className="lp-card-skel" />}>
                            <PositionCard position={pos} pool={pool} chainName={chainName} />
                        </Suspense>
                    ))}
                </div>
            </div>
        </div>
    );
}
