export type MarketClass = "hip-3" | "hip-4" | "tradfi" | "perp" | "spot" | "pre-launch";

export interface HIP3Market {
    coin: string;
    name: string;
    builder: string;
    category: string;
    /** Quote currency for this market (e.g. "USDC", "USDH", "USDT"). */
    quoteToken: string;
    marketClass: MarketClass;
    leverage: string;
    settlement: "xyz" | "cash";
    type?: "perp" | "spot";
    makerFee: number;
    takerFee: number;
    markPx: number;
    indexPx: number;
    change24h: number; // fractional, e.g. 0.04 = +4%
    change24hAbs: number; // absolute price change in USD, e.g. +3.795
    volume24h: number;
    openInterest: number;
    oiCap: number;
    fundingRate: number;
    fundingHistory: number[];
    makerTakerRatio: number;
    liqCount24h: number;
    tradeCount24h: number;
    lastTradeTime: string;
    spreadBps: number;
    topBidPx: number;
    topAskPx: number;
    topBidSz: number;
    topAskSz: number;
    // ── New fields from node stream ──────────────────────────────
    makerVolume24h: number; // volume where crossed=false
    takerVolume24h: number; // volume where crossed=true
    liquidationVolume24h: number;
    backstopLiqRate: number; // 0–1 fraction that are BACKSTOP
    lastLiquidation: LiveLiquidation | null;
    orderFlowImbalance: number; // (buyOrderVol - sellOrderVol) / totalOrderVol, range -1..1
    cancelToFillRatio: number; // cancelled orders / filled orders
    bookImbalance: number; // bidDepth / (bidDepth + askDepth)
    bidDepth: number; // total USD depth on bid side
    askDepth: number;
    builderRevenue24h: number; // sum of builder_fee across all fills
    avgBuilderFeeRate: number; // builderRevenue24h / volume24h
    uniqueTraders24h: number; // distinct user_address count in fills
    netCapitalFlow24h: number; // deposits - withdrawals
    oiUtilization: number; // openInterest / oiCap
    isAtCap: boolean; // oiUtilization >= 0.99
    premiumBps: number; // (markPx - oraclePx) / oraclePx * 10000 — basis in bps
    // ── New fields from GoldRush + edge computation ──────────────
    predictedFundingRate: number; // (markPx - indexPx) / indexPx [indexPx = oraclePx in HL API], HL's predicted 8h rate
    oiDeltaRefresh: number; // OI change since last data refresh (~2–5 min window, not 24h)
    longShortRatio: number; // 0–1 fraction long, estimated from premiumBps
    change1h: number; // 1h price change fractional (from GoldRush OHLCV; 0 when unavailable)
    /** Quote asset for spot markets (USDC / USDH / USDT). Separate from `category`
     *  so the display badge shows the token's semantic sector, not its quote currency. */
    quoteAsset?: string;
}

export interface HIP3Builder {
    name: string;
    address: string;
    marketCount: number;
    totalVolume24h: number;
    totalFees24h: number;
    markets: string[];
    activeUsers24h: number;
}

export interface MockTrade {
    id: string;
    coin: string;
    px: number;
    sz: number;
    side: "B" | "A";
    crossed: boolean;
    time: string;
    user: string;
    liquidation: boolean;
    makerFee: number;
    takerFee: number;
}

export interface MockLiquidation {
    id: string;
    coin: string;
    user: string;
    side: "long" | "short";
    sz: number;
    markPx: number;
    liqPx: number;
    method: "liquidation" | "backstop";
    time: string;
}

export interface LiveLiquidation {
    id: string;
    coin: string;
    user: string;
    sz: number;
    markPx: number;
    method: "MARKET" | "BACKSTOP";
    time: string;
}

export interface CandleBar {
    time: number; // unix ms, floored to 1-minute bucket
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number; // USD notional
}

export interface MockCandle {
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface OrderBookLevel {
    price: number;
    size: number;
}

export interface OrderBook {
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
}

export interface FundingSnapshot {
    time: string;
    rate: number;
    premium: number;
}

export type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

export type PrimaryTab =
    | "All"
    | "Perps"
    | "Spot"
    | "Crypto"
    | "Tradfi"
    | "HIP-3"
    | "Outcome"
    | "Trending"
    | "Pre-launch";

export type SortField =
    | "coin"
    | "markPx"
    | "change24h"
    | "change1h"
    | "volume24h"
    | "openInterest"
    | "fundingRate"
    | "makerTakerRatio"
    | "liqCount24h"
    | "spreadBps"
    | "uniqueTraders24h"
    | "orderFlowImbalance"
    | "oiUtilization"
    | "premiumBps";

export type SortDirection = "asc" | "desc";

export interface SortConfig {
    field: SortField;
    direction: SortDirection;
}

export interface Filters {
    search: string;
    builders: string[];
    subcategories: string[];
    minVolume: number;
    primaryTab: PrimaryTab;
}

export type ActiveTab = "markets";

export interface WSMessage {
    type: "trade" | "liquidation" | "funding";
    coin: string;
    [key: string]: unknown;
}

// ─── Raw Node Stream Types ────────────────────────────────────────────────

export interface RawFillLiquidation {
    liquidated_user: string;
    mark_px: string;
    method: "MARKET" | "BACKSTOP";
}

export interface RawFillEvent {
    user_address: string;
    coin: string;
    px: string;
    sz: string;
    side: "B" | "A";
    start_position: string;
    dir: string;
    closed_pnl: string;
    crossed: boolean; // true = taker, false = maker
    fee: string;
    builder_fee: string;
    liquidation?: RawFillLiquidation;
}

export interface RawNodeFillsByBlock {
    block_number: number | string;
    block_time: string;
    local_time: string;
    events: RawFillEvent[];
}

export interface RawTradeEvent {
    coin: string;
    px: string;
    sz: string;
    side: "B" | "A";
    users: string[];
}

export interface RawNodeTradesByBlock {
    block_number: number | string;
    block_time: string;
    events: RawTradeEvent[];
}

export interface RawOrderInfo {
    coin: string;
    side: "B" | "A";
    limit_px: string;
    sz: string;
    orig_sz: string;
    order_type: string;
    tif: string;
    reduce_only: boolean;
    is_trigger: boolean;
    trigger_px: string;
}

export interface RawOrderEvent {
    builder: string;
    user: string;
    status: "open" | "cancelled" | "filled" | "rejected" | "triggered";
    order: RawOrderInfo;
}

export interface RawOrdersByBlock {
    block_number: number | string;
    block_time: string;
    events: RawOrderEvent[];
}

export interface RawFundingEvent {
    coin: string;
    funding_rate: string;
    n_samples: string;
    szi: string;
    usdc: string;
}

export interface RawLiquidationEvent {
    user: string;
    liquidated_ntl_pos: string;
    account_value: string;
    leverage_type: string;
    positions: { coin: string; sz: string }[];
}

export interface RawCapitalEvent {
    type: "deposit" | "withdrawal" | "perp_transfer";
    user: string;
    usdc: string;
    to_perp: boolean;
}

export interface RawMiscEventsByBlock {
    block_number: number | string;
    block_time: string;
    funding: RawFundingEvent[];
    liquidations: RawLiquidationEvent[];
    capital: RawCapitalEvent[];
}

// Discriminated union for the decoded WebSocket envelope
export type NodeStreamMessage =
    | { type: "fills"; payload: RawNodeFillsByBlock }
    | { type: "trades"; payload: RawNodeTradesByBlock }
    | { type: "orders"; payload: RawOrdersByBlock }
    | { type: "misc"; payload: RawMiscEventsByBlock };
