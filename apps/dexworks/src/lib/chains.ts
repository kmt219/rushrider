export interface ChainConfig {
    /** SCREAMING_SNAKE_CASE — used in GQL subscriptions and localStorage keys */
    gqlName: string;
    /** kebab-case — used in REST API paths and chainCaps lookup */
    restName: string;
    /** Human-readable display name */
    displayName: string;
    /** URL slug used in the router path (/:chainName) */
    slug: string;
    /** Whether this chain has MegaETH-specific KPIs (USDM supply) */
    isMegaeth: boolean;
    /** Ticker symbol of the native gas token (shown in whale tx table) */
    nativeCurrency: string;
}

export const SUPPORTED_CHAINS: ChainConfig[] = [
    {
        gqlName: "MEGAETH_MAINNET",
        restName: "megaeth-mainnet",
        displayName: "MegaETH",
        slug: "megaeth",
        isMegaeth: true,
        nativeCurrency: "ETH",
    },
    {
        gqlName: "MONAD_MAINNET",
        restName: "monad-mainnet",
        displayName: "Monad",
        slug: "monad",
        isMegaeth: false,
        nativeCurrency: "MON",
    },
    {
        gqlName: "BASE_MAINNET",
        restName: "base-mainnet",
        displayName: "Base",
        slug: "base",
        isMegaeth: false,
        nativeCurrency: "ETH",
    },
    {
        gqlName: "BSC_MAINNET",
        restName: "bsc-mainnet",
        displayName: "BNB Chain",
        slug: "bnb",
        isMegaeth: false,
        nativeCurrency: "BNB",
    },
    {
        gqlName: "TEMPO_MAINNET",
        restName: "tempo-mainnet",
        displayName: "Tempo",
        slug: "tempo",
        isMegaeth: false,
        nativeCurrency: "TEMPO",
    },
];

export const DEFAULT_CHAIN_GQL = "BASE_MAINNET";

export function getChainByGql(gqlName: string): ChainConfig {
    return SUPPORTED_CHAINS.find((c) => c.gqlName === gqlName) ?? SUPPORTED_CHAINS[0]!;
}

export function getChainBySlug(slug: string): ChainConfig | undefined {
    return SUPPORTED_CHAINS.find((c) => c.slug === slug);
}
