export type ConnectionState = "idle" | "connecting" | "connected" | "disconnected" | "error";
export type GemTab = "momentum" | "gainers" | "losers" | "spikes" | "new";

export interface PriceSnapshot {
    timestamp: number;
    price: number;
}

export interface PairMetrics {
    pairAddress: string;

    // Price tracking for GAINERS/LOSERS
    priceHistory: PriceSnapshot[];
    currentPrice: number | null;
    priceChange1h: number | null;
    priceChange4h: number | null;
    priceChange24h: number | null;

    // Transaction velocity for MOMENTUM
    txTimestamps: number[];
    txRate1h: number;
    txRate4h: number;
    txRate24h: number;

    // Spike detection for SPIKES
    txRateBaseline: number;
    txRateStdDev: number;
    recentSpikeScore: number;

    // Unique wallet tracking for MAKERS column (first hour only — spec requirement)
    makersSet?: Set<string>;
    /** ms timestamp of pair's on-chain creation; gates makersSet to first hour */
    pairCreatedAt?: number;
    /** tx-count per wallet address — proxy for volume concentration (all-time, not gated) */
    makersTxCount?: Map<string, number>;

    /** Stream-sourced swap counts from updatePairs last_1hr data — more accurate than price-tick proxy */
    buys1h?: number;
    sells1h?: number;

    lastUpdated: number;
}

export interface Pair {
    pairAddress: string;
    token0: string;
    token1: string;
    dex: string;
    addedAt: number;
    /** Unix ms timestamp of the pair's on-chain creation (block_signed_at). Used for the AGE column. */
    pairedAt?: number;
    txCount: number;
    lastTx: TxData | null;
    metrics?: PairMetrics;
    liquidity?: number;
    market_cap?: number;
    quote_rate_usd?: number;
    /** Contract address of the base token — used for TokenLogo CDN lookup. */
    base_token_address?: string;
    /** Count of unique wallet addresses that have traded this pair (live, from stream). */
    makers?: number;
    /** True once the updatePairs stream has delivered at least one non-initial update for this pair. */
    lastMetricsLoaded?: boolean;
}

export interface TxLog {
    emitter_address: string;
    log_offset: number;
    data: string;
    topics: string[];
}

export interface TxData {
    tx_hash: string;
    from_address: string;
    to_address: string;
    value: string;
    chain_name: string;
    block_signed_at: string;
    block_height: number;
    block_hash: string;
    gas_used: number;
    tx_offset: number;
    successful: boolean;
    decoded_type: string;
    decoded_details: Record<string, unknown> | null;
    logs: TxLog[];
}

export interface TokenInfo {
    contract_address: string;
    contract_decimals: number;
    contract_name: string;
    contract_ticker_symbol: string;
}

export interface NewPairData {
    chain_name: string;
    protocol: string;
    protocol_version: string;
    pair_address: string;
    deployer_address: string;
    tx_hash: string;
    block_signed_at: string;
    liquidity: number;
    supply: number;
    market_cap: number;
    event_name: string;
    quote_rate: number;
    quote_rate_usd: number;
    base_token: TokenInfo;
    quote_token: TokenInfo;
    // Stamped once when the pair is first seen this session — used as spike baseline
    initial_quote_rate_usd?: number;
    // Legacy volume field (rarely populated; stream_vol_24h is preferred)
    volume_usd?: number;
    // Populated from updatePairs stream timeframe data — persisted in newPairs localStorage cache
    stream_pct_24h?: number; // last_24hr.price.pct_change
    stream_pct_1h?: number; // last_1hr.price.pct_change
    stream_vol_24h?: number; // last_24hr.volume_usd.current_value
    stream_vol_1h?: number; // last_1hr.volume_usd.current_value (fallback for pairs <24h old)
    stream_swaps_1h?: number; // last_1hr.swap_count.current_value
    stream_buys_1h?: number; // last_1hr.buy_count.current_value
    stream_sells_1h?: number; // last_1hr.sell_count.current_value
    stream_makers_24h?: number; // last_24hr.unique_buyers + unique_sellers
    stream_makers_1h?: number; // last_1hr.unique_buyers + unique_sellers (fallback)
}

export interface MetricValue {
    current_value: number | null;
    previous_value: number | null;
    pct_change: number | null;
}

