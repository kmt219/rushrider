/**
 * /api/mainnet-rpc — server-side proxy for MegaETH mainnet JSON-RPC.
 *
 * Why this exists:
 *  - USDm token (0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7) is deployed on
 *    MegaETH mainnet (chain 4326, mainnet.megaeth.com/rpc), not on the testnet
 *    (chain 6343, carrot.megaeth.com) used by /api/rpc.
 *  - Direct browser calls to https://mainnet.megaeth.com are blocked by CORS.
 *  - Routing eth_call through this Edge Function avoids both problems.
 *
 * Deployed by Vercel automatically from the api/ directory.
 * During local dev, Vite proxies /api/mainnet-rpc → https://mainnet.megaeth.com (vite.config.ts).
 */

export const config = { runtime: "edge" };

const UPSTREAM = process.env.MEGAETH_MAINNET_RPC_URL ?? "https://mainnet.megaeth.com/rpc";

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
} as const;

export default async function handler(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: CORS });
    const body = await request.text();
    const upstream = await fetch(UPSTREAM, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
    });
    return new Response(await upstream.text(), {
        status: upstream.status,
        headers: { "Content-Type": "application/json", ...CORS },
    });
}
