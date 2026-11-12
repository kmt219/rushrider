export function formatUSD(value: number): string {
    if (Math.abs(value) >= 1_000_000) {
        return `$${(value / 1_000_000).toFixed(2)}M`;
    }
    if (Math.abs(value) >= 1_000) {
        return `$${(value / 1_000).toFixed(1)}K`;
    }
    if (Math.abs(value) >= 1) {
        return `$${value.toFixed(2)}`;
    }
    // Small values — show more decimals
    return `$${value.toPrecision(4)}`;
}

export function formatPrice(value: number): string {
    if (value === 0) return "0.00";
    if (value >= 100) return value.toFixed(2);
    if (value >= 1) return value.toFixed(3);
    if (value >= 0.01) return value.toFixed(4);
    if (value >= 0.0001) return value.toFixed(6);
    if (value >= 0.000001) return value.toFixed(8);
    // toFixed avoids scientific notation (toPrecision emits e.g. "4.00000e-8")
    return value.toFixed(10);
}

export function formatPercent(value: number): string {
    const sign = value >= 0 ? "+" : "";
    return `${sign}${(value * 100).toFixed(2)}%`;
}

/** For funding rates — shows 4 decimal places to avoid rounding tiny values to 0.00% */
export function formatFundingRate(value: number): string {
    const sign = value >= 0 ? "+" : "";
    return `${sign}${(value * 100).toFixed(4)}%`;
}

export function formatBps(value: number): string {
    return `${value.toFixed(1)} bps`;
}

export function formatSize(value: number): string {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toFixed(2);
}

export function formatNumber(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toFixed(0);
}

export function shortenAddress(address: string, start = 6, end = 4): string {
    if (address.length <= start + end + 2) return address;
    return `${address.slice(0, start)}...${address.slice(-end)}`;
}

export function timeAgo(isoString: string): string {
    const ms = Date.now() - new Date(isoString).getTime();
    if (ms < 1000) return "now";
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

export function baseCoin(coin: string): string {
    return coin.includes(":") ? (coin.split(":")[1] ?? coin) : coin;
}
