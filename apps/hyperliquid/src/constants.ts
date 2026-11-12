import type { PrimaryTab } from "./types";

// Two-level category system
export const PRIMARY_TABS: PrimaryTab[] = [
    "All",
    "Perps",
    "Spot",
    "Crypto",
    "Tradfi",
    "HIP-3",
    "Outcome",
    "Trending",
    "Pre-launch",
];

export const SUBCATEGORIES: Record<string, readonly string[]> = {
    All: [],
    Perps: [],
    Spot: ["All", "USDC", "USDH", "USDT"],
    Crypto: ["All", "AI", "Meme", "DeFi", "Layer 1", "Layer 2", "Bridge", "Gaming", "RWA"],
    Tradfi: ["All", "Stocks", "Indices", "Commodities", "FX", "Pre-IPO"],
    "HIP-3": [],
    Outcome: [],
    Trending: [],
    "Pre-launch": [],
};

export { TRADFI_CATEGORY_MAP } from "./constants/tradfi";
export { CRYPTO_CATEGORY_MAP } from "./constants/crypto";
export { getMarketAlias } from "./constants/aliases";

// Public Hyperliquid Info API. Used directly for the types GoldRush does not yet
// serve natively (allMids, perpDexs, perpsAtOpenInterestCap, candleSnapshot,
// l2Book, recentTrades, fundingHistory).
export const HL_INFO_URL = "https://api.hyperliquid.xyz/info";

// GoldRush Hyperliquid Info API — a byte-for-byte drop-in for the public /info API,
// but only for the type values in GOLDRUSH_INFO_TYPES below. No rate limits and a
// <150ms p50 read target. Lives on a separate host, so routing supported types here
// also frees up the browser's ~6-concurrent-per-host budget on api.hyperliquid.xyz.
// Docs: https://goldrush.dev/docs/goldrush-hyperliquid/info-api/overview
export const GOLDRUSH_INFO_URL =
    (import.meta.env.VITE_GOLDRUSH_INFO_URL as string | undefined) ?? "https://hypercore.goldrushdata.com/info";

// The /info "type" values GoldRush serves natively. Anything not in this set must
// keep hitting HL_INFO_URL — GoldRush returns 400 {"error":"unsupported_type"} for
// unknown types and does NOT forward them upstream.
export const GOLDRUSH_INFO_TYPES: ReadonlySet<string> = new Set([
    "metaAndAssetCtxs",
    "spotMetaAndAssetCtxs",
    "outcomeMeta",
]);
