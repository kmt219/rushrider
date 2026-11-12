import { getDb, validateAddress, requireString, KNOWN_POOLS } from "./_db";
import { tickToSqrtPriceX96, tickToPrice, getPositionAmounts, sqrtPriceX96FromString } from "./_math";

export const config = { runtime: "edge", maxDuration: 25 };

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

    // Cap samples at 50, default 20
    const samples = Math.min(50, Math.max(5, parseInt(url.searchParams.get("samples") ?? "20")));

    try {
        const sql = getDb();

        // Get deposit block, tick range, and LP liquidity (NOT token amounts)
        const depositRow = await sql`
            SELECT
                il.block_height,
                il.liquidity AS deposit_liquidity,
                m.tick_lower,
                m.tick_upper,
                il.amount0 AS deposit_amount0,
                il.amount1 AS deposit_amount1
            FROM uniswap_lp_npm.evt_increase_liquidity il
            JOIN uniswap_lp_pool.evt_mint m ON il.tx_hash = m.tx_hash
              AND LOWER(m.contract_address) = ${pool}
            WHERE il.token_id = ${tokenId}
            ORDER BY il.block_height ASC
            LIMIT 1
        `;

        if (depositRow.length === 0) {
            return new Response(JSON.stringify({ error: "Position not found" }), {
                status: 404,
                headers: CORS,
            });
        }

        const depositBlock = Number(depositRow[0].block_height);
        const tickLower = parseInt(requireString(depositRow[0].tick_lower, "tick_lower"));
        const tickUpper = parseInt(requireString(depositRow[0].tick_upper, "tick_upper"));
        // Use LP liquidity units (uint128), NOT token amounts
        const depositLiquidity = BigInt(Math.floor(Number(depositRow[0].deposit_liquidity)));
        const depositAmount0 = BigInt(Math.floor(Number(depositRow[0].deposit_amount0)));
        const depositAmount1 = BigInt(Math.floor(Number(depositRow[0].deposit_amount1)));

        // Get latest block + all collect events (fetched once for cumulative fees)
        const [latestRow, collectRows] = await Promise.all([
            sql`
                SELECT MAX(block_height) AS latest
                FROM uniswap_lp_pool.evt_swap
                WHERE LOWER(contract_address) = ${pool}
            `,
            sql`
                SELECT block_height,
                    CAST(amount0_collected AS NUMERIC) AS a0,
                    CAST(amount1_collected AS NUMERIC) AS a1
                FROM uniswap_lp_npm.evt_collect
                WHERE token_id = ${tokenId}
                ORDER BY block_height ASC
            `,
        ]);
        const latestBlock = Number(latestRow[0].latest ?? depositBlock);
        const collectEvents = collectRows.map((r) => ({
            blockHeight: Number(r.block_height),
            a0: Number(r.a0),
            a1: Number(r.a1),
        }));

        // Evenly-spaced sample blocks
        const step = Math.max(1, Math.floor((latestBlock - depositBlock) / samples));
        const sampleBlocks = Array.from({ length: samples }, (_, i) => Math.min(depositBlock + i * step, latestBlock));

        // Batch queries: 3 concurrent max to respect Neon free-tier connection limit
        const BATCH = 3;
        const dataPoints: Array<{
            block_number: number;
            timestamp: number;
            price: string;
            position_value_usd: string;
            hodl_value_usd: string;
            il_usd: string;
            fees_usd_cumulative: string;
            net_pnl_usd: string;
        }> = [];

        const sqrtLower = tickToSqrtPriceX96(tickLower);
        const sqrtUpper = tickToSqrtPriceX96(tickUpper);

        const tokenMeta = KNOWN_POOLS[pool] ?? {
            token0: { symbol: "TOKEN0", decimals: 18 },
            token1: { symbol: "TOKEN1", decimals: 18 },
        };
        const dec0 = tokenMeta.token0.decimals;
        const dec1 = tokenMeta.token1.decimals;
        const d0 = 10 ** dec0;
        const d1 = 10 ** dec1;

        for (let i = 0; i < sampleBlocks.length; i += BATCH) {
            const batch = sampleBlocks.slice(i, i + BATCH);
            const batchResults = await Promise.all(
                batch.map(async (sampleBlock) => {
                    const stateRow = await sql`
                        SELECT tick, sqrt_price_x96, block_signed_at
                        FROM uniswap_lp_pool.evt_swap
                        WHERE LOWER(contract_address) = ${pool}
                          AND block_height <= ${sampleBlock}
                        ORDER BY block_height DESC
                        LIMIT 1
                    `;
                    if (stateRow.length === 0) return null;

                    const tick = parseInt(requireString(stateRow[0].tick, "tick"));
                    const sqrtPrice = sqrtPriceX96FromString(
                        requireString(stateRow[0].sqrt_price_x96, "sqrt_price_x96")
                    );

                    // Use LP liquidity (not token amounts) as the liquidity parameter
                    const { amount0, amount1 } = getPositionAmounts(depositLiquidity, sqrtPrice, sqrtLower, sqrtUpper);

                    const price = tickToPrice(tick, dec0, dec1);
                    const positionValue = (Number(amount0) / d0) * price + Number(amount1) / d1;
                    const hodlValue = (Number(depositAmount0) / d0) * price + Number(depositAmount1) / d1;
                    const ilUsd = positionValue - hodlValue;

                    // Cumulative collected fees up to this sample block
                    const feesA0 = collectEvents
                        .filter((c) => c.blockHeight <= sampleBlock)
                        .reduce((s, c) => s + c.a0, 0);
                    const feesA1 = collectEvents
                        .filter((c) => c.blockHeight <= sampleBlock)
                        .reduce((s, c) => s + c.a1, 0);
                    const feesUsd = (feesA0 / d0) * price + feesA1 / d1;

                    return {
                        block_number: sampleBlock,
                        timestamp:
                            new Date(requireString(stateRow[0].block_signed_at, "block_signed_at")).getTime() / 1000,
                        price: price.toFixed(6),
                        position_value_usd: positionValue.toFixed(2),
                        hodl_value_usd: hodlValue.toFixed(2),
                        il_usd: ilUsd.toFixed(2),
                        fees_usd_cumulative: feesUsd.toFixed(2),
                        net_pnl_usd: (ilUsd + feesUsd).toFixed(2),
                    };
                })
            );
            dataPoints.push(...batchResults.filter((r): r is NonNullable<typeof r> => r !== null));
        }

        return new Response(JSON.stringify({ data_points: dataPoints }), { headers: CORS });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[lp/il-over-time]", err);
        return new Response(JSON.stringify({ error: String(err) }), {
            status: 500,
            headers: CORS,
        });
    }
}
