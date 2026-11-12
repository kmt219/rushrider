export interface ChainConfig {
    /** SCREAMING_SNAKE_CASE ChainName enum value — used in GQL operations and localStorage keys */
    gqlName: string;
    /** Human-readable display name */
    displayName: string;
    /** Order-book chains use token-based subscriptions (updateTokens) instead of pair-based */
    isOrderBook: boolean;
    /** Trustwallet blockchain slug for the logo CDN; absent → monogram fallback */
    twSlug?: string;
}

/** Mirrors the ChainName enum on wss://streaming.goldrushdata.com/graphql */
export const SUPPORTED_CHAINS: ChainConfig[] = [
    { gqlName: "BASE_MAINNET", displayName: "Base", isOrderBook: false, twSlug: "base" },
    { gqlName: "ETH_MAINNET", displayName: "Ethereum", isOrderBook: false, twSlug: "ethereum" },
    { gqlName: "BSC_MAINNET", displayName: "BNB", isOrderBook: false, twSlug: "smartchain" },
    { gqlName: "SOLANA_MAINNET", displayName: "Solana", isOrderBook: false, twSlug: "solana" },
    { gqlName: "POLYGON_MAINNET", displayName: "Polygon", isOrderBook: false, twSlug: "polygon" },
    { gqlName: "HYPEREVM_MAINNET", displayName: "HyperEVM", isOrderBook: false },
    { gqlName: "HYPERCORE_MAINNET", displayName: "Hypercore", isOrderBook: true },
    { gqlName: "MONAD_MAINNET", displayName: "Monad", isOrderBook: false },
    { gqlName: "MEGAETH_MAINNET", displayName: "MegaETH", isOrderBook: false },
    { gqlName: "TEMPO_MAINNET", displayName: "Tempo", isOrderBook: true },
];

export const DEFAULT_CHAIN_GQL = "BASE_MAINNET";

export function getChainByGql(gqlName: string): ChainConfig {
    return SUPPORTED_CHAINS.find((c) => c.gqlName === gqlName) ?? SUPPORTED_CHAINS[0]!;
}
