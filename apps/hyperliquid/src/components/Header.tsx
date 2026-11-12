import { PRIMARY_TABS } from "../constants";
import type { Filters, HIP3Market, PrimaryTab } from "../types";
import { baseCoin, formatPrice, formatPercent, formatUSD } from "../utils/format";

interface HeaderProps {
    marketCount: number;
    liveCount: number;
    selectedMarket: HIP3Market | null;
    filters: Filters;
    totalVolume24h: number;
    onPrimaryTabChange: (tab: PrimaryTab) => void;
}

export function Header({
    marketCount,
    liveCount,
    selectedMarket,
    filters,
    totalVolume24h,
    onPrimaryTabChange,
}: HeaderProps) {
    const ticker = selectedMarket
        ? selectedMarket.marketClass === "hip-4"
            ? selectedMarket.name
            : selectedMarket.type === "spot"
              ? baseCoin(selectedMarket.coin)
              : `${baseCoin(selectedMarket.coin)}-${selectedMarket.quoteToken ?? "USDC"}`
        : null;
    const changePositive = (selectedMarket?.change24h ?? 0) >= 0;

    return (
        <header className="header">
            <div className="header-left">
                <div className="header-logo">
                    Hyperliquid <span>Market Screener</span>
                </div>
            </div>

            <div className="header-right">
                {/* Selected market summary */}
                {selectedMarket && ticker && (
                    <div className="header-market-summary">
                        <span className="header-market-ticker">{ticker}</span>
                        <span className="header-market-price">{formatPrice(selectedMarket.markPx)}</span>
                        <span className={`header-market-change ${changePositive ? "val-positive" : "val-negative"}`}>
                            {formatPercent(selectedMarket.change24h)}
                        </span>
                    </div>
                )}

                {/* Separator */}
                {selectedMarket && <div className="header-sep" />}

                {/* Total 24h volume */}
                <div className="header-stat">
                    <span className="header-stat-label">24h Vol</span>
                    <span className="header-stat-value">{formatUSD(totalVolume24h)}</span>
                </div>

                <div className="header-sep" />

                {/* Live market count */}
                <div className="header-badge header-badge--live">
                    <div className="header-badge-dot" />
                    <span>{liveCount.toLocaleString()}</span>
                    <span className="header-badge-total">/ {marketCount.toLocaleString()} mkts</span>
                </div>
            </div>

            <div className="header-primary-tabs">
                {PRIMARY_TABS.map((tab) => (
                    <button
                        key={tab}
                        className={`header-primary-tab ${filters.primaryTab === tab ? "header-primary-tab--active" : ""}`}
                        onClick={() => onPrimaryTabChange(tab)}
                    >
                        {tab}
                    </button>
                ))}
            </div>
        </header>
    );
}
