/**
 * getUsdmSupply — compact async function to fetch USDM totalSupply.
 *
 * Strategy (in order):
 *   1. GoldRush REST API — /v1/{chain}/tokens/{contract}/token_holders_v2/
 *      (supplies `total_supply` in the pagination response; ~404 on megaeth-mainnet
 *       until indexing lands, which triggers the fallback immediately)
 *   2. GoldRush REST API — /v1/{chain}/events/address/{contract}/
 *      summing mint Transfer events (topic0 = Transfer, topic1 = zero address)
 *      as a best-effort estimate; skipped if the chain returns no events.
 *   3. Direct eth_call to MegaETH RPC — the authoritative source; no CORS in
 *      Node.js / server runtimes; browser callers should proxy through /api/rpc.
 *
 * Features:
 *   - Retry 3× with exponential backoff on each source before falling through.
 *   - 5-minute in-process Map cache keyed by chain name.
 *   - Returns a discriminated union so callers can type-narrow { ok: true } vs
 *     { ok: false } without try/catch.
 *   - console.log on success, console.error on final failure (no silent swallowing).
 *
 * Deps: none beyond the Fetch API (built-in in Node ≥18 and all browsers).
 *   Ethers.js is NOT required — totalSupply() ABI encoding is just `0x18160ddd`.
 *
 * Test call at the bottom of the file (run with: npx tsx src/lib/getUsdmSupply.ts).
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USDM_CONTRACT = "0x587F6eeAfc7Ad567e96eD1B62775fA6402164b22";
const USDM_DECIMALS = 18n;

/** keccak256("totalSupply()") selector */
const TOTAL_SUPPLY_SELECTOR = "0x18160ddd";

/**
 * keccak256("Transfer(address,address,uint256)")
 * Standard ERC-20 Transfer topic; used to identify mint events (from == 0x0).
 */
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const ZERO_TOPIC = "0x0000000000000000000000000000000000000000000000000000000000000000";

/** MegaETH public RPC — used for eth_call fallback. */
const MEGAETH_RPC = "https://carrot.megaeth.com/";

const GOLDRUSH_BASE = "https://api.goldrush.dev/v1";

// Read from environment — set GOLDRUSH_API_KEY when running this script directly.
// Example: GOLDRUSH_API_KEY=cqt_xxx npx tsx apps/dexworks/src/lib/getUsdmSupply.ts
const GOLDRUSH_API_KEY = process.env.GOLDRUSH_API_KEY ?? "";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface UsdmSupplyResult {
    raw: bigint;
    formatted: string;
    /** Unix ms timestamp of when the value was fetched. */
    timestamp: number;
}

export type UsdmSupplyOutcome = ({ ok: true } & UsdmSupplyResult) | { ok: false; error: string };

// ---------------------------------------------------------------------------
// In-process cache (Map — survives within one Node process / browser session)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1_000; // 5 minutes

const _cache = new Map<string, { result: UsdmSupplyResult; ts: number }>();

function _getCached(key: string): UsdmSupplyResult | null {
    const entry = _cache.get(key);
    if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.result;
    return null;
}

function _setCached(key: string, result: UsdmSupplyResult): void {
    _cache.set(key, { result, ts: Date.now() });
}

// ---------------------------------------------------------------------------
// Retry helper
// ---------------------------------------------------------------------------

