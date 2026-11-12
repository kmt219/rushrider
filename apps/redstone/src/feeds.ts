import type { FeedInfo } from "./types";

/**
 * Hardcoded list of RedStone price feeds available on MegaETH mainnet.
 * Source: RedStone Bolt push-based oracle integration.
 */
export const MEGAETH_FEEDS: FeedInfo[] = [
    // Major crypto
    { id: "REDSTONE-BTC", symbol: "BTC", name: "Bitcoin", category: "crypto" },
    { id: "REDSTONE-ETH", symbol: "ETH", name: "Ethereum", category: "crypto" },
    { id: "REDSTONE-SOL", symbol: "SOL", name: "Solana", category: "crypto" },
    { id: "REDSTONE-BNB", symbol: "BNB", name: "BNB", category: "crypto" },
    { id: "REDSTONE-XRP", symbol: "XRP", name: "XRP", category: "crypto" },
    { id: "REDSTONE-ADA", symbol: "ADA", name: "Cardano", category: "crypto" },
    { id: "REDSTONE-DOGE", symbol: "DOGE", name: "Dogecoin", category: "crypto" },

    // Stablecoins
    { id: "REDSTONE-USDT", symbol: "USDT", name: "Tether", category: "stablecoin" },
    { id: "REDSTONE-USDC", symbol: "USDC", name: "USD Coin", category: "stablecoin" },
];