export interface TimeframeMetrics {
    price?: MetricValue;
    swap_count?: MetricValue;
    volume_usd?: MetricValue;
    buy_count?: MetricValue;
    sell_count?: MetricValue;
    unique_buyers?: MetricValue;
    unique_sellers?: MetricValue;
}

export interface UpdatePairData {
    pair_address: string;
    liquidity: number;
    market_cap: number;
    quote_rate: number;
    quote_rate_usd: number;
    last_1hr?: TimeframeMetrics;
    last_24hr?: TimeframeMetrics;
}

export interface WhaleTx {
    tx: TxData;
    usdValue: number;
    type: string; // "transfer" | "swap" | "bridge" | "deposit" | "withdraw" | "approve"
    token: string; // ticker symbol
    receivedAt: number;
}

export type { OHLCVCandle } from "@goldrush-demos/shared-ui";

export type GemTimeframe = "1h" | "4h" | "24h";

// ── Holder Intelligence (GOLD-59) ────────────────────────────────────────────

export type ConcentrationTier = "safe" | "moderate" | "concentrated" | "dangerous";

/** Raw holder item returned by token_holders_v2 (after dead-address filtering) */
export interface HolderItem {
    address: string;
    balance: string; // raw uint256 as decimal string
    balance_quote?: number; // USD value if provided by API
}

/**
 * Aggregated holder concentration data computed from top-100 holders.
 * Serves both the inline HHI badge (Phase 1) and the bubble map (Phase 2).
 */
export interface ConcentrationData {
    hhi: number; // 0-100 normalized Herfindahl-Hirschman Index
    tier: ConcentrationTier;
    totalCount: number; // total holder count from pagination
    topHolderPct: number; // largest single holder's % of sampled supply
    top5HolderPct: number;
    top10HolderPct: number;
    recentLargeAccumulator: boolean; // topHolderPct > 10 (proxy for outsized accumulation)
    holderItems: HolderItem[]; // top-100 items, used by bubble map
    fetchedAt: number;
}

/** A positioned node in the D3 force-directed holder bubble map */
export interface HolderNode {
    address: string;
    balance: bigint;
    balance_quote?: number; // USD value if provided by API
    supplyPct: number; // % of sampled supply (dead addrs excluded)
    rank: number; // 1 = largest holder
    riskTier: "whale" | "large" | "medium" | "small";
    radius: number; // pixels
    color: string; // CSS variable string
    label: string; // shortened address
    clusterIds: string[]; // cluster IDs assigned in Phase 3
    // D3 simulation mutable fields (updated in-place by the force sim)
    x: number;
    y: number;
    vx: number;
    vy: number;
    fx: number | null; // null = free, non-null = pinned
    fy: number | null;
    // Live animation state (Phase 4 — set by useHolderStream)
    lastActivity: "buy" | "sell" | "transfer" | null;
    activityAt: number; // ms timestamp; animation fades after 2s
    // Entry animation flag — true for 600ms when node first appears (set by useHolderMap)
    entering?: boolean;
}

// ── Cluster X-Ray (Phase 3) ───────────────────────────────────────────────

export type ClusterReason = "shared_funder" | "temporal_correlation" | "direct_transfer";

export interface TransferItem {
    from_address: string;
    to_address: string;
    block_signed_at: string;
    value: string;
    contract_address?: string;
    tx_hash?: string;
}

/** A detected cluster of related wallets */
export interface Cluster {
    id: string; // "C0", "C1", … (stable index-based)
    members: string[]; // lowercase addresses
    confidence: number; // 0-1
    reason: ClusterReason;
    explanation: string;
    color: string; // from fixed palette
    combinedPct?: number; // computed after nodes are known
    fundingAddress?: string; // for shared_funder clusters: the common gas-funder wallet
}

/** Directed transfer edge between two top-holder addresses */
export interface TransferEdge {
    from: string; // lowercase address
    to: string; // lowercase address
    count: number; // number of transfers in this direction
}

// ── Live Holder Feed (Phase 4) ────────────────────────────────────────────

export interface HolderEvent {
    id: string; // tx_hash + address
    address: string;
    type: "buy" | "sell" | "transfer";
    receivedAt: number;
    txHash: string;
    valueUsd?: number; // approximate USD value of the transaction (best-effort from stream)
}

export interface TokenSearchResult {
    pair_address: string;
    chain: string;
    quote_rate: number;
    quote_rate_usd: number;
    volume: number;
    volume_usd: number;
    market_cap: number;
    base_token: TokenInfo;
    quote_token: TokenInfo;
}
