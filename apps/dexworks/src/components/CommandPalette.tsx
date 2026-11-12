import type { GemTab, GemTimeframe, NewPairData, Pair, TokenSearchResult, WhaleTx } from "../types";
import { formatUSD, getExplorerUrl, shortenAddress } from "../utils";
import { PriceDisplay } from "./PriceDisplay";
import { Command } from "cmdk";
import {
    ArrowLeftRight,
    ChartCandlestick,
    Copy,
    Download,
    ExternalLink,
    Link2,
    Search,
    Send,
    ShieldCheck,
    Sparkles,
    Star,
    TrendingDown,
    TrendingUp,
    Upload,
    Zap,
} from "lucide-react";
import { useEffect } from "react";

const WHALE_TYPE_ICONS: Record<string, typeof Send> = {
    transfer: Send,
    swap: ArrowLeftRight,
    bridge: Link2,
    deposit: Download,
    withdraw: Upload,
    approve: ShieldCheck,
};

interface CommandPaletteProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    pairs: Pair[];
    newPairs: NewPairData[];
    whaleTxs: WhaleTx[];
    setActiveGemTab: (tab: GemTab) => void;
    setSelectedTimeframe: (tf: GemTimeframe) => void;
    setWhaleThreshold: (n: number) => void;
    selectPair: (address: string) => void;
    unwatchPair: (address: string) => void;
    exportData: () => void;
    selectedPair: Pair | null;
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    searchResults: TokenSearchResult[];
    isSearching: boolean;
    addPairs: (pairs: Pair[]) => void;
    chainName: string;
}

const GEM_TABS: { tab: GemTab; label: string; Icon: typeof Sparkles }[] = [
    { tab: "new", label: "New", Icon: Star },
    { tab: "momentum", label: "Momentum", Icon: Sparkles },
    { tab: "gainers", label: "Gainers", Icon: TrendingUp },
    { tab: "losers", label: "Losers", Icon: TrendingDown },
    { tab: "spikes", label: "Spikes", Icon: Zap },
];

const TIMEFRAMES: { tf: GemTimeframe; label: string }[] = [
    { tf: "1h", label: "1H" },
    { tf: "24h", label: "24H" },
];

const WHALE_FILTERS: { label: string; value: number }[] = [
    { label: "No filter", value: 0 },
    { label: "$1K+", value: 1000 },
    { label: "$5K+", value: 5000 },
    { label: "$10K+", value: 10000 },
];

