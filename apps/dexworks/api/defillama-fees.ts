/**
 * /api/defillama-fees — server-side proxy for the DeFiLlama fees API.
 *
 * Why this exists:
 *  - Direct browser calls to https://fees.llama.fi fail with ERR_NAME_NOT_RESOLVED
 *    in some environments (DNS not reachable from the client).
 *  - Routing through this Edge Function lets Vercel's network resolve the domain
 *    and avoids any client-side DNS / CORS issues.
 *
 * Upstream: GET https://api.llama.fi/summary/fees/kumbaya?dataType=dailyFees
 * Deployed by Vercel automatically from the api/ directory.
 * During local dev, Vite proxies /api/defillama-fees → https://api.llama.fi (vite.config.ts).
 */

export const config = { runtime: "edge" };

const UPSTREAM = "https://api.llama.fi/summary/fees/kumbaya?dataType=dailyFees";

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
} as const;

export default async function handler(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405, headers: CORS });

    try {
        const upstream = await fetch(UPSTREAM, { headers: { Accept: "application/json" } });
        return new Response(await upstream.text(), {
            status: upstream.status,
            headers: { "Content-Type": "application/json", ...CORS },
        });
    } catch (err) {
        const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        console.error(`[defillama-fees proxy] Upstream fetch failed: ${msg}`);
        return new Response(JSON.stringify({ error: msg }), {
            status: 502,
            headers: { "Content-Type": "application/json", ...CORS },
        });
    }
}
