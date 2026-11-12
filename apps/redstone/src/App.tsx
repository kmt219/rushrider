import { MEGAETH_FEEDS } from "./feeds";
import { useOHLCVStream } from "./hooks/useOHLCVStream";
import type { FeedInfo } from "./types";
import { CandlestickChart, formatPrice } from "@goldrush-demos/shared-ui";
import { ChartCandlestick, ExternalLink, Search, Diamond, Loader2, Info } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const API_KEY = import.meta.env.VITE_GOLDRUSH_API_KEY as string;
const STREAM_URL = (import.meta.env.VITE_GOLDRUSH_STREAM_URL as string) ?? "wss://api.covalenthq.com/v1/streaming";

type Interval = "1s" | "1m" | "1h";
const INTERVALS: { value: Interval; label: string }[] = [
    { value: "1s", label: "1s" },
    { value: "1m", label: "1m" },
    { value: "1h", label: "1h" },
];

function getFeedFromUrl(): { feed: FeedInfo; interval: Interval } {
    const params = new URLSearchParams(window.location.search);
    const symbol = params.get("symbol")?.toUpperCase();
    const int = params.get("interval") as Interval | null;
    const feed = (symbol && MEGAETH_FEEDS.find((f) => f.symbol === symbol)) || MEGAETH_FEEDS[0]!;
    const validInterval = int && ["1s", "1m", "1h"].includes(int) ? int : "1m";
    return { feed, interval: validInterval };
}