export function CommandPalette({
    open,
    onOpenChange,
    pairs,
    newPairs,
    whaleTxs,
    setActiveGemTab,
    setSelectedTimeframe,
    setWhaleThreshold,
    selectPair,
    unwatchPair,
    exportData,
    selectedPair,
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    addPairs,
    chainName,
}: CommandPaletteProps) {
    // Close on Escape — Command.Dialog handled this; plain Command does not
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onOpenChange(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onOpenChange]);

    function handleSearchResultSelect(r: TokenSearchResult) {
        const alreadyWatched = pairs.some((p) => p.pairAddress.toLowerCase() === r.pair_address.toLowerCase());
        if (!alreadyWatched) {
            addPairs([
                {
                    pairAddress: r.pair_address,
                    token0: r.base_token.contract_ticker_symbol,
                    token1: r.quote_token.contract_ticker_symbol,
                    dex: r.chain,
                    addedAt: Date.now(),
                    txCount: 0,
                    lastTx: null,
                    market_cap: r.market_cap,
                    quote_rate_usd: r.quote_rate_usd,
                },
            ]);
        }
        selectPair(r.pair_address);
        onOpenChange(false);
        setSearchQuery("");
    }

    if (!open) return null;

    return (
        <div className="cmdk-backdrop" onMouseDown={() => onOpenChange(false)}>
            <Command className="cmdk-modal" label="Command palette" onMouseDown={(e) => e.stopPropagation()}>
                {/* Search input row */}
                <div className="cmdk-input-wrap">
                    <Search size={15} className="cmdk-search-icon" />
                    <Command.Input
                        placeholder="Search tokens, pairs, transactions..."
                        value={searchQuery}
                        onValueChange={setSearchQuery}
                        autoFocus
                    />
                    <kbd className="cmdk-esc-badge">ESC</kbd>
                </div>

                <Command.List>
                    <Command.Empty>
                        {isSearching
                            ? "Searching…"
                            : searchQuery
                              ? `No results for "${searchQuery}"`
                              : "Type to search or browse below"}
                    </Command.Empty>

                    {/* Live API pair search results */}
                    {searchQuery.length > 0 && (
                        <Command.Group heading="Pairs">
                            {isSearching && searchResults.length === 0 && (
                                <Command.Item disabled value="__searching__">
                                    <span className="cmdk-item-icon cmdk-icon--action">
                                        <Search size={12} />
                                    </span>
                                    <span className="cmdk-item-body">
                                        <span className="cmdk-item-title">Searching…</span>
                                    </span>
                                </Command.Item>
                            )}
                            {searchResults.map((r) => (
                                <Command.Item
                                    key={r.pair_address}
                                    value={`${r.base_token.contract_ticker_symbol}/${r.quote_token.contract_ticker_symbol} ${r.pair_address}`}
                                    onSelect={() => handleSearchResultSelect(r)}
                                >
                                    <span className="cmdk-item-body">
                                        <span className="cmdk-item-title">
                                            {r.base_token.contract_ticker_symbol}/{r.quote_token.contract_ticker_symbol}
                                        </span>
                                        <span className="cmdk-item-sub">
                                            {shortenAddress(r.pair_address)} · {r.chain}
                                        </span>
                                    </span>
                                    {r.quote_rate_usd > 0 && (
                                        <span className="cmdk-item-right">
                                            <PriceDisplay value={r.quote_rate_usd} dash={false} />
                                        </span>
                                    )}
                                </Command.Item>
                            ))}
                        </Command.Group>
                    )}

                    {/* Watchlist */}
                    {pairs.length > 0 && (
                        <Command.Group heading="Watchlist">
                            {pairs.slice(0, 8).map((pair) => (
                                <Command.Item
                                    key={pair.pairAddress}
                                    value={`${pair.token0}/${pair.token1} ${pair.pairAddress} ${pair.dex}`}
                                    onSelect={() => {
                                        selectPair(pair.pairAddress);
                                        onOpenChange(false);
                                    }}
                                >
                                    <span className="cmdk-item-body">
                                        <span className="cmdk-item-title">
                                            {pair.token0}/{pair.token1}
                                        </span>
                                        <span className="cmdk-item-sub">
                                            {shortenAddress(pair.pairAddress)} · {pair.dex}
                                        </span>
                                    </span>
                                    {pair.quote_rate_usd != null && pair.quote_rate_usd > 0 && (
                                        <span className="cmdk-item-right">
                                            <PriceDisplay value={pair.quote_rate_usd} dash={false} />
                                        </span>
                                    )}
                                </Command.Item>
                            ))}
                        </Command.Group>
                    )}

                    {/* New Pairs */}
                    {newPairs.length > 0 && (
                        <Command.Group heading="New Pairs">
                            {newPairs.slice(0, 8).map((pair) => (
                                <Command.Item
                                    key={pair.pair_address}
                                    value={`${pair.base_token.contract_ticker_symbol}/${pair.quote_token.contract_ticker_symbol} ${pair.pair_address} ${pair.protocol} ${pair.base_token.contract_name}`}
                                    onSelect={() => {
                                        selectPair(pair.pair_address);
                                        onOpenChange(false);
                                    }}
                                >
                                    <span className="cmdk-item-body">
                                        <span className="cmdk-item-title">
                                            {pair.base_token.contract_ticker_symbol}/
                                            {pair.quote_token.contract_ticker_symbol}
                                        </span>
                                        <span className="cmdk-item-sub">
                                            {shortenAddress(pair.pair_address)} · {pair.protocol}
                                        </span>
                                    </span>
                                    {pair.market_cap > 0 && (
                                        <span className="cmdk-item-right">{formatUSD(pair.market_cap)} mcap</span>
                                    )}
                                </Command.Item>
                            ))}
                        </Command.Group>
                    )}

                    {/* Whale Transactions */}
                    {whaleTxs.length > 0 && (
                        <Command.Group heading="Whale Txs">
                            {whaleTxs.slice(0, 8).map((whale) => {
                                const WhaleIcon = WHALE_TYPE_ICONS[whale.type] ?? Send;
                                const explorerUrl = getExplorerUrl(chainName, whale.tx.tx_hash, "tx");
                                return (
                                    <Command.Item
                                        key={whale.tx.tx_hash}
                                        value={`${whale.type} ${whale.token} ${whale.tx.tx_hash.slice(0, 12)}`}
                                        onSelect={() => {
                                            if (explorerUrl) window.open(explorerUrl, "_blank", "noreferrer");
                                            onOpenChange(false);
                                        }}
                                    >
                                        <span className="cmdk-item-icon cmdk-icon--whale">
                                            <WhaleIcon size={13} />
                                        </span>
                                        <span className="cmdk-item-body">
                                            <span className="cmdk-item-title">
                                                {whale.type.toUpperCase()} · {whale.token}
                                            </span>
                                            <span className="cmdk-item-sub">
                                                {shortenAddress(whale.tx.tx_hash, 8, 6)}
                                            </span>
                                        </span>
                                        <span className="cmdk-item-right cmdk-right--whale">
                                            {formatUSD(whale.usdValue)}
                                            <ExternalLink size={10} />
                                        </span>
                                    </Command.Item>
                                );
                            })}
                        </Command.Group>
                    )}

                    {/* Gem View */}
                    <Command.Group heading="Gem View">
                        {GEM_TABS.map(({ tab, label, Icon }) => (
                            <Command.Item
                                key={tab}
                                value={`switch gem tab ${label}`}
                                onSelect={() => {
                                    setActiveGemTab(tab);
                                    onOpenChange(false);
                                }}
                            >
                                <span className="cmdk-item-icon cmdk-icon--action">
                                    <Icon size={13} />
                                </span>
                                <span className="cmdk-item-body">
                                    <span className="cmdk-item-title">Switch to {label}</span>
                                    <span className="cmdk-item-sub">Gem analytics tab</span>
                                </span>
                            </Command.Item>
                        ))}
                    </Command.Group>

                    {/* Timeframe */}
                    <Command.Group heading="Timeframe">
                        {TIMEFRAMES.map(({ tf, label }) => (
                            <Command.Item
                                key={tf}
                                value={`timeframe ${label}`}
                                onSelect={() => {
                                    setSelectedTimeframe(tf);
                                    onOpenChange(false);
                                }}
                            >
                                <span className="cmdk-item-icon cmdk-icon--action">
                                    <ChartCandlestick size={13} />
                                </span>
                                <span className="cmdk-item-body">
                                    <span className="cmdk-item-title">Timeframe: {label}</span>
                                    <span className="cmdk-item-sub">Set gem analytics timeframe</span>
                                </span>
                            </Command.Item>
                        ))}
                    </Command.Group>

                    {/* Whale Filter */}
                    <Command.Group heading="Whale Filter">
                        {WHALE_FILTERS.map((opt) => (
                            <Command.Item
                                key={opt.value}
                                value={`whale filter ${opt.label}`}
                                onSelect={() => {
                                    setWhaleThreshold(opt.value);
                                    onOpenChange(false);
                                }}
                            >
                                <span className="cmdk-item-icon cmdk-icon--action">
                                    <Send size={13} />
                                </span>
                                <span className="cmdk-item-body">
                                    <span className="cmdk-item-title">Whale filter: {opt.label}</span>
                                    <span className="cmdk-item-sub">Show transactions above this threshold</span>
                                </span>
                            </Command.Item>
                        ))}
                    </Command.Group>

                    {/* Actions */}
                    <Command.Group heading="Actions">
                        <Command.Item
                            value="export csv watchlist download"
                            onSelect={() => {
                                exportData();
                                onOpenChange(false);
                            }}
                        >
                            <span className="cmdk-item-icon cmdk-icon--action">
                                <Download size={13} />
                            </span>
                            <span className="cmdk-item-body">
                                <span className="cmdk-item-title">Export CSV</span>
                                <span className="cmdk-item-sub">Download watchlist as CSV</span>
                            </span>
                        </Command.Item>
                        {selectedPair && (
                            <>
                                <Command.Item
                                    value={`unwatch remove ${selectedPair.token0}/${selectedPair.token1}`}
                                    onSelect={() => {
                                        unwatchPair(selectedPair.pairAddress);
                                        onOpenChange(false);
                                    }}
                                >
                                    <span className="cmdk-item-icon cmdk-icon--action">
                                        <Star size={13} />
                                    </span>
                                    <span className="cmdk-item-body">
                                        <span className="cmdk-item-title">
                                            Unwatch {selectedPair.token0}/{selectedPair.token1}
                                        </span>
                                        <span className="cmdk-item-sub">Remove from watchlist</span>
                                    </span>
                                </Command.Item>
                                <Command.Item
                                    value={`copy address ${selectedPair.pairAddress}`}
                                    onSelect={() => {
                                        navigator.clipboard.writeText(selectedPair.pairAddress).catch(() => {});
                                        onOpenChange(false);
                                    }}
                                >
                                    <span className="cmdk-item-icon cmdk-icon--action">
                                        <Copy size={13} />
                                    </span>
                                    <span className="cmdk-item-body">
                                        <span className="cmdk-item-title">Copy address</span>
                                        <span className="cmdk-item-sub">
                                            {shortenAddress(selectedPair.pairAddress)}
                                        </span>
                                    </span>
                                </Command.Item>
                            </>
                        )}
                    </Command.Group>
                </Command.List>

                {/* Footer — keyboard hint bar */}
                <div className="cmdk-footer">
                    <span className="cmdk-footer-hint">
                        <kbd>↑↓</kbd> navigate
                    </span>
                    <span className="cmdk-footer-hint">
                        <kbd>↵</kbd> open
                    </span>
                    <span className="cmdk-footer-hint">
                        <kbd>⌘K</kbd> toggle
                    </span>
                    <span className="cmdk-footer-sep" />
                    <span className="cmdk-footer-hint">
                        <kbd>⎋</kbd> close
                    </span>
                </div>
            </Command>
        </div>
    );
}
