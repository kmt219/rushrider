const CHAIN_NAME = "MEGAETH_MAINNET";

type OHLCVInterval = "1s" | "1m" | "1h";

/**
 * Build the GoldRush OHLCV API URL for a RedStone feed.
 */
export function buildApiUrl(feedSymbol: string, interval: OHLCVInterval): string {
    return `https://api.covalenthq.com/v1/pricing/ohlcv/${CHAIN_NAME}/redstone/${feedSymbol}?interval=${interval}`;
}
