/**
 * Build the ohlcvCandlesForPair subscription query for a RedStone feed.
 *
 * The pair address format is "REDSTONE-{symbol}" (e.g. REDSTONE-BTC),
 * unlike dexworks which uses hex contract addresses.
 */
export function buildOHLCVQuery(
    chainName: string,
    feedSymbol: string,
    interval: string = "ONE_MINUTE",
    timeframe: string = "ONE_HOUR"
): string {
    return `
subscription {
  ohlcvCandlesForPair(
    chain_name: ${chainName}
    pair_addresses: ["REDSTONE-${feedSymbol}"]
    interval: ${interval}
    timeframe: ${timeframe}
  ) {
    timestamp
    open
    high
    low
    close
    volume
  }
}`;
}
