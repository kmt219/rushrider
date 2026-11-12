import { COMPARE_PAIRS } from "../config/comparePairs";
import { useCompareStreams } from "../hooks/useCompareStreams";
import { useOHLCVStream } from "../hooks/useOHLCVStream";
import { DEFAULT_CHAIN_GQL, SUPPORTED_CHAINS, getChainByGql } from "../lib/chains";
import { setPageMeta, resetPageMeta } from "../lib/pageMeta";
import { formatUSD, getExplorerUrl, shortenAddress } from "../utils";
import { DualPriceChart } from "./DualPriceChart";
import { SpreadBar } from "./SpreadBar";
import { ArrowLeftRight, TrendingUp, TrendingDown, Minus, Activity, ExternalLink } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

function getPersistedChain(): string {
    try {
        const saved = localStorage.getItem("dexworks:selectedChain");
        if (saved && SUPPORTED_CHAINS.some((c) => c.gqlName === saved)) return saved;
    } catch {
        /* ignore */
    }
    return DEFAULT_CHAIN_GQL;
}

const CHART_INTERVALS = [
    { key: "1S", interval: "ONE_SECOND", timeframe: "ONE_MINUTE", label: "1s / 1m" },
    { key: "1M", interval: "ONE_MINUTE", timeframe: "ONE_HOUR", label: "1m / 1h" },
    { key: "1H", interval: "ONE_HOUR", timeframe: "ONE_DAY", label: "1h / 1d" },
    { key: "1D", interval: "ONE_DAY", timeframe: "SEVEN_DAYS", label: "1d / 7d" },
] as const;

