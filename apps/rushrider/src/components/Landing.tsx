import { SUPPORTED_CHAINS, getChainByGql } from "../lib/chains";
import { PILL_COMBOS, fetchCandles, matchesChain, searchTokens, subscribeUpdates } from "../lib/goldrush";
import { loadStats } from "../lib/stats";
import { getLastStreamError, onStreamError } from "../lib/streamStatus";
import { difficultyOf, segmentSpacing, volatilityPctOf } from "../lib/terrain";
import type { StreamClient } from "../lib/wsClient";
import { CURATED_TICKERS } from "../tracks";
import type { Track, TokenSearchResult } from "../types";
import ChainLogo from "./ChainLogo";
import TrackCard from "./TrackCard";
import type { TrackCardData } from "./TrackCard";
import { useEffect, useRef, useState } from "react";

interface LandingProps {
    client: StreamClient;
    chainGql: string;
    onSelectChain: (gql: string) => void;
    onSelectTrack: (track: Track) => void;
}

function toTrack(r: TokenSearchResult, chainGql: string): Track {
    return {
        chainGql,
        pairAddress: r.pair_address || null,
        tokenAddress: r.base_token?.contract_address || null,
        symbol: r.base_token?.contract_ticker_symbol || "???",
        name: r.base_token?.contract_name || "Unknown token",
        priceUsd: r.quote_rate_usd,
        pctChange24h: null,
    };
}

/**
 * Run `fn` over `items` with at most `limit` in flight at once. The GoldRush
 * stream caps concurrent subscriptions per connection — firing 20+ searches +
 * OHLCV fetches at once makes the excess silently complete empty, so we pool.
 */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T, index: number) => Promise<void>): Promise<void> {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (cursor < items.length) {
            const index = cursor++;
            await fn(items[index]!, index);
        }
    });
    await Promise.all(workers);
}

/** Quick difficulty estimate from preview closes (mirrors buildTerrain's geometry). */
function estimateDifficulty(closes: number[]) {
    if (closes.length < 3) {
        return null;
    }
    const spacing = segmentSpacing(closes.length);
    const trackLen = spacing * (closes.length - 1);
    const amplitude = Math.min(1_800, Math.max(420, trackLen * 0.18));
    const min = Math.min(...closes);
    const range = Math.max(...closes) - min || 1;
    let maxSlope = 0;
    for (let i = 1; i < closes.length; i++) {
        const dy = Math.abs(((closes[i]! - closes[i - 1]!) / range) * amplitude);
        maxSlope = Math.max(maxSlope, (Math.atan2(dy, spacing) * 180) / Math.PI);
    }
    return difficultyOf(volatilityPctOf(closes), maxSlope);
}

