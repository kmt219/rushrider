/**
 * /api/rpc — server-side proxy for MegaETH JSON-RPC.
 *
 * Why this exists:
 *  - Direct browser calls to https://carrot.megaeth.com are blocked by CORS.
 *  - ethers.JsonRpcProvider makes an eth_chainId call during construction; CORS
 *    causes it to fail before the provider's private #network field is set,
 *    which then throws "Cannot read from private field" on any contract call.
 *  - Routing all JSON-RPC through this Edge Function avoids both problems.
 *
 * Deployed by Vercel automatically from the api/ directory.
 * During local dev, Vite proxies /api/rpc → https://carrot.megaeth.com (vite.config.ts).
 */

export const config = { runtime: "edge" };

const UPSTREAM_RPC = process.env.MEGAETH_RPC_URL ?? "https://carrot.megaeth.com/rpc";

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
} as const;

export default async function handler(request: Request): Promise<Response> {
    // Preflight
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: CORS });
    }

    let body: string;
    try {
        body = await request.text();
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[RPC proxy] Failed to read request body: ${msg}`);
        return new Response("Bad Request", { status: 400, headers: CORS });
    }

    try {
        const upstream = await fetch(UPSTREAM_RPC, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
        });

        const data = await upstream.text();

        return new Response(data, {
            status: upstream.status,
            headers: { "Content-Type": "application/json", ...CORS },
        });
    } catch (err) {
        const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        console.error(`[RPC proxy] Upstream fetch failed: ${msg}`);

        return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: msg } }), {
            status: 502,
            headers: { "Content-Type": "application/json", ...CORS },
        });
    }
}
