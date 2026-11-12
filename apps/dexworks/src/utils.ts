import type { Pair } from "./types";

// Block explorer URLs by chain name
const BLOCK_EXPLORERS: Record<string, string> = {
    BASE_MAINNET: "https://basescan.org",
    ETH_MAINNET: "https://etherscan.io",
    POLYGON_MAINNET: "https://polygonscan.com",
    BSC_MAINNET: "https://bscscan.com",
    MEGAETH_MAINNET: "https://megaeth.blockscout.com",
    MONAD_MAINNET: "https://explorer.monad.xyz",
    HYPERCORE_MAINNET: "https://explorer.hypercore.network",
    HYPEREVM_MAINNET: "https://explorer.hyperevm.network",
    TEMPO_MAINNET: "https://explorer.tempo.xyz",
};

/**
 * Get block explorer URL for an address on a specific chain
 */
export function getExplorerUrl(chainName: string, address: string, type: "address" | "tx" = "address"): string | null {
    // Normalize: accept both "megaeth-mainnet" (API) and "MEGAETH_MAINNET" (stream/env) formats
    const normalized = chainName.toUpperCase().replace(/-/g, "_");
    const baseUrl = BLOCK_EXPLORERS[chainName] ?? BLOCK_EXPLORERS[normalized];
    if (!baseUrl) return null;
    return `${baseUrl}/${type}/${address}`;
}

/**
 * Shorten an address for display (0x1234...5678)
 */
export function shortenAddress(address: string, startChars = 6, endChars = 4): string {
    if (!address || address.length < startChars + endChars) return address;
    return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

// Subscript digit mapping for compressed zero notation
const SUBSCRIPT_MAP: Record<string, string> = {
    "0": "₀",
    "1": "₁",
    "2": "₂",
    "3": "₃",
    "4": "₄",
    "5": "₅",
    "6": "₆",
    "7": "₇",
    "8": "₈",
    "9": "₉",
};

/**
 * Compresses repeated zeros in decimal numbers using subscript notation.
 * Example: 0.000000123 → 0.0₆123 (6 zeros compressed)
 *
 * @param value - Number to format
 * @param sigFigs - Number of significant figures to display after zeros (default: 4)
 * @param minZerosToCompress - Minimum consecutive zeros to trigger compression (default: 3)
 * @returns Formatted string with subscript notation
 */
export function compressRepeatedZeros(value: number, sigFigs: number = 4, minZerosToCompress: number = 3): string {
    if (value === 0 || !isFinite(value)) return "0";

    const isNegative = value < 0;
    const absValue = Math.abs(value);

    if (absValue >= 0.01) return absValue.toFixed(4);

    // Use log10 to count leading zeros — avoids JS scientific notation in toString()
    // e.g. 4.012e-6: exponent=-6, leadingZeros=5 → "0.0₅4012"
    const exponent = Math.floor(Math.log10(absValue));
    const leadingZeros = -exponent - 1;

    if (leadingZeros < minZerosToCompress) {
        return absValue.toFixed(Math.max(4, leadingZeros + 2));
    }

    const mantissa = absValue / Math.pow(10, exponent);
    // Strip trailing zeros from significant digits for cleaner display
    const significantDigits = parseFloat(mantissa.toPrecision(sigFigs)).toString().replace(".", "");

    // Note: multi-digit leadingZeros counts (e.g. leadingZeros=10 → "₁₀") produce
    // two separate subscript characters, not a single compound glyph.  This is
    // intentional — modern fonts render adjacent subscripts correctly as a group.
    const subscript = Array.from(leadingZeros.toString())
        .map((d) => SUBSCRIPT_MAP[d] || d)
        .join("");

    const result = `0.0${subscript}${significantDigits}`;
    return isNegative ? `-${result}` : result;
}

export function formatUSD(value: number | null | undefined): string {
    if (value == null || isNaN(value) || !isFinite(value)) return "$0";
    if (value >= 1e15) return ">$999T"; // guard against bad/overflow API data
    if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
    if (value >= 1) return `$${value.toFixed(2)}`;
    if (value >= 0.01) return `$${value.toFixed(4)}`;
    if (value > 0) return `$${compressRepeatedZeros(value)}`;
    return "$0";
}

export function getTimeAgo(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return seconds < 1 ? "< 1S AGO" : `${seconds}S AGO`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}M AGO`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}H AGO`;
    const days = Math.floor(hours / 24);
    return `${days}D AGO`;
}

export function exportData(pairs: Pair[]): boolean {
    if (pairs.length === 0) return false;

    const lines = ["pairAddress,token0,token1,dex,txCount"];
    for (const pair of pairs) {
        lines.push(`${pair.pairAddress},${pair.token0},${pair.token1},${pair.dex},${pair.txCount}`);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Human-readable timestamp filename: dexworks-export-20260220-143022.csv
    a.download = `dexworks-export-${new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
}

/**
 * Export OHLCV candle data as a CSV file.
 * Each row: timestamp,open,high,low,close,volume
 */
export function exportOHLCV(
    candles: Array<{
        timestamp: string;
        open: number;
        high: number;
        low: number;
        close: number;
        volume?: number | null;
    }>,
    label: string
): void {
    if (candles.length === 0) return;

    const dateStr = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
    const safeName = label.replace(/[^A-Z0-9]/gi, "-").toUpperCase();

    const lines = ["timestamp,open,high,low,close,volume"];
    for (const c of candles) {
        lines.push(`${c.timestamp},${c.open},${c.high},${c.low},${c.close},${c.volume ?? 0}`);
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dexworks-ohlcv-${safeName}-${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}
