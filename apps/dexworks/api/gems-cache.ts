/**
 * /api/gems-cache — server-side KV cache for computed gem lists.
 *
 * Stores the pre-computed GAINERS / LOSERS / SPIKES / MOMENTUM tab results
 * in Vercel KV (backed by Upstash Redis) so any user sees instant data on
 * their very first dashboard load — before they have any localStorage history.
 *
 * Flow:
 *  1. On load   → GET /api/gems-cache?chain=MEGAETH_MAINNET
 *                 Client merges server data into gemResultsCache (fills empty tabs).
 *  2. After computing gemsData (non-empty) → POST /api/gems-cache?chain=...
 *                 Keeps the server cache fresh with the latest computed results.
 *
 * KV env vars (auto-provisioned by Vercel when you add a KV store, or set manually
 * for Upstash Redis):
 *   KV_REST_API_URL    — Upstash REST API base URL
 *   KV_REST_API_TOKEN  — Upstash REST API token (bearer)
 *
 * Graceful degradation: if KV is not configured the endpoint returns empty arrays
 * and silently skips writes — the client falls back to localStorage only.
 *
 * Deployed automatically by Vercel from the api/ directory as an Edge Function.
 * During local dev, Vite's configureServer middleware (vite.config.ts) provides
 * an equivalent in-memory handler.
 */

export const config = { runtime: "edge" };

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
} as const;

const TTL_SECONDS = 6 * 60 * 60; // 6 h — matches client-side cache TTL
const TABS = ["gainers", "losers", "spikes", "momentum"] as const;
type Tab = (typeof TABS)[number];
type GemEntry = Record<string, unknown>;
type GemsPayload = Partial<Record<Tab, GemEntry[]>>;

function cacheKey(chain: string, tab: string): string {
    return `dexworks:gems:${chain}:${tab}`;
}

/** Read a single key from Upstash Redis via the REST API. */
async function kvGet(kvUrl: string, kvToken: string, key: string): Promise<GemEntry[] | null> {
    try {
        const res = await fetch(`${kvUrl}/get/${encodeURIComponent(key)}`, {
            headers: { Authorization: `Bearer ${kvToken}` },
        });
        if (!res.ok) return null;
        const { result } = (await res.json()) as { result: string | null };
        if (!result) return null;
        const parsed: unknown = JSON.parse(result);
        return Array.isArray(parsed) ? (parsed as GemEntry[]) : null;
    } catch {
        return null;
    }
}

/** Write multiple key-value pairs atomically via the Upstash pipeline API. */
async function kvSetMany(kvUrl: string, kvToken: string, entries: [string, GemEntry[]][]): Promise<void> {
    const pipeline = entries.map(([key, value]) => ["SET", key, JSON.stringify(value), "EX", String(TTL_SECONDS)]);
    await fetch(`${kvUrl}/pipeline`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${kvToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(pipeline),
    });
}

export default async function handler(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS });
    }

    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;
    const url = new URL(request.url);
    const chain = url.searchParams.get("chain") ?? "MEGAETH_MAINNET";

    // GET — return all four tab caches in a single response
    if (request.method === "GET") {
        const empty: GemsPayload = Object.fromEntries(TABS.map((t) => [t, []]));

        if (!kvUrl || !kvToken) {
            return new Response(JSON.stringify(empty), {
                headers: { "Content-Type": "application/json", ...CORS },
            });
        }

        const results = await Promise.all(TABS.map((tab) => kvGet(kvUrl, kvToken, cacheKey(chain, tab))));
        const data: GemsPayload = {};
        for (let i = 0; i < TABS.length; i++) {
            data[TABS[i]] = results[i] ?? [];
        }

        return new Response(JSON.stringify(data), {
            headers: {
                "Content-Type": "application/json",
                // CDN caches 60 s, serves stale for 5 min while revalidating.
                // Short s-maxage keeps data reasonably fresh without hammering KV.
                "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
                ...CORS,
            },
        });
    }

    // POST — update the cache with fresh computed gem data from the client
    if (request.method === "POST") {
        if (!kvUrl || !kvToken) {
            // KV not configured — acknowledge silently so the client doesn't retry
            return new Response(JSON.stringify({ ok: true }), {
                headers: { "Content-Type": "application/json", ...CORS },
            });
        }

        try {
            const body = (await request.json()) as GemsPayload;
            const entries: [string, GemEntry[]][] = [];
            for (const tab of TABS) {
                const arr = body[tab];
                if (Array.isArray(arr) && arr.length > 0) {
                    entries.push([cacheKey(chain, tab), arr]);
                }
            }
            if (entries.length > 0) {
                await kvSetMany(kvUrl, kvToken, entries);
            }
            return new Response(JSON.stringify({ ok: true }), {
                headers: { "Content-Type": "application/json", ...CORS },
            });
        } catch {
            return new Response(JSON.stringify({ ok: false }), {
                status: 400,
                headers: { "Content-Type": "application/json", ...CORS },
            });
        }
    }

    return new Response("Method Not Allowed", { status: 405, headers: CORS });
}