async function _withRetry<T>(fn: () => Promise<T>, attempts = 3, baseMs = 500): Promise<T> {
    let last: unknown;
    for (let i = 0; i < attempts; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, baseMs * 2 ** (i - 1)));
        try {
            return await fn();
        } catch (e) {
            last = e;
        }
    }
    throw last;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function _fmt(raw: bigint): string {
    const n = Number(raw / 10n ** USDM_DECIMALS);
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B USDM`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M USDM`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K USDM`;
    return `${n.toFixed(2)} USDM`;
}

// ---------------------------------------------------------------------------
// Source 1 — GoldRush token_holders_v2 (returns total_supply in pagination)
// ---------------------------------------------------------------------------

async function _fetchViaTokenHolders(chain: string): Promise<bigint> {
    const url =
        `${GOLDRUSH_BASE}/${chain}/tokens/${USDM_CONTRACT}/token_holders_v2/` + `?key=${GOLDRUSH_API_KEY}&page-size=1`;

    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`GoldRush token_holders HTTP ${res.status}`);
    }
    const json = (await res.json()) as {
        data?: {
            pagination?: { total_count?: number };
            items?: Array<{ total_supply?: string; contract_decimals?: number }>;
        };
        error?: boolean;
        error_message?: string;
    };
    if (json.error) throw new Error(`GoldRush: ${json.error_message ?? "API error"}`);

    // total_supply lives on each item's token metadata in this endpoint
    const ts = json.data?.items?.[0]?.total_supply;
    if (!ts) throw new Error("GoldRush token_holders: total_supply field absent");
    return BigInt(ts);
}

// ---------------------------------------------------------------------------
// Source 2 — GoldRush events/address — sum mint Transfers (from == 0x0)
//
// This provides a best-effort on-chain supply snapshot. It only covers events
// indexed so far; for a freshly-indexed chain the result may undercount.
// The function requests only the latest page and returns the *running total*
// included in the first response item's transfer value, which for many chains
// is the full minted supply if mints are rare.
// ---------------------------------------------------------------------------

async function _fetchViaMintEvents(chain: string): Promise<bigint> {
    const url =
        `${GOLDRUSH_BASE}/${chain}/events/address/${USDM_CONTRACT}/` +
        `?key=${GOLDRUSH_API_KEY}` +
        `&topic0=${TRANSFER_TOPIC}` +
        `&topic1=${ZERO_TOPIC}` + // from == 0x0 → mint
        `&page-size=1000`;

    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`GoldRush events HTTP ${res.status}`);
    }
    const json = (await res.json()) as {
        data?: {
            items?: Array<{ decoded?: { params?: Array<{ name: string; value: string }> } }>;
        };
        error?: boolean;
        error_message?: string;
    };
    if (json.error) throw new Error(`GoldRush events: ${json.error_message ?? "API error"}`);

    const items = json.data?.items ?? [];
    if (items.length === 0) throw new Error("GoldRush events: no mint events found");

    // Sum the `value` param across all returned mint Transfer events.
    let total = 0n;
    for (const item of items) {
        const params = item.decoded?.params ?? [];
        const valueParam = params.find((p) => p.name === "value");
        if (valueParam?.value) total += BigInt(valueParam.value);
    }
    if (total === 0n) throw new Error("GoldRush events: summed mints == 0");
    return total;
}

// ---------------------------------------------------------------------------
// Source 3 — Direct eth_call (authoritative; no CORS in Node ≥18)
// ---------------------------------------------------------------------------

async function _fetchViaRpc(rpcUrl = MEGAETH_RPC): Promise<bigint> {
    const body = JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_call",
        params: [{ to: USDM_CONTRACT, data: TOTAL_SUPPLY_SELECTOR }, "latest"],
        id: 1,
    });

    const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
    });
    if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);

    const json = (await res.json()) as { result?: string; error?: { message?: string } };
    if (json.error) throw new Error(`eth_call: ${json.error.message ?? JSON.stringify(json.error)}`);
    if (!json.result) throw new Error("eth_call: empty result");

    return BigInt(json.result);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Fetch USDM totalSupply for the given chain.
 *
 * @example
 * const out = await getUsdmSupply("megaeth-mainnet");
 * if (out.ok) console.log(out.formatted); // "123.45M USDM"
 * else console.error(out.error);
 */
export async function getUsdmSupply(chain: "megaeth-mainnet"): Promise<UsdmSupplyOutcome> {
    const cacheKey = `${chain}:${USDM_CONTRACT}`;

    // Serve from cache if fresh
    const cached = _getCached(cacheKey);
    if (cached) {
        const ageS = Math.round((Date.now() - cached.timestamp) / 1_000);
        console.log(`[USDM] cache hit — ${cached.formatted} (${ageS}s old)`);
        return { ok: true, ...cached };
    }

    const errors: string[] = [];

    // --- Source 1: GoldRush token_holders_v2 ---
    try {
        const raw = await _withRetry(() => _fetchViaTokenHolders(chain));
        const result: UsdmSupplyResult = { raw, formatted: _fmt(raw), timestamp: Date.now() };
        _setCached(cacheKey, result);
        console.log(`[USDM] ✅ GoldRush token_holders → ${result.formatted} (raw ${raw})`);
        return { ok: true, ...result };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`token_holders: ${msg}`);
        console.warn(`[USDM] token_holders failed: ${msg}`);
    }

    // --- Source 2: GoldRush mint events sum ---
    try {
        const raw = await _withRetry(() => _fetchViaMintEvents(chain));
        const result: UsdmSupplyResult = { raw, formatted: _fmt(raw), timestamp: Date.now() };
        _setCached(cacheKey, result);
        console.log(`[USDM] ✅ GoldRush mint events → ${result.formatted} (raw ${raw})`);
        return { ok: true, ...result };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`events: ${msg}`);
        console.warn(`[USDM] mint events failed: ${msg}`);
    }

    // --- Source 3: Direct RPC eth_call ---
    try {
        const raw = await _withRetry(() => _fetchViaRpc());
        const result: UsdmSupplyResult = { raw, formatted: _fmt(raw), timestamp: Date.now() };
        _setCached(cacheKey, result);
        console.log(`[USDM] ✅ RPC eth_call → ${result.formatted} (raw ${raw})`);
        return { ok: true, ...result };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`rpc: ${msg}`);
        console.error(`[USDM] ❌ all sources exhausted: ${errors.join(" | ")}`);
        return { ok: false, error: errors.join(" | ") };
    }
}

// ---------------------------------------------------------------------------
// Test call — run directly with:  npx tsx apps/dexworks/src/lib/getUsdmSupply.ts
// ---------------------------------------------------------------------------

if (typeof process !== "undefined" && process.argv[1]?.endsWith("getUsdmSupply.ts")) {
    console.log("[USDM] Running test call against megaeth-mainnet…");
    getUsdmSupply("megaeth-mainnet").then((out) => {
        if (out.ok) {
            console.log("[USDM] Result:", {
                formatted: out.formatted,
                raw: out.raw.toString(),
                timestamp: new Date(out.timestamp).toISOString(),
            });
        } else {
            console.error("[USDM] Error:", out.error);
            process.exitCode = 1;
        }
    });
}
