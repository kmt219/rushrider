// GoldRush Streaming GraphQL query builders
//
// Target chain: HYPERCORE_MAINNET (Hyperliquid's order-book L1)
//
// Confirmed working subscriptions on HYPERCORE_MAINNET (source: goldrush.mintlify.app/chains/hypercore):
//   • ohlcvCandlesForToken  — per-token OHLCV candles
//   • ohlcvCandlesForPair   — per-pair OHLCV candles
//   • walletTxs             — per-wallet decoded events (fills, funding, deposits, withdrawals)
//
// Not available on HYPERCORE_MAINNET:
//   • updateTokens / updatePairs / newPairs — EVM-only, not supported on HYPERCORE_MAINNET
//   • Any order-book or public-trade-feed subscription — no GoldRush equivalent exists;
//     use HL REST (l2Book, recentTrades) as the only source.

/**
 * OHLCV hourly candles for a single HYPERCORE coin (screener — price/volume/change).
 * token_addresses uses the coin name as the identifier (e.g. "BTC", "GOLD").
 * Both volume and volume_usd are requested; useGoldRushPrices uses whichever is populated.
 */
export function buildCoinOHLCVQuery(chainName: string, coin: string): string {
    return `
subscription {
  ohlcvCandlesForToken(
    chain_name: ${chainName}
    token_addresses: ["${coin}"]
    interval: ONE_HOUR
    timeframe: ONE_DAY
  ) {
    timestamp
    open
    high
    low
    close
    volume
    volume_usd
  }
}`;
}

/**
 * Batched OHLCV subscription for the screener — all coins in one subscription.
 * token_addresses accepts arrays; each message delivers candles for one token
 * identified by token_address. Replaces N per-coin subscriptions with one.
 */
export function buildBatchCoinOHLCVQuery(chainName: string, coins: string[]): string {
    const addrs = coins.map((c) => `"${c}"`).join(", ");
    return `
subscription {
  ohlcvCandlesForToken(
    chain_name: ${chainName}
    token_addresses: [${addrs}]
    interval: ONE_HOUR
    timeframe: ONE_DAY
  ) {
    token_address
    timestamp
    open
    high
    low
    close
    volume
    volume_usd
  }
}`;
}

/**
 * Lean walletTxs subscription for the public per-coin trade feed.
 * wallet_addresses: [] streams all network fills without wallet filter —
 * filter by coin client-side. Replaces HL REST recentTrades polling.
 */
export function buildPublicFillsQuery(chainName: string): string {
    return `
subscription {
  walletTxs(
    chain_name: ${chainName}
    wallet_addresses: []
  ) {
    from_address
    decoded_details {
      __typename
      ... on HypercoreFillTransaction {
        time
        coin
        price
        size
        side
        tid
        fee
        fee_token
        crossed
        liquidation {
          liquidated_user
          method
          market_price
        }
      }
    }
  }
}`;
}

/** Map UI timeframe labels to GoldRush interval/timeframe enum values. */
export function ohlcvParamsForTimeframe(tf: string): { interval: string; timeframe: string } {
    switch (tf) {
        case "1s":
            return { interval: "ONE_SECOND", timeframe: "ONE_MINUTE" };
        case "5m":
            return { interval: "ONE_MINUTE", timeframe: "ONE_HOUR" };
        case "1h":
            return { interval: "ONE_HOUR", timeframe: "ONE_DAY" };
        case "D":
        default:
            return { interval: "ONE_HOUR", timeframe: "ONE_DAY" };
    }
}

/**
 * Per-coin OHLCV subscription for the chart, with timeframe-aware interval.
 * Used by useGoldRushCandles — re-subscribed when coin or timeframe changes.
 */
export function buildChartOHLCVQuery(chainName: string, coin: string, tf: string): string {
    const { interval, timeframe } = ohlcvParamsForTimeframe(tf);
    return `
subscription {
  ohlcvCandlesForToken(
    chain_name: ${chainName}
    token_addresses: ["${coin}"]
    interval: ${interval}
    timeframe: ${timeframe}
  ) {
    timestamp
    open
    high
    low
    close
    volume_usd
  }
}`;
}

/**
 * Per-pair OHLCV subscription for the chart.
 * pair_address format: "xyz:GOLD-USDC", "flx:OIL-USDH", etc.
 * Provides base_token/quote_token metadata alongside candle data.
 */
export function buildPairOHLCVQuery(chainName: string, pairAddress: string, tf: string): string {
    const { interval, timeframe } = ohlcvParamsForTimeframe(tf);
    return `
subscription {
  ohlcvCandlesForPair(
    chain_name: ${chainName}
    pair_addresses: ["${pairAddress}"]
    interval: ${interval}
    timeframe: ${timeframe}
  ) {
    timestamp
    open
    high
    low
    close
    volume
    volume_usd
    base_token {
      contract_ticker_symbol
    }
    quote_token {
      contract_ticker_symbol
    }
  }
}`;
}

/**
 * Per-wallet decoded event stream for HYPERCORE_MAINNET.
 * Delivers fills, funding events, deposits, withdrawals, and ledger entries
 * for the specified wallet addresses in real time.
 *
 * Use HypercoreFillTransaction fragments to get trade fills per wallet.
 * Use HypercoreFundingEvent fragments to get per-wallet funding payments.
 *
 * Note: this is wallet-scoped — it cannot replace a public per-coin trade feed.
 */
export function buildWalletTxsQuery(chainName: string, walletAddresses: string[]): string {
    const addrs = walletAddresses.map((a) => `"${a}"`).join(", ");
    return `
subscription {
  walletTxs(
    chain_name: ${chainName}
    wallet_addresses: [${addrs}]
  ) {
    tx_hash
    block_height
    block_signed_at
    from_address
    successful
    decoded_details {
      __typename
      ... on HypercoreFillTransaction {
        type
        hash
        time
        coin
        price
        size
        side
        oid
        tid
        fee
        fee_token
        closed_pnl
        dir
        start_position
        crossed
        liquidation {
          liquidated_user
          method
          market_price
        }
      }
      ... on HypercoreFundingEvent {
        type
        hash
        time
        coin
        funding_rate
        funding_amount
        szi
      }
      ... on HypercoreDepositEvent {
        type
        hash
        time
        amount
      }
      ... on HypercoreWithdrawalEvent {
        type
        hash
        time
        amount
      }
    }
  }
}`;
}
