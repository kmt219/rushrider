const OHLCV_FIELDS = `
    timestamp
    open
    high
    low
    close
    volume
    volume_usd
    quote_rate_usd`;

export function buildOHLCVPairQuery(chainName: string, pairAddress: string, interval: string, timeframe: string) {
    return `
subscription {
  ohlcvCandlesForPair(
    chain_name: ${chainName}
    pair_addresses: ["${pairAddress}"]
    interval: ${interval}
    timeframe: ${timeframe}
  ) {${OHLCV_FIELDS}
  }
}`;
}

export function buildOHLCVTokenQuery(chainName: string, tokenAddress: string, interval: string, timeframe: string) {
    return `
subscription {
  ohlcvCandlesForToken(
    chain_name: ${chainName}
    token_addresses: ["${tokenAddress}"]
    interval: ${interval}
    timeframe: ${timeframe}
  ) {${OHLCV_FIELDS}
  }
}`;
}

const UPDATE_FIELDS = `
    pair_address
    liquidity
    market_cap
    quote_rate
    quote_rate_usd
    last_24hr {
      price { pct_change }
      volume_usd { current_value }
    }`;

export function buildUpdatePairsQuery(chainName: string, pairAddresses: string[]) {
    const addressList = pairAddresses.map((a) => `"${a}"`).join(", ");
    return `
subscription {
  updatePairs(
    chain_name: ${chainName},
    pair_addresses: [${addressList}]
  ) {${UPDATE_FIELDS}
  }
}`;
}

export function buildUpdateTokensQuery(chainName: string, tokenAddresses: string[]) {
    const addressList = tokenAddresses.map((a) => `"${a}"`).join(", ");
    return `
subscription {
  updateTokens(
    chain_name: ${chainName},
    token_addresses: [${addressList}]
  ) {${UPDATE_FIELDS}
  }
}`;
}

/**
 * Token search — uses a GraphQL variable instead of string interpolation so
 * user input with quotes/newlines cannot break out of the string literal.
 */
export function buildTokenSearchQuery(searchQuery: string): { query: string; variables: { query: string } } {
    return {
        query: `
query SearchToken($query: String!) {
  searchToken(query: $query) {
    pair_address
    chain_name
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
