import { PRIMARY_TABS, getMarketAlias } from "../constants";
import type { HIP3Market, PrimaryTab } from "../types";
import { formatUSD, formatPercent } from "../utils/format";
import { Command } from "cmdk";
import { Star, TrendingUp, LayoutGrid, Search } from "lucide-react";
import { useEffect, useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface CommandPaletteProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    markets: HIP3Market[];
    favorites: Set<string>;
    onToggleFavorite: (coin: string) => void;
    onSelectMarket: (market: HIP3Market) => void;
    onPrimaryTabChange: (tab: PrimaryTab) => void;
}

export function CommandPalette({
    open,
    onOpenChange,
    markets,
    favorites,
    onToggleFavorite,
    onSelectMarket,
    onPrimaryTabChange,
}: CommandPaletteProps) {
    const [value, setValue] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus input when dialog opens
    useEffect(() => {
        if (open) {
            requestAnimationFrame(() => inputRef.current?.focus());
        }
    }, [open]);

    // Esc to close + ⌘S to favorite
    useEffect(() => {
        if (!open) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onOpenChange(false);
            }
            if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                e.preventDefault();
                if (value && value.startsWith("market-")) {
                    const coin = value.replace("market-", "");
                    onToggleFavorite(coin);
                }
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [open, value, onToggleFavorite, onOpenChange]);

    const handleSelect = useCallback(
        (val: string) => {
            if (val.startsWith("market-")) {
                const coin = val.replace("market-", "");
                const market = markets.find((m) => m.coin === coin);
                if (market) onSelectMarket(market);
            } else if (val.startsWith("tab-")) {
                const tab = val.replace("tab-", "") as PrimaryTab;
                onPrimaryTabChange(tab);
            }
            onOpenChange(false);
        },
        [markets, onSelectMarket, onPrimaryTabChange, onOpenChange]
    );

    // Strict substring filter — prevents cmdk's fuzzy scorer from surfacing false positives
    const substringFilter = useCallback((itemValue: string, search: string, keywords?: string[]): number => {
        if (!search) return 1;
        const q = search.toLowerCase();
        if (itemValue.toLowerCase().includes(q)) return 1;
        if (keywords?.some((k) => k.toLowerCase().includes(q))) return 1;
        return 0;
    }, []);

    const favoriteMarkets = markets.filter((m) => favorites.has(m.coin));

    function marketTicker(m: HIP3Market): string {
        if (m.marketClass === "hip-4") return m.name;
        const base = m.coin.includes(":") ? (m.coin.split(":")[1] ?? m.coin) : m.coin;
        return m.type === "spot" ? base : `${base}-${m.quoteToken}`;
    }

    if (!open) return null;

    return createPortal(
        <>
            <div className="cmdk-overlay" onClick={() => onOpenChange(false)} />
            <div className="cmdk-dialog">
                <Command value={value} onValueChange={setValue} label="Command palette" filter={substringFilter}>
                    <div className="cmdk-input-wrap">
                        <Search size={14} className="cmdk-input-icon" />
                        <Command.Input
                            ref={inputRef}
                            className="cmdk-input"
                            placeholder="Search markets, tabs, actions..."
                        />
                    </div>

                    <Command.List className="cmdk-list">
                        <Command.Empty className="cmdk-empty">No results found.</Command.Empty>

                        {/* Favorites group */}
                        {favoriteMarkets.length > 0 && (
                            <Command.Group heading="Favorites" className="cmdk-group">
                                {favoriteMarkets.map((m) => (
                                    <Command.Item
                                        key={`fav-${m.coin}`}
                                        value={`market-${m.coin}`}
                                        onSelect={handleSelect}
                                        className="cmdk-item"
                                    >
                                        <Star size={12} className="cmdk-item-icon cmdk-item-icon--fav" />
                                        <span className="cmdk-item-label">{marketTicker(m)}</span>
                                        <span className="cmdk-item-sublabel">{m.name}</span>
                                        <span className="cmdk-item-right">
                                            <span className="cmdk-item-price">{formatUSD(m.markPx)}</span>
                                            <span
                                                className={`cmdk-item-change ${m.change24h >= 0 ? "val-positive" : "val-negative"}`}
                                            >
                                                {formatPercent(m.change24h)}
                                            </span>
                                        </span>
                                    </Command.Item>
                                ))}
                            </Command.Group>
                        )}

                        {/* Markets group */}
                        <Command.Group heading="Markets" className="cmdk-group">
                            {markets.map((m) => (
                                <Command.Item
                                    key={m.coin}
                                    value={`market-${m.coin}`}
                                    onSelect={handleSelect}
                                    className="cmdk-item"
                                    keywords={[
                                        m.name,
                                        m.category,
                                        m.quoteAsset ?? "",
                                        m.builder,
                                        getMarketAlias(m.coin) ?? "",
                                    ].filter((s) => s !== "")}
                                >
                                    {favorites.has(m.coin) ? (
                                        <Star size={12} className="cmdk-item-icon cmdk-item-icon--fav" />
                                    ) : (
                                        <TrendingUp size={12} className="cmdk-item-icon" />
                                    )}
                                    <span className="cmdk-item-label">{marketTicker(m)}</span>
                                    <span className="cmdk-item-sublabel">{m.name}</span>
                                    <span className="cmdk-item-badge">
                                        {m.quoteAsset ? `${m.category} · ${m.quoteAsset}` : m.category}
                                    </span>
                                    <span className="cmdk-item-right">
                                        <span className="cmdk-item-price">{formatUSD(m.markPx)}</span>
                                        <span
                                            className={`cmdk-item-change ${m.change24h >= 0 ? "val-positive" : "val-negative"}`}
                                        >
                                            {formatPercent(m.change24h)}
                                        </span>
                                    </span>
                                </Command.Item>
                            ))}
                        </Command.Group>

                        {/* Tabs group */}
                        <Command.Group heading="Switch Tab" className="cmdk-group">
                            {PRIMARY_TABS.map((tab) => (
                                <Command.Item
                                    key={tab}
                                    value={`tab-${tab}`}
                                    onSelect={handleSelect}
                                    className="cmdk-item"
                                >
                                    <LayoutGrid size={12} className="cmdk-item-icon" />
                                    <span className="cmdk-item-label">{tab}</span>
                                    <span className="cmdk-item-sublabel">Switch to {tab} tab</span>
                                </Command.Item>
                            ))}
                        </Command.Group>
                    </Command.List>

                    {/* Keyboard shortcut footer */}
                    <div className="cmdk-footer">
                        <div className="cmdk-shortcut">
                            <kbd className="cmdk-kbd">⌘K</kbd>
                            <span>Open</span>
                        </div>
                        <div className="cmdk-shortcut">
                            <kbd className="cmdk-kbd">↕</kbd>
                            <span>Navigate</span>
                        </div>
                        <div className="cmdk-shortcut">
                            <kbd className="cmdk-kbd">Enter</kbd>
                            <span>Select</span>
                        </div>
                        <div className="cmdk-shortcut">
                            <kbd className="cmdk-kbd">⌘S</kbd>
                            <span>Favorite</span>
                        </div>
                        <div className="cmdk-shortcut">
                            <kbd className="cmdk-kbd">Esc</kbd>
                            <span>Close</span>
                        </div>
                    </div>
                </Command>
            </div>
        </>,
        document.body
    );
}
