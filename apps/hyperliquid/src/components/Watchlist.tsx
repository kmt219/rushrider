import type { HIP3Market } from "../types";
import { formatUSD, formatPercent } from "../utils/format";
import { Star } from "lucide-react";

interface WatchlistProps {
    markets: HIP3Market[];
    favorites: Set<string>;
    onSelectMarket: (market: HIP3Market) => void;
    selectedCoin: string | null;
}

export function Watchlist({ markets, favorites, onSelectMarket, selectedCoin }: WatchlistProps) {
    const watchlistMarkets = markets.filter((m) => favorites.has(m.coin));

    return (
        <div className="sidebar-panel sidebar-panel--grow">
            <div className="sidebar-panel-header">
                <Star size={11} />
                <span>Watchlist</span>
                <span className="sidebar-panel-count">{watchlistMarkets.length}</span>
            </div>
            <div className="watchlist-body">
                {watchlistMarkets.length === 0 ? (
                    <div className="watchlist-empty">
                        Press <kbd className="watchlist-kbd">⌘S</kbd> in search to add
                    </div>
                ) : (
                    watchlistMarkets.map((m) => (
                        <div
                            key={m.coin}
                            className={`watchlist-row ${selectedCoin === m.coin ? "watchlist-row--selected" : ""}`}
                            onClick={() => onSelectMarket(m)}
                        >
                            <span className="watchlist-coin">{m.coin}</span>
                            <span className="watchlist-price">{formatUSD(m.markPx)}</span>
                            <span className={`watchlist-change ${m.change24h >= 0 ? "val-positive" : "val-negative"}`}>
                                {formatPercent(m.change24h)}
                            </span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
