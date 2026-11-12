import type { OHLCVCandle } from "@goldrush-demos/shared-ui";

export type { OHLCVCandle };

export interface TokenInfo {
    contract_name: string;
    contract_ticker_symbol: string;
    contract_address: string;
    contract_decimals: number;
}

export interface TokenSearchResult {
    pair_address: string;
    /** ChainName enum value, e.g. BASE_MAINNET */
    chain_name: string;
    quote_rate: number | null;
    quote_rate_usd: number | null;
    volume: number | null;
    volume_usd: number | null;
    market_cap: number | null;
    base_token: TokenInfo;
    quote_token: TokenInfo;
}

/** A ridable track — one token/pair on one chain. */
export interface Track {
    chainGql: string;
    pairAddress: string | null;
    tokenAddress: string | null;
    symbol: string;
    name: string;
    priceUsd: number | null;
    /** 24h price % change — live from updatePairs, else derived from preview candles */
    pctChange24h: number | null;
}

export interface PairUpdate {
    pair_address: string;
    liquidity: number | null;
    market_cap: number | null;
    quote_rate: number | null;
    quote_rate_usd: number | null;
    last_24hr: {
        price: { pct_change: number | null } | null;
        volume_usd: { current_value: number | null } | null;
    } | null;
}

/** OHLCV interval/timeframe combo accepted by the streaming API. */
export interface Combo {
    interval: string;
    timeframe: string;
    label: string;
}

export type TimeframeId = "15M" | "1H" | "1D";

export type Difficulty = "EASY" | "MEDIUM" | "HARD" | "INSANE";
