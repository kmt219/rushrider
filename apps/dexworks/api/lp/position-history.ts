import { getDb, validateAddress, requireString, KNOWN_POOLS } from "./_db";

export const config = { runtime: "edge" };

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
};

export default async function handler(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

    const url = new URL(req.url);
    let pool: string;

    try {
        pool = validateAddress(url.searchParams.get("pool"), "pool");
    } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
            status: 400,
            headers: CORS,
        });
    }

    const tokenId = url.searchParams.get("token_id");
    if (!tokenId || !/^\d+$/.test(tokenId)) {
        return new Response(JSON.stringify({ error: "Invalid token_id" }), {
            status: 400,
            headers: CORS,
        });
    }

    try {
        const sql = getDb();

        const [mints, burns, collects] = await Promise.all([
            sql`
                SELECT block_height, block_signed_at, tx_hash, amount0, amount1
                FROM uniswap_lp_npm.evt_increase_liquidity
                WHERE token_id = ${tokenId}
                ORDER BY block_height ASC
            `,
            sql`
                SELECT block_height, block_signed_at, tx_hash, amount0, amount1
                FROM uniswap_lp_npm.evt_decrease_liquidity
                WHERE token_id = ${tokenId}
                ORDER BY block_height ASC
            `,
            sql`
                SELECT block_height, block_signed_at, tx_hash,
                    amount0_collected AS amount0, amount1_collected AS amount1
                FROM uniswap_lp_npm.evt_collect
                WHERE token_id = ${tokenId}
                ORDER BY block_height ASC
            `,
        ]);

        const poolMeta = KNOWN_POOLS[pool] ?? {
            token0: { decimals: 18, symbol: "TOKEN0" },
            token1: { decimals: 6, symbol: "TOKEN1" },
        };
        const dec0 = poolMeta.token0.decimals;
        const dec1 = poolMeta.token1.decimals;

        const fmtAmt = (raw: unknown, decimals: number): string =>
            (Number(raw as string) / 10 ** decimals).toFixed(decimals === 18 ? 6 : 2);

        const events = [
            ...mints.map((r) => ({
                type: "Mint" as const,
                block_number: r.block_height as string | number,
                timestamp: new Date(requireString(r.block_signed_at, "block_signed_at")).getTime() / 1000,
                amount0: fmtAmt(r.amount0, dec0),
                amount1: fmtAmt(r.amount1, dec1),
                tx_hash: r.tx_hash as string,
            })),
            ...burns.map((r) => ({
                type: "Burn" as const,
                block_number: r.block_height as string | number,
                timestamp: new Date(requireString(r.block_signed_at, "block_signed_at")).getTime() / 1000,
                amount0: fmtAmt(r.amount0, dec0),
                amount1: fmtAmt(r.amount1, dec1),
                tx_hash: r.tx_hash as string,
            })),
            ...collects.map((r) => ({
                type: "Collect" as const,
                block_number: r.block_height as string | number,
                timestamp: new Date(requireString(r.block_signed_at, "block_signed_at")).getTime() / 1000,
                amount0: fmtAmt(r.amount0, dec0),
                amount1: fmtAmt(r.amount1, dec1),
                tx_hash: r.tx_hash as string,
            })),
        ].sort((a, b) => Number(a.block_number) - Number(b.block_number));

        return new Response(JSON.stringify({ events }), { headers: CORS });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[lp/position-history]", err);
        return new Response(JSON.stringify({ error: String(err) }), {
            status: 500,
            headers: CORS,
        });
    }
}