export default function App() {
    const initial = useRef(getFeedFromUrl());
    const [selectedFeed, setSelectedFeed] = useState<FeedInfo>(initial.current.feed);
    const [interval, setInterval] = useState<Interval>(initial.current.interval);
    const [search, setSearch] = useState("");

    // Sync selected feed + interval to URL
    useEffect(() => {
        const params = new URLSearchParams();
        params.set("symbol", selectedFeed.symbol);
        params.set("interval", interval);
        const url = `${window.location.pathname}?${params}`;
        window.history.replaceState(null, "", url);
    }, [selectedFeed, interval]);

    const filteredFeeds = useMemo(() => {
        if (!search) return MEGAETH_FEEDS;
        const q = search.toLowerCase();
        return MEGAETH_FEEDS.filter((f) => f.symbol.toLowerCase().includes(q) || f.name.toLowerCase().includes(q));
    }, [search]);

    const { candles, isConnected, isLoading } = useOHLCVStream(API_KEY, STREAM_URL, selectedFeed.symbol, interval);

    const latestPrice = candles.length > 0 ? candles[candles.length - 1]!.close : 0;
    const firstPrice = candles.length > 0 ? candles[0]!.open : 0;
    const priceChange = firstPrice ? ((latestPrice - firstPrice) / firstPrice) * 100 : 0;

    // Dynamic page title — live price when focused, ticker scroll when tab is hidden
    const TITLE_SUFFIX = "RedStone Price Feeds";
    const BASE_TITLE = TITLE_SUFFIX;
    const titleRef = useRef(BASE_TITLE);
    const tickerRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
    const tickerOffsetRef = useRef(0);

    useEffect(() => {
        let title = BASE_TITLE;
        if (candles.length > 0) {
            const price = `$${formatPrice(latestPrice)}`;
            const chg = `${priceChange >= 0 ? "+" : ""}${priceChange.toFixed(2)}%`;
            title = `${selectedFeed.symbol}/USD ${price} ${chg} — ${TITLE_SUFFIX}`;
        } else if (isLoading) {
            title = `${selectedFeed.symbol}/USD ⏳ — ${TITLE_SUFFIX}`;
        } else {
            title = `${selectedFeed.symbol}/USD — ${TITLE_SUFFIX}`;
        }
        titleRef.current = title;
        if (!document.hidden) {
            document.title = title;
        }
        return () => {
            titleRef.current = BASE_TITLE;
            document.title = BASE_TITLE;
        };
    }, [selectedFeed, candles, isLoading, latestPrice, priceChange]);

    useEffect(() => {
        function startTicker() {
            if (tickerRef.current) return;
            tickerOffsetRef.current = 0;
            tickerRef.current = window.setInterval(() => {
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
                window.clearInterval(tickerRef.current);
                tickerRef.current = null;
            }
            tickerOffsetRef.current = 0;
            document.title = titleRef.current;
        }
        function onVisibilityChange() {
            if (document.hidden) startTicker();
            else stopTicker();
        }
        if (document.hidden) startTicker();
        document.addEventListener("visibilitychange", onVisibilityChange);
        return () => {
            document.removeEventListener("visibilitychange", onVisibilityChange);
            stopTicker();
        };
    }, []);

    return (
        <div className="app">
            {/* -- Header --------------------------------------------------- */}
            <header className="header">
                <div className="header-left">
                    <Diamond size={18} className="header-icon" />
                    <h1 className="header-title">REDSTONE</h1>
                    <span className="header-tag">PRICE FEEDS</span>
                </div>
                <div className="header-right">
                    <span className="header-chain">MEGAETH MAINNET</span>
                    <span className={`header-badge ${isConnected ? "connected" : ""}`}>
                        <span className={`status-dot ${isConnected ? "connected" : ""}`} />
                        {isConnected ? "LIVE" : "CONNECTING"}
                    </span>
                    <a
                        href="https://goldrush.dev/docs"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="header-btn"
                    >
                        <ExternalLink size={14} />
                    </a>
                </div>
            </header>

            {/* -- Main ----------------------------------------------------- */}
            <div className="main">
                {/* -- Left pane: Feed list --------------------------------- */}
                <aside className="sidebar">
                    <div className="sidebar-header">
                        <div className="search-box">
                            <Search size={14} className="search-icon" />
                            <input
                                type="text"
                                className="search-input"
                                placeholder="SEARCH FEEDS..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="feed-list">
                        {filteredFeeds.map((feed) => {
                            const isActive = selectedFeed.id === feed.id;

                            return (
                                <button
                                    key={feed.id}
                                    className={`feed-item ${isActive ? "active" : ""}`}
                                    onClick={() => setSelectedFeed(feed)}
                                >
                                    <div className="feed-item-left">
                                        <span className="feed-symbol">{feed.symbol}</span>
                                        <span className="feed-name">{feed.name}</span>
                                    </div>
                                </button>
                            );
                        })}
                        {filteredFeeds.length === 0 && <div className="feed-empty">NO FEEDS MATCH</div>}
                    </div>

                    <div className="sidebar-footer">
                        <span className="feed-count">{filteredFeeds.length} FEEDS</span>
                        <span className="feed-source">REDSTONE BOLT</span>
                    </div>
                </aside>

                {/* -- Right pane: Chart + Config --------------------------- */}
                <div className="content">
                    {/* -- Chart panel -------------------------------------- */}
                    <div className="chart-panel">
                        <div className="chart-header">
                            <div className="chart-title-row">
                                <ChartCandlestick size={16} />
                                <span className="chart-symbol">{selectedFeed.symbol}/USD</span>
                                <span className="chart-feed-name">{selectedFeed.name}</span>
                            </div>
                            <div className="chart-price-row">
                                {candles.length > 0 ? (
                                    <>
                                        <span className="chart-price">${formatPrice(latestPrice)}</span>
                                        <span className={`chart-change ${priceChange >= 0 ? "positive" : "negative"}`}>
                                            {priceChange >= 0 ? "+" : ""}
                                            {priceChange.toFixed(2)}%
                                        </span>
                                    </>
                                ) : (
                                    <span className="chart-price chart-price-waiting">--</span>
                                )}
                            </div>
                        </div>
                        <div className={`chart-body${isLoading && candles.length > 0 ? " chart-body--switching" : ""}`}>
                            {isLoading && candles.length > 0 && <div className="chart-switch-overlay" />}
                            {isLoading && candles.length === 0 ? (
                                <div className="chart-loading">
                                    <Loader2 size={24} className="spinner" />
                                    <span>LOADING CANDLES...</span>
                                </div>
                            ) : candles.length === 0 ? (
                                <div className="chart-loading">
                                    <span>NO DATA</span>
                                </div>
                            ) : (
                                <CandlestickChart candles={candles} showVolume={false} />
                            )}
                        </div>
                    </div>

                    {/* -- Config panel ------------------------------------- */}
                    <div className="config-panel">
                        <div className="config-section">
                            <h3 className="config-label">INTERVAL</h3>
                            <div className="interval-selector">
                                {INTERVALS.map((opt) => (
                                    <button
                                        key={opt.value}
                                        className={`interval-btn ${interval === opt.value ? "active" : ""}`}
                                        onClick={() => setInterval(opt.value)}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="config-section">
                            <h3 className="config-label">FEED DETAILS</h3>
                            <div className="details-grid">
                                <div className="detail-row">
                                    <span className="detail-key">FEED ID</span>
                                    <span className="detail-value">{selectedFeed.id}</span>
                                </div>
                                <div className="detail-row">
                                    <span className="detail-key">CHAIN</span>
                                    <span className="detail-value">MEGAETH MAINNET</span>
                                </div>
                                <div className="detail-row">
                                    <span className="detail-key">ORACLE</span>
                                    <span className="detail-value">REDSTONE BOLT</span>
                                </div>
                                <div className="detail-row">
                                    <span className="detail-key">CANDLES</span>
                                    <span className="detail-value">{candles.length}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* -- About section ------------------------------------ */}
                    <div className="about-section">
                        <div className="about-header">
                            <Info size={14} />
                            <h3 className="about-title">ABOUT REDSTONE BOLT</h3>
                        </div>
                        <p className="about-text">
                            On MegaETH, prices for major tokens (BTC, ETH, SOL, etc.) are powered by{" "}
                            <a
                                href="https://redstone.finance/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="about-link"
                            >
                                Redstone Bolt
                            </a>{" "}
                            — ultra-low-latency CEX price feeds updated every <strong>2.4 ms</strong> (~400
                            updates/sec).
                        </p>
                        <p className="about-text">
                            Bolt nodes are co-located with MegaETH sequencer infrastructure and aggregate prices from{" "}
                            <strong>Binance, Coinbase, OKX, Bitget, and Kraken</strong>, delivering institutional-grade
                            price accuracy with sub-millisecond delivery.
                        </p>
                    </div>
                </div>
            </div>

            <div className="footer">
                POWERED BY <strong>GOLDRUSH</strong>
                <span className="footer-sep">&bull;</span>
                <a href="https://goldrush.dev/docs" target="_blank" rel="noopener noreferrer" className="footer-link">
                    DOCS &rarr;
                </a>
            </div>
        </div>
    );
}