export default function Landing({ client, chainGql, onSelectChain, onSelectTrack }: LandingProps) {
    const [stats] = useState(loadStats);
    const [cards, setCards] = useState<TrackCardData[]>([]);
    const [loadingCards, setLoadingCards] = useState(true);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<TokenSearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [streamError, setStreamError] = useState<string | null>(getLastStreamError);
    const generationRef = useRef(0);

    useEffect(() => onStreamError(setStreamError), []);

    // ── Trending tracks: resolve curated tickers → sparkline candles → live updates ──
    useEffect(() => {
        let cancelled = false;
        let unsubUpdates: (() => void) | null = null;
        setCards([]);
        setLoadingCards(true);

        const MAX_CARDS = 24;
        const isOrderBook = getChainByGql(chainGql).isOrderBook;
        const addrOf = (t: Track) => (isOrderBook ? t.tokenAddress : t.pairAddress);

        const run = async () => {
            const tickers = CURATED_TICKERS[chainGql] ?? [];
            const seen = new Set<string>();
            const resolvedAddrs: string[] = [];

            // Resolve tickers with bounded concurrency; append each card the
            // moment its sparkline data lands so the grid fills progressively
            // instead of blocking on the slowest of 20+ lookups.
            await mapLimit(tickers, 4, async (ticker) => {
                if (cancelled) {
                    return;
                }
                const found = await searchTokens(client, ticker);
                if (cancelled) {
                    return;
                }
                const onChain = found.filter(
                    (r) => matchesChain(r.chain_name, chainGql) && r.base_token?.contract_ticker_symbol
                );
                // Best match: exact ticker first, then highest volume.
                onChain.sort((a, b) => {
                    const aExact = a.base_token.contract_ticker_symbol.toUpperCase() === ticker.toUpperCase() ? 1 : 0;
                    const bExact = b.base_token.contract_ticker_symbol.toUpperCase() === ticker.toUpperCase() ? 1 : 0;
                    if (aExact !== bExact) {
                        return bExact - aExact;
                    }
                    return (b.volume_usd ?? 0) - (a.volume_usd ?? 0);
                });
                const best = onChain[0];
                if (!best) {
                    return;
                }
                const key = (best.pair_address || best.base_token.contract_address).toLowerCase();
                if (seen.has(key) || seen.size >= MAX_CARDS) {
                    return;
                }
                seen.add(key);
                const track = toTrack(best, chainGql);
                const result = await fetchCandles(
                    client,
                    chainGql,
                    isOrderBook
                        ? { token: track.tokenAddress }
                        : { pair: track.pairAddress, token: track.tokenAddress },
                    PILL_COMBOS["1H"],
                    6_000,
                    { fallback: false } // single subscription per card — avoids INVALID_TOKEN bursts
                );
                if (cancelled) {
                    return;
                }
                const closes = result?.candles.map((c) => c.close) ?? [];
                if (closes.length < 2) {
                    return;
                }
                const addr = addrOf(track);
                if (addr) {
                    resolvedAddrs.push(addr);
                }
                setCards((prev) =>
                    prev.length >= MAX_CARDS
                        ? prev
                        : [...prev, { track, closes, difficulty: estimateDifficulty(closes) }]
                );
                setStreamError(null); // a card loaded — clear any transient error banner
                setLoadingCards(false); // first card paints → drop the scanning note
            });
            if (cancelled) {
                return;
            }
            setLoadingCards(false);

            // One live-stats subscription covering every resolved card.
            if (resolvedAddrs.length > 0) {
                unsubUpdates = subscribeUpdates(
                    client,
                    chainGql,
                    isOrderBook ? { tokens: resolvedAddrs } : { pairs: resolvedAddrs },
                    (updates) => {
                        setCards((prev) =>
                            prev.map((card) => {
                                const u = updates.find(
                                    (up) => up.pair_address?.toLowerCase() === addrOf(card.track)?.toLowerCase()
                                );
                                if (!u) {
                                    return card;
                                }
                                return {
                                    ...card,
                                    track: {
                                        ...card.track,
                                        priceUsd: u.quote_rate_usd ?? card.track.priceUsd,
                                        pctChange24h: u.last_24hr?.price?.pct_change ?? card.track.pctChange24h,
                                    },
                                };
                            })
                        );
                    }
                );
            }
        };

        void run();
        return () => {
            cancelled = true;
            unsubUpdates?.();
        };
    }, [client, chainGql]);

    // ── Search (debounced) ──
    useEffect(() => {
        const gen = ++generationRef.current;
        if (!query.trim()) {
            setResults([]);
            setSearching(false);
            return;
        }
        setSearching(true);
        const timer = setTimeout(() => {
            void searchTokens(client, query.trim()).then((found) => {
                if (gen === generationRef.current) {
                    setResults(found.slice(0, 8));
                    setSearching(false);
                }
            });
        }, 350);
        return () => clearTimeout(timer);
    }, [client, query]);

    const fmtDollars = (n: number) => `$${n.toLocaleString("en-US")}`;

    return (
        <div className="landing">
            <header className="topbar">
                <span className="logo">
                    RUSH<span className="logo-accent">RIDER</span>
                </span>
                <nav className="chain-switch">
                    {SUPPORTED_CHAINS.map((c) => (
                        <button
                            key={c.gqlName}
                            className={c.gqlName === chainGql ? "chain-btn active" : "chain-btn"}
                            onClick={() => onSelectChain(c.gqlName)}
                        >
                            <ChainLogo chain={c} />
                            {c.displayName.toUpperCase()}
                        </button>
                    ))}
                </nav>
            </header>

            <main className="landing-main">
                <h1 className="hero">Ride any chart.</h1>
                <p className="hero-sub">pick a track — try not to crash.</p>

                <div className="stat-row">
                    <div className="stat">
                        <span className="stat-value">{stats.rides.toLocaleString("en-US")}</span>
                        <span className="stat-label">rides completed</span>
                    </div>
                    <div className="stat">
                        <span className="stat-value stat-accent">{fmtDollars(stats.dollars)}</span>
                        <span className="stat-label">virtual dollars traded</span>
                    </div>
                    <div className="stat">
                        <span className="stat-value">{stats.crashes.toLocaleString("en-US")}</span>
                        <span className="stat-label">total crashes</span>
                    </div>
                </div>

                <div className="search-row">
                    <input
                        className="search-input"
                        placeholder="Search any token... (WETH, PEPE, ...)"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        spellCheck={false}
                    />
                    {query.trim() ? (
                        <div className="search-results">
                            {searching ? <div className="search-hint">SEARCHING…</div> : null}
                            {!searching && results.length === 0 ? (
                                <div className="search-hint">NO TOKENS FOUND</div>
                            ) : null}
                            {results.map((r) => (
                                <button
                                    key={`${r.chain_name}:${r.pair_address || r.base_token.contract_address}`}
                                    className="search-result"
                                    onClick={() => {
                                        const norm = r.chain_name.toUpperCase().replace(/-/g, "_");
                                        const gql = norm.endsWith("_MAINNET") ? norm : `${norm}_MAINNET`;
                                        onSelectTrack(toTrack(r, gql));
                                    }}
                                >
                                    <span className="search-result-symbol">{r.base_token.contract_ticker_symbol}</span>
                                    <span className="search-result-name">{r.base_token.contract_name}</span>
                                    <span className="search-result-chain">{r.chain_name}</span>
                                </button>
                            ))}
                        </div>
                    ) : null}
                </div>

                <section className="trending">
                    <h2 className="section-label">
                        TRENDING TRACKS — {getChainByGql(chainGql).displayName.toUpperCase()}
                    </h2>
                    {loadingCards ? <div className="cards-loading">SCANNING CHARTS…</div> : null}
                    {!loadingCards && cards.length === 0 ? (
                        <div className="cards-loading">
                            {streamError
                                ? `STREAM ERROR — ${streamError}`
                                : "NO TRACK DATA ON THIS CHAIN — TRY SEARCH OR ANOTHER CHAIN"}
                        </div>
                    ) : null}
                    <div className="card-grid">
                        {cards.map((card) => (
                            <TrackCard
                                key={`${card.track.chainGql}:${card.track.pairAddress || card.track.tokenAddress}`}
                                data={card}
                                onSelect={onSelectTrack}
                            />
                        ))}
                    </div>
                </section>
            </main>

            <footer className="footer">
                POWERED BY <a href="https://goldrush.dev">GOLDRUSH</a> STREAMING API
            </footer>
        </div>
    );
}
