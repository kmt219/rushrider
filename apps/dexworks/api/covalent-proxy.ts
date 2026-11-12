/**
 * /api/covalent-proxy — server-side proxy for Covalent REST API v1.
 *
 * Why this exists:
 *  - Direct browser fetch to api.covalenthq.com/v1 is blocked by CORS when the
 *    API redirects (e.g. block/{height}/transactions_v3 → block_hash/{h}/transactions_v3).
 *  - Keeps the Covalent API key server-side (COVALENT_API_KEY env var) so it is
 *    not bundled into the client JS.
 *  - Returns structured { status, error_message } JSON on non-2xx so callers can
 *    distinguish 404 (unsupported endpoint) from 551 (rate-limit / warming up).
 *
 * Usage:  GET /api/covalent-proxy?path=megaeth-mainnet/block_v2/latest/&page-size=1
 * Proxies: GET https://api.covalenthq.com/v1/megaeth-mainnet/block_v2/latest/?key=...&page-size=1
 *
 * Deployed automatically by Vercel from the api/ directory as an Edge Function.
 * During local dev, Vite's configureServer middleware (vite.config.ts) provides
 * an equivalent handler.
 */

export const config = { runtime: "edge" };

const COVALENT_BASE = "https://api.covalenthq.com/v1";

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
} as const;

export default async function handler(request: Request): Promise<Response> {
    // CORS preflight
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method !== "GET") {
        return new Response("Method Not Allowed", { status: 405, headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.searchParams.get("path");

    if (!path) {
        return new Response(JSON.stringify({ status: 400, error_message: "Missing required query param: path" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS },
        });
    }

    // API key — prefer a dedicated server-side secret; fall back to the VITE_ var
    // (also present in the Vercel environment when deploying from this monorepo).
    const apiKey = process.env.COVALENT_API_KEY ?? process.env.VITE_GOLDRUSH_API_KEY ?? "";

    // Build upstream URL: forward all query params except `path`, then inject key
    const upstream = new URL(`${COVALENT_BASE}/${path}`);
    for (const [k, v] of url.searchParams.entries()) {
        if (k !== "path") upstream.searchParams.set(k, v);
    }
    upstream.searchParams.set("key", apiKey);

    try {
        const res = await fetch(upstream.toString(), {
            headers: { Accept: "application/json" },
            // Follow redirects transparently (fixes the block/{n}/transactions_v3 → block_hash/ redirect)
            redirect: "follow",
        });

        const body = await res.text();

        if (!res.ok) {
            // Surface the Covalent error_message if present so callers can inspect it
            let errorMsg = `HTTP ${res.status}`;
            try {
                const parsed = JSON.parse(body);
                errorMsg = parsed.error_message ?? parsed.message ?? errorMsg;
            } catch {
                /* body is not JSON — use status string */
            }
            return new Response(JSON.stringify({ status: res.status, error_message: errorMsg }), {
                status: res.status,
                headers: { "Content-Type": "application/json", ...CORS },
            });
        }

        return new Response(body, {
            status: res.status,
            headers: {
                "Content-Type": "application/json",
                // Cache successful responses: CDN holds for 5 min, serves stale for 1 more while revalidating.
                // Downstream hooks also cache in memory so this only matters for the first hit per deployment.
                "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
                ...CORS,
            },
        });
    } catch (err) {
        const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        console.error(`[covalent-proxy] Upstream fetch failed: ${msg}`);
        return new Response(JSON.stringify({ status: 502, error_message: msg }), {
            status: 502,
            headers: { "Content-Type": "application/json", ...CORS },
        });
    }
}