export default function DexCompare({ apiKey, streamUrl }: { apiKey: string; streamUrl: string; apiUrl: string }) {
    const navigate = useNavigate();
    const chainName = getPersistedChain();
    const activeChain = getChainByGql(chainName);
    const { chainName: chainSlugParam } = useParams<{ chainName: string }>();
    const displayChain = (chainSlugParam ?? activeChain.slug).toUpperCase();
    const [selectedIdx, setSelectedIdx] = useState(0);
    const [chartIntervalKey, setChartIntervalKey] = useState<string>("1M");

    const { comparePrices, status } = useCompareStreams(apiKey, streamUrl, chainName);

    const selected = COMPARE_PAIRS[selectedIdx]!;

    const chartConfig = useMemo(() => {
        const cfg = CHART_INTERVALS.find((c) => c.key === chartIntervalKey) ?? CHART_INTERVALS[0];
        return { interval: cfg.interval, timeframe: cfg.timeframe, label: cfg.label };
    }, [chartIntervalKey]);

    const kumbayaOHLCV = useOHLCVStream(apiKey, streamUrl, selected.kumbaya, chainName, chartConfig);
    const prismOHLCV = useOHLCVStream(apiKey, streamUrl, selected.prism, chainName, chartConfig);

    const isLoading = kumbayaOHLCV.isLoading || prismOHLCV.isLoading;
    const hasChartData = kumbayaOHLCV.candles.length > 0 || prismOHLCV.candles.length > 0;

    useEffect(() => {
        const slug = chainSlugParam ?? activeChain.slug;
        setPageMeta(
            `DEX Pair Compare — ${displayChain} | GoldRush DEX`,
            `Compare real-time Uniswap V3 pair prices and spreads on ${displayChain}. Live OHLCV charts side by side. Powered by GoldRush.`,
            {
                path: `/${slug}/compare`,
                jsonLd: {
                    "@context": "https://schema.org",
                    "@type": "WebPage",
                    name: `DEX Pair Compare — ${displayChain} | GoldRush DEX`,
                    url: `https://dex.goldrush.dev/${slug}/compare`,
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
                                name: displayChain,
                                item: `https://dex.goldrush.dev/${slug}`,
                            },
                            {
                                "@type": "ListItem",
                                position: 3,
                                name: "Compare",
                                item: `https://dex.goldrush.dev/${slug}/compare`,
                            },
                        ],
                    },
                },
            }
        );
        return () => {
            resetPageMeta();
        };
    }, [displayChain, chainSlugParam, activeChain.slug]);

    return (
        <div className="compare-page">
            {/* Header */}
            <div className="compare-header">
                <div className="compare-header-left">
                    <button className="compare-back-btn" onClick={() => navigate("/")}>
                        <ArrowLeftRight size={14} />
                        DEXWORKS
                    </button>
                    <h1 className="compare-title">DEX PRICE COMPARE</h1>
                    <span className="compare-chain-badge">{displayChain}</span>
                    <span
                        className={`compare-status-badge ${
                            status === "connected"
                                ? "compare-status-badge--connected"
                                : status === "connecting"
                                  ? "compare-status-badge--connecting"
                                  : ""
                        }`}
                    >
                        {status === "connected" ? "LIVE" : status === "connecting" ? "CONNECTING" : "IDLE"}
                    </span>
                </div>
                <div className="compare-header-right">
                    <span className="compare-dex-label compare-dex-kumbaya">KUMBAYA</span>
                    <span className="compare-vs">vs</span>
                    <span className="compare-dex-label compare-dex-prism">PRISM</span>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="compare-cards">
                {comparePrices.map((cp, i) => {
                    const isActive = i === selectedIdx;
                    const spreadAbs = cp.spreadPct != null ? Math.abs(cp.spreadPct) : null;
                    const isArb = spreadAbs != null && spreadAbs > 0.5;
                    return (
                        <button
                            key={cp.label}
                            className={`compare-card ${isActive ? "compare-card--active" : ""} ${isArb ? "compare-card--arb" : ""}`}
                            onClick={() => setSelectedIdx(i)}
                        >
                            <div className="compare-card-label">{cp.label}</div>
                            <div className="compare-card-prices">
                                <div className="compare-card-dex">
                                    <span className="compare-card-dex-name compare-dex-kumbaya">K</span>
                                    <span className="compare-card-price">
                                        {cp.kumbayaPrice != null ? formatUSD(cp.kumbayaPrice) : "—"}
                                    </span>
                                    <a
                                        href={getExplorerUrl(chainName, cp.kumbayaAddress) ?? "#"}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="compare-explorer-link compare-dex-kumbaya"
                                        onClick={(e) => e.stopPropagation()}
                                        title={cp.kumbayaAddress}
                                    >
                                        <ExternalLink size={9} />
                                    </a>
                                </div>
                                <div className="compare-card-dex">
                                    <span className="compare-card-dex-name compare-dex-prism">P</span>
                                    <span className="compare-card-price">
                                        {cp.prismPrice != null ? formatUSD(cp.prismPrice) : "—"}
                                    </span>
                                    <a
                                        href={getExplorerUrl(chainName, cp.prismAddress) ?? "#"}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="compare-explorer-link compare-dex-prism"
                                        onClick={(e) => e.stopPropagation()}
                                        title={cp.prismAddress}
                                    >
                                        <ExternalLink size={9} />
                                    </a>
                                </div>
                            </div>
                            <div
                                className={`compare-card-spread ${
                                    cp.spreadPct == null
                                        ? ""
                                        : cp.spreadPct > 0.1
                                          ? "compare-card-spread--positive"
                                          : cp.spreadPct < -0.1
                                            ? "compare-card-spread--negative"
                                            : "compare-card-spread--neutral"
                                }`}
                            >
                                {cp.spreadPct != null ? (
                                    <>
                                        {cp.spreadPct > 0.1 ? (
                                            <TrendingUp size={10} />
                                        ) : cp.spreadPct < -0.1 ? (
                                            <TrendingDown size={10} />
                                        ) : (
                                            <Minus size={10} />
                                        )}
                                        {spreadAbs != null ? `${spreadAbs.toFixed(3)}%` : "—"}
                                    </>
                                ) : (
                                    "—"
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Chart Section */}
            <div className="compare-chart-section">
                <div className="compare-chart-header">
                    <div className="compare-chart-title">
                        <Activity size={14} />
                        {selected.label}
                        <span className="compare-chart-subtitle">PRICE OVERLAY</span>
                    </div>
                    <div className="compare-chart-controls">
                        {CHART_INTERVALS.map((ci) => (
                            <button
                                key={ci.key}
                                className={`compare-interval-btn ${chartIntervalKey === ci.key ? "compare-interval-btn--active" : ""}`}
                                onClick={() => setChartIntervalKey(ci.key)}
                            >
                                {ci.label}
                            </button>
                        ))}
                    </div>
                    <div className="compare-chart-legend">
                        <span className="compare-legend-item compare-dex-kumbaya">
                            <span className="compare-legend-dot" style={{ background: "#3b82f6" }} />
                            KUMBAYA
                        </span>
                        <span className="compare-legend-item compare-dex-prism">
                            <span className="compare-legend-dot" style={{ background: "#f59e0b" }} />
                            PRISM
                        </span>
                    </div>
                </div>

                <div className="compare-chart-body">
                    {isLoading ? (
                        <div className="compare-chart-loading">
                            <Activity size={20} className="compare-spinner" />
                            LOADING CHART DATA...
                        </div>
                    ) : !hasChartData ? (
                        <div className="compare-chart-loading">NO CHART DATA AVAILABLE</div>
                    ) : (
                        <>
                            <DualPriceChart kumbayaCandles={kumbayaOHLCV.candles} prismCandles={prismOHLCV.candles} />
                            <SpreadBar kumbayaCandles={kumbayaOHLCV.candles} prismCandles={prismOHLCV.candles} />
                        </>
                    )}
                </div>
            </div>

            {/* Comparison Table */}
            <div className="compare-table-section">
                <div className="compare-table-title">ALL PAIRS</div>
                <div className="compare-table-wrap">
                    <table className="compare-table">
                        <thead>
                            <tr>
                                <th>PAIR</th>
                                <th>KUMBAYA PRICE</th>
                                <th>KUMBAYA POOL</th>
                                <th>PRISM PRICE</th>
                                <th>PRISM POOL</th>
                                <th>SPREAD</th>
                                <th>KUMBAYA LIQ</th>
                                <th>PRISM LIQ</th>
                                <th>BEST BUY</th>
                            </tr>
                        </thead>
                        <tbody>
                            {comparePrices.map((cp, i) => {
                                const bestBuy =
                                    cp.kumbayaPrice != null && cp.prismPrice != null
                                        ? cp.kumbayaPrice < cp.prismPrice
                                            ? "Kumbaya"
                                            : cp.prismPrice < cp.kumbayaPrice
                                              ? "Prism"
                                              : "Equal"
                                        : "—";
                                return (
                                    <tr
                                        key={cp.label}
                                        className={`compare-table-row ${i === selectedIdx ? "compare-table-row--active" : ""} ${
                                            cp.spreadPct != null && Math.abs(cp.spreadPct) > 0.5
                                                ? "compare-table-row--arb"
                                                : ""
                                        }`}
                                        onClick={() => setSelectedIdx(i)}
                                    >
                                        <td className="compare-table-pair">{cp.label}</td>
                                        <td>{cp.kumbayaPrice != null ? formatUSD(cp.kumbayaPrice) : "—"}</td>
                                        <td>
                                            <a
                                                href={getExplorerUrl(chainName, cp.kumbayaAddress) ?? "#"}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="compare-pool-link compare-dex-kumbaya"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {shortenAddress(cp.kumbayaAddress)}
                                                <ExternalLink size={10} />
                                            </a>
                                        </td>
                                        <td>{cp.prismPrice != null ? formatUSD(cp.prismPrice) : "—"}</td>
                                        <td>
                                            <a
                                                href={getExplorerUrl(chainName, cp.prismAddress) ?? "#"}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="compare-pool-link compare-dex-prism"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {shortenAddress(cp.prismAddress)}
                                                <ExternalLink size={10} />
                                            </a>
                                        </td>
                                        <td
                                            className={
                                                cp.spreadPct == null
                                                    ? ""
                                                    : cp.spreadPct > 0.1
                                                      ? "compare-cell-positive"
                                                      : cp.spreadPct < -0.1
                                                        ? "compare-cell-negative"
                                                        : "compare-cell-neutral"
                                            }
                                        >
                                            {cp.spreadPct != null
                                                ? `${cp.spreadPct > 0 ? "+" : ""}${cp.spreadPct.toFixed(3)}%`
                                                : "—"}
                                        </td>
                                        <td>{cp.kumbayaLiquidity != null ? formatUSD(cp.kumbayaLiquidity) : "—"}</td>
                                        <td>{cp.prismLiquidity != null ? formatUSD(cp.prismLiquidity) : "—"}</td>
                                        <td
                                            className={
                                                bestBuy === "Kumbaya"
                                                    ? "compare-best-kumbaya"
                                                    : bestBuy === "Prism"
                                                      ? "compare-best-prism"
                                                      : ""
                                            }
                                        >
                                            {bestBuy}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
