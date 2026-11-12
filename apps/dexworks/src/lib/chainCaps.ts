/**
 * chainCaps — per-chain capability flags + Covalent REST proxy helper.
 *
 * Chain capability flags guard calls to endpoints that are not yet
 * indexed / supported for a given chain, preventing 404 floods and
 * "FieldUndefined" streaming errors in the console.
 *
 * proxyFetch routes all Covalent REST calls through the server-side
 * /api/covalent-proxy edge function to:
 *   1. Avoid CORS issues from redirect-following (transactions_v3).
 *   2. Keep the Covalent API key out of the browser bundle.
 */

export interface ChainCapabilities {
    /** xy=k DEX endpoints (supported_dexes, pools) are indexed for this chain. */
    supportedDexes: boolean;
    /** token_holders_v2 endpoint is indexed for this chain. */
    tokenHolders: boolean;
    /** allTxs global streaming subscription is supported for this chain. */
    globalAllTxsStream: boolean;
    /**
     * General Covalent REST API (tokens, events, transactions, balances, pricing)
     * is available for this chain. When false, all REST-backed safety signals
     * (deployer reputation, contract analysis, holder concentration, spot price,
     * tx summary) are skipped entirely rather than making requests that return 501.
     */
    restApi: boolean;
    /**
     * When true, OHLCV data is fetched via ohlcvCandlesForToken (base token address)
     * rather than ohlcvCandlesForPair (pair address). Use for chains like Tempo that
     * use an order book model without unique pair contract addresses.
     */
    useTokenAddressForOhlcv: boolean;
}

const DEFAULTS: ChainCapabilities = {
    supportedDexes: true,
    tokenHolders: true,
    globalAllTxsStream: true,
    restApi: true,
    useTokenAddressForOhlcv: false,
};

/**
 * Keyed by kebab-case REST chain name (e.g. "megaeth-mainnet").
 * Only list chains that deviate from the defaults above.
 *
 * Monad ("monad-mainnet") uses all defaults (all true) — no override needed.
 * If testing reveals specific unsupported endpoints, add a "monad-mainnet" entry.
 */
const CAPS: Record<string, Partial<ChainCapabilities>> = {
    "megaeth-mainnet": {
        supportedDexes: false, // xy=k not yet indexed → 404
        tokenHolders: false, // token_holders_v2 not yet indexed → 404
        globalAllTxsStream: false, // allTxs subscription not supported → FieldUndefined
    },
    "tempo-mainnet": {
        supportedDexes: false, // xy=k not yet indexed → 501
        tokenHolders: false, // token_holders_v2 not yet indexed → 501
        globalAllTxsStream: false, // allTxs subscription not confirmed for Tempo
        restApi: false, // Covalent REST API returns 501 for all standard endpoints on Tempo
        useTokenAddressForOhlcv: true, // Tempo uses order book — no unique pair addresses; use base token address for OHLCV
    },
};

/** Returns the resolved capabilities for a kebab-case REST chain name. */
export function getChainCaps(restChainName: string): ChainCapabilities {
    return { ...DEFAULTS, ...CAPS[restChainName] };
}

/**
 * Fetch from the Covalent REST API via the server-side proxy.
 *
 * @param path   Path under /v1/, e.g. "megaeth-mainnet/block_v2/latest/"
 *               (no leading slash, no /v1/ prefix).
 * @param params Additional query parameters forwarded to Covalent.
 *               The API key is injected server-side — do not pass it here.
 */
export function proxyFetch(path: string, params: Record<string, string> = {}): Promise<Response> {
    const url = new URL("/api/covalent-proxy", window.location.origin);
    url.searchParams.set("path", path);
    for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
    }
    return fetch(url.toString());
}
