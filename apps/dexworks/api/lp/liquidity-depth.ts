import { getDb, KNOWN_POOLS, validateAddress, validateBlockHeight, requireString } from "./_db";
import { tickToPrice, buildLiquidityDepth } from "./_math";

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
    let blockHeight: number;

    try {
        pool = validateAddress(url.searchParams.get("pool"), "pool");
        blockHeight = validateBlockHeight(url.searchParams.get("block"));
    } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
            status: 400,
            headers: CORS,
        });
    }

    const tickRange = Math.min(Math.max(1, parseInt(url.searchParams.get("tick_range") ?? "2000")), 10000);

    try {
        const sql = getDb();

        // Get current tick from latest swap
        const stateRows = await sql`
            SELECT tick, sqrt_price_x96
            FROM uniswap_lp_pool.evt_swap
            WHERE LOWER(contract_address) = ${pool}
              AND block_height <= ${blockHeight}
            ORDER BY block_height DESC, log_offset DESC
            LIMIT 1
        `;

        if (stateRows.length === 0) {
            return new Response(JSON.stringify({ error: "No pool state — pipeline may still be backfilling" }), {
                status: 404,
                headers: CORS,
            });
        }

        const currentTick = parseInt(requireString(stateRows[0].tick, "tick"));
        // poolMeta resolved below after tick processing — keep currentTick for SQL range queries

        // Fetch Mint/Burn events in range (net liquidity changes at tick boundaries).
        // A position overlaps the range if tick_lower < rangeEnd AND tick_upper > rangeStart —
        // filtering only on tick_lower would miss positions that span the range boundary.
        const rangeStart = currentTick - tickRange;
        const rangeEnd = currentTick + tickRange;
        const [mintRows, burnRows] = await Promise.all([
            sql`
                SELECT tick_lower, tick_upper, CAST(amount AS NUMERIC) AS liq
                FROM uniswap_lp_pool.evt_mint
                WHERE LOWER(contract_address) = ${pool}
                  AND block_height <= ${blockHeight}
                  AND CAST(tick_lower AS INT) < ${rangeEnd}
                  AND CAST(tick_upper AS INT) > ${rangeStart}
            `,
            sql`
                SELECT tick_lower, tick_upper, CAST(amount AS NUMERIC) AS liq
                FROM uniswap_lp_pool.evt_burn
                WHERE LOWER(contract_address) = ${pool}
                  AND block_height <= ${blockHeight}
                  AND CAST(tick_lower AS INT) < ${rangeEnd}
                  AND CAST(tick_upper AS INT) > ${rangeStart}
            `,
        ]);

        // Accumulate net liquidity at each tick boundary
        const tickMap = new Map<number, bigint>();
        for (const row of mintRows) {
            const tl = parseInt(requireString(row.tick_lower, "tick_lower"));
            const tu = parseInt(requireString(row.tick_upper, "tick_upper"));
            const liq = BigInt(Math.floor(Number(row.liq)));
            tickMap.set(tl, (tickMap.get(tl) ?? 0n) + liq);
            tickMap.set(tu, (tickMap.get(tu) ?? 0n) - liq);
        }
        for (const row of burnRows) {
            const tl = parseInt(requireString(row.tick_lower, "tick_lower"));
            const tu = parseInt(requireString(row.tick_upper, "tick_upper"));
            const liq = BigInt(Math.floor(Number(row.liq)));
            tickMap.set(tl, (tickMap.get(tl) ?? 0n) - liq);
            tickMap.set(tu, (tickMap.get(tu) ?? 0n) + liq);
        }

        const tickData = [...tickMap.entries()].map(([tick, liquidityNet]) => ({
            tick,
            liquidityNet,
        }));
        const depth = buildLiquidityDepth(tickData);

        const poolMeta = KNOWN_POOLS[pool] ?? {
            token0: { symbol: "TOKEN0", decimals: 18 },
            token1: { symbol: "TOKEN1", decimals: 18 },
            tickSpacing: 1,
            feeTier: "",
        };
        const dec0 = poolMeta.token0.decimals;
        const dec1 = poolMeta.token1.decimals;

        const ticks = depth.map(({ tick, activeLiquidity }) => ({
            tick,
            liquidity_net: activeLiquidity.toString(),
            price: tickToPrice(tick, dec0, dec1).toFixed(6),
        }));

        return new Response(
            JSON.stringify({
                current_tick: currentTick,
                current_price: tickToPrice(currentTick, dec0, dec1).toFixed(6),
                tick_spacing: poolMeta.tickSpacing,
                fee_tier: poolMeta.feeTier,
                token0_symbol: poolMeta.token0.symbol,
                token1_symbol: poolMeta.token1.symbol,
                ticks,
            }),
            { headers: CORS }
        );
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[lp/liquidity-depth]", err);
        return new Response(JSON.stringify({ error: String(err) }), {
            status: 500,
            headers: CORS,
        });
    }
}
