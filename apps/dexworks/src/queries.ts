export function buildWalletTxsQuery(chainName: string, walletAddresses: string[]): string {
    const addressList = walletAddresses.map((a) => `"${a}"`).join(",\n      ");
    // decoded_details is NOT requested: MegaETH (frontier chain) does not support
    // ABI-decoded fields in walletTxs — including them causes the subscription to
    // return no data despite a successful WebSocket connection. Same constraint as allTxs.
    return `
subscription {
  walletTxs(
    chain_name: ${chainName},
    wallet_addresses: [
      ${addressList}
    ]
  ) {
    tx_hash
    from_address
    to_address
    value
    chain_name
    block_signed_at
    block_height
    block_hash
    gas_used
    tx_offset
    successful
    decoded_type

    logs {
      emitter_address
      log_offset
      data
      topics
    }
  }
}
`;
}

export function buildNewPairsQuery(chainName: string): string {
    return `
subscription {
  newPairs(chain_name: ${chainName}) {
    chain_name
    protocol
    protocol_version
    pair_address
    deployer_address
    tx_hash
    block_signed_at
    liquidity
    supply
    market_cap
    event_name
    quote_rate
    quote_rate_usd
    base_token {
      contract_address
      contract_decimals
      contract_name
      contract_ticker_symbol
    }
    quote_token {
      contract_address
      contract_decimals
      contract_name
      contract_ticker_symbol
    }
  }
}`;
}

export function buildUpdatePairsQuery(chainName: string, pairAddresses: string[]): string {
    const addressList = pairAddresses.map((a) => `"${a}"`).join(",\n      ");
    return `
subscription {
  updatePairs(
    chain_name: ${chainName},
    pair_addresses: [${addressList}]
  ) {
    pair_address
    liquidity
    market_cap
    quote_rate
    quote_rate_usd
    last_1hr {
      price { pct_change }
      swap_count { current_value }
      volume_usd { current_value }
      buy_count { current_value }
      sell_count { current_value }
      unique_buyers { current_value }
      unique_sellers { current_value }
    }
    last_24hr {
      price { pct_change }
      volume_usd { current_value }
      unique_buyers { current_value }
      unique_sellers { current_value }
    }
  }
}`;
}

export function buildOHLCVQuery(
    chainName: string,
    pairAddress: string,
    interval: string = "ONE_MINUTE",
    timeframe: string = "ONE_HOUR"
): string {
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
    quote_rate_usd
  }
}`;
}

export function buildOHLCVTokenQuery(
    chainName: string,
    tokenAddress: string,
    interval: string = "ONE_MINUTE",
    timeframe: string = "ONE_HOUR"
): string {
    return `
subscription {
  ohlcvCandlesForToken(
    chain_name: ${chainName}
    token_addresses: ["${tokenAddress}"]
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
    quote_rate_usd
  }
}`;
}

/**
 * Token-based update subscription for order-book chains (e.g. Tempo) where
 * every pair shares the same orderbook contract address.  Uses token_addresses
 * instead of pair_addresses so each base token gets independent price updates.
 * Mirrors the structure of buildUpdatePairsQuery — callers normalize the
 * returned token_address field to pair_address before passing to handlePairUpdates.
 */
export function buildUpdateTokensQuery(chainName: string, tokenAddresses: string[]): string {
    const addressList = tokenAddresses.map((a) => `"${a}"`).join(",\n      ");
    return `
subscription {
  updateTokens(
    chain_name: ${chainName},
    token_addresses: [${addressList}]
  ) {
    pair_address
    liquidity
    market_cap
    quote_rate
    quote_rate_usd
    last_1hr {
      price { pct_change }
      swap_count { current_value }
      volume_usd { current_value }
      buy_count { current_value }
      sell_count { current_value }
      unique_buyers { current_value }
      unique_sellers { current_value }
    }
    last_24hr {
      price { pct_change }
      volume_usd { current_value }
      unique_buyers { current_value }
      unique_sellers { current_value }
    }
  }
}`;
}

export function buildGlobalTxsQuery(chainName: string): string {
    // Minimal query — only fields needed for KPI metrics.
    // decoded_details and logs are NOT requested: the allTxs global stream
    // does not support ABI-decoded fields and including them causes the
    // entire subscription to fail (no data arrives at all).
    return `
subscription {
  allTxs(
    chain_name: ${chainName}
  ) {
    tx_hash
    from_address
    to_address
    block_signed_at
    gas_used
    successful
  }
}
`;
}

/**
 * Returns a { query, variables } pair for token search.
 *
 * Using a GraphQL variable ($query: String!) instead of string interpolation
 * prevents injection attacks — user input with quotes, newlines, or other
 * special characters cannot break out of the string literal.
 */
export function buildTokenSearchQuery(searchQuery: string): { query: string; variables: { query: string } } {
    return {
        query: `
query SearchToken($query: String!) {
  searchToken(query: $query) {
    pair_address
    chain
    quote_rate
    quote_rate_usd
    volume
    volume_usd
    market_cap
    base_token {
      contract_name
      contract_ticker_symbol
      contract_address
      contract_decimals
    }
    quote_token {
      contract_name
      contract_ticker_symbol
      contract_address
      contract_decimals
    }
  }
}`,
        variables: { query: searchQuery },
    };
}
