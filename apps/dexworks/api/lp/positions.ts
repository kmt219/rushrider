import { getDb, KNOWN_POOLS, validateAddress, validateBlockHeight, requireString } from "./_db";
import {
    tickToSqrtPriceX96,
    tickToPrice,
    getPositionAmounts,
    computeIL,
    computeFeeApr,
    serializeBigInt,
    sqrtPriceX96FromString,
} from "./_math";

export const config = { runtime: "edge" };

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
};

// ── Uncollected fees via NPM eth_call ────────────────────────────────────────

const BASE_RPC = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";
const NPM_ADDRESS = "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1";

async function getUncollectedFees(tokenId: string): Promise<{ tokensOwed0: bigint; tokensOwed1: bigint }> {
    try {
        // positions(uint256) selector = 0x99fbab88
        const tokenIdHex = BigInt(tokenId).toString(16).padStart(64, "0");
        const calldata = "0x99fbab88" + tokenIdHex;
        const res = await fetch(BASE_RPC, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "eth_call",
                params: [{ to: NPM_ADDRESS, data: calldata }, "latest"],
            }),
            signal: AbortSignal.timeout(5000),
        });
        const json = (await res.json()) as { result?: string };
        // Return type is 12 × 32-byte slots = 768 hex chars + "0x" prefix
        if (!json.result || json.result.length < 770) return { tokensOwed0: 0n, tokensOwed1: 0n };
        const data = json.result.slice(2);
        // slot 10 = tokensOwed0 (uint128), slot 11 = tokensOwed1 (uint128)
        const tokensOwed0 = BigInt("0x" + data.slice(640, 704));
        const tokensOwed1 = BigInt("0x" + data.slice(704, 768));
        return { tokensOwed0, tokensOwed1 };
    } catch {
        return { tokensOwed0: 0n, tokensOwed1: 0n };
    }
}

export default async function handler(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

    const url = new URL(req.url);
    let pool: string;
    let wallet: string;
    let blockHeight: number;

    try {
        pool = validateAddress(url.searchParams.get("pool"), "pool");
        wallet = validateAddress(url.searchParams.get("wallet"), "wallet");
        blockHeight = validateBlockHeight(url.searchParams.get("block"));
    } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
            status: 400,
            headers: CORS,
        });
    }

    // Only Base supported (Pipeline API ETH mainnet = Coming Soon)
    const chain = url.searchParams.get("chain") ?? "base-mainnet";
    if (chain !== "base-mainnet") {
        return new Response(JSON.stringify({ error: "Only base-mainnet is supported" }), {
            status: 400,
            headers: CORS,
        });
    }

    const tokenMeta = KNOWN_POOLS[pool] ?? {
        token0: { symbol: "TOKEN0", decimals: 18 },
        token1: { symbol: "TOKEN1", decimals: 18 }, // safe default; 6 is wrong for non-stablecoin pairs
        feeTier: "",
        tickSpacing: 1,
    };
    const { token0, token1 } = tokenMeta;

    try {
        const sql = getDb();

        // ── Step 1: Find tokenIds minted to this wallet ──────────────────────
        const mintRows = await sql`
            SELECT token_id FROM uniswap_lp_npm.evt_transfer
            WHERE LOWER("to") = ${wallet}
              AND "from" = '0x0000000000000000000000000000000000000000'
              AND block_height <= ${blockHeight}
        `;
        const mintedIds = mintRows.map((r) => requireString(r.token_id, "token_id"));
        if (mintedIds.length === 0) {
            return new Response(JSON.stringify({ pool: null, positions: [] }), { headers: CORS });
        }

        // Remove transferred-away tokenIds
        const xferRows = await sql`
            SELECT DISTINCT token_id FROM uniswap_lp_npm.evt_transfer
            WHERE token_id = ANY(${mintedIds})
              AND LOWER("from") = ${wallet}
              AND "to" != '0x0000000000000000000000000000000000000000'
              AND block_height <= ${blockHeight}
        `;
        const xferredSet = new Set(xferRows.map((r) => requireString(r.token_id, "token_id")));
        const ownedIds = mintedIds.filter((id) => !xferredSet.has(id));
        if (ownedIds.length === 0) {
            return new Response(JSON.stringify({ pool: null, positions: [] }), { headers: CORS });
        }

        // ── Step 2: Position metadata (tick range, pool address, deposit info) ──
        const posRows = await sql`
            SELECT
                il.token_id,
                il.tx_hash AS deposit_tx,
                il.block_height AS deposit_block,
                il.block_signed_at AS deposit_at,
                il.amount0 AS deposit_amount0,
                il.amount1 AS deposit_amount1,
                m.contract_address AS pool_address,
                m.tick_lower,
                m.tick_upper
            FROM uniswap_lp_npm.evt_increase_liquidity il
            JOIN uniswap_lp_pool.evt_mint m ON il.tx_hash = m.tx_hash
              AND LOWER(m.contract_address) = ${pool}
            WHERE il.token_id = ANY(${ownedIds})
              AND il.block_height <= ${blockHeight}
            ORDER BY il.block_height ASC
        `;

        // Keep only positions in the requested pool (the JOIN filters, but double-check)
        const poolPositions = posRows.filter(
            (r) => requireString(r.pool_address, "pool_address").toLowerCase() === pool
        );
        if (poolPositions.length === 0) {
            return new Response(JSON.stringify({ pool: null, positions: [] }), { headers: CORS });
        }

        // ── Step 3: Current pool state ────────────────────────────────────────
        const stateRows = await sql`
            SELECT sqrt_price_x96, tick, block_height, block_signed_at
            FROM uniswap_lp_pool.evt_swap
            WHERE LOWER(contract_address) = ${pool}
              AND block_height <= ${blockHeight}
            ORDER BY block_height DESC, log_offset DESC
            LIMIT 1
        `;
        if (stateRows.length === 0) {
            return new Response(JSON.stringify({ error: "No pool state found — pipeline may still be backfilling" }), {
                status: 404,
                headers: CORS,
            });
        }

        const currentTick = parseInt(requireString(stateRows[0].tick, "tick"));
        const sqrtPriceCurrent = sqrtPriceX96FromString(requireString(stateRows[0].sqrt_price_x96, "sqrt_price_x96"));
        const currentBlock = stateRows[0].block_height as number;
        const currentBlockAt = stateRows[0].block_signed_at as string;

        // ── Step 4: Aggregate liquidity per tokenId (GROUP BY — no N+1) ──────
        const incAgg = await sql`
            SELECT token_id, SUM(CAST(liquidity AS NUMERIC)) AS total
            FROM uniswap_lp_npm.evt_increase_liquidity
            WHERE token_id = ANY(${ownedIds}) AND block_height <= ${blockHeight}
            GROUP BY token_id
        `;
        const decAgg = await sql`
            SELECT token_id, SUM(CAST(liquidity AS NUMERIC)) AS total
            FROM uniswap_lp_npm.evt_decrease_liquidity
            WHERE token_id = ANY(${ownedIds}) AND block_height <= ${blockHeight}
            GROUP BY token_id
        `;
        // Withdrawn token amounts for closed positions (to compute real IL vs -100% from 0)
        const decAmtAgg = await sql`
            SELECT token_id,
                COALESCE(SUM(CAST(amount0 AS NUMERIC)), 0) AS a0,
                COALESCE(SUM(CAST(amount1 AS NUMERIC)), 0) AS a1
            FROM uniswap_lp_npm.evt_decrease_liquidity
            WHERE token_id = ANY(${ownedIds}) AND block_height <= ${blockHeight}
            GROUP BY token_id
        `;
        const collectAgg = await sql`
            SELECT token_id,
                COALESCE(SUM(CAST(amount0_collected AS NUMERIC)), 0) AS a0,
                COALESCE(SUM(CAST(amount1_collected AS NUMERIC)), 0) AS a1
            FROM uniswap_lp_npm.evt_collect
            WHERE token_id = ANY(${ownedIds}) AND block_height <= ${blockHeight}
            GROUP BY token_id
        `;

        const incMap = new Map(
            incAgg.map((r) => [requireString(r.token_id, "token_id"), BigInt(Math.floor(Number(r.total)))])
        );
        const decMap = new Map(
            decAgg.map((r) => [requireString(r.token_id, "token_id"), BigInt(Math.floor(Number(r.total)))])
        );
        const decAmtMap = new Map(
            decAmtAgg.map((r) => [
                requireString(r.token_id, "token_id"),
                { a0: BigInt(Math.floor(Number(r.a0))), a1: BigInt(Math.floor(Number(r.a1))) },
            ])
        );
        const collectMap = new Map(
            collectAgg.map((r) => [
                requireString(r.token_id, "token_id"),
                { a0: BigInt(Math.floor(Number(r.a0))), a1: BigInt(Math.floor(Number(r.a1))) },
            ])
        );

        // ── Step 5: Deposit-time prices + swap ticks for time-in-range % ────────
        // Fetch swap ticks up to current block (capped at 5000).
        // Used for both per-position deposit-price lookup and time-in-range computation.
        const swapTickRows = await sql`
            SELECT tick, block_height
            FROM uniswap_lp_pool.evt_swap
            WHERE LOWER(contract_address) = ${pool}
              AND block_height <= ${blockHeight}
            ORDER BY block_height ASC
            LIMIT 5000
        `;
        const swapTicks = swapTickRows.map((r) => ({
            tick: parseInt(requireString(r.tick, "tick")),
            blockH: Number(r.block_height),
        }));

        // Build per-position deposit tick from swapTicks (sorted ascending).
        // Avoids a per-position DB query while correctly reflecting different deposit prices.
        const getDepositTick = (posDepositBlock: number): number => {
            let result = currentTick; // fallback
            for (const { tick, blockH } of swapTicks) {
                if (blockH <= posDepositBlock) result = tick;
                else break;
            }
            return result;
        };

        // ── Step 7: Uncollected fees via NPM eth_call (batch, max 5 concurrent) ──
        const poolTokenIds = poolPositions.map((pos) => requireString(pos.token_id, "token_id"));
        const BATCH_RPC = 5;
        const uncollectedMap = new Map<string, { tokensOwed0: bigint; tokensOwed1: bigint }>();
        for (let i = 0; i < poolTokenIds.length; i += BATCH_RPC) {
            const batch = poolTokenIds.slice(i, i + BATCH_RPC);
            const results = await Promise.all(batch.map((id) => getUncollectedFees(id)));
            batch.forEach((id, idx) => {
                uncollectedMap.set(id, results[idx]);
            });
        }

        // ── Step 8: Build position objects ────────────────────────────────────
        const currentPrice = tickToPrice(currentTick, token0.decimals, token1.decimals);
        const dec0 = token0.decimals;
        const dec1 = token1.decimals;

        const positions = poolPositions.map((pos) => {
            const tokenId = requireString(pos.token_id, "token_id");
            const tickLower = parseInt(requireString(pos.tick_lower, "tick_lower"));
            const tickUpper = parseInt(requireString(pos.tick_upper, "tick_upper"));

            const incTotal = incMap.get(tokenId) ?? 0n;
            const decTotal = decMap.get(tokenId) ?? 0n;
            const netLiquidity = incTotal - decTotal < 0n ? 0n : incTotal - decTotal;
            const status: "active" | "closed" = netLiquidity <= 0n ? "closed" : "active";

            const sqrtPriceLower = tickToSqrtPriceX96(tickLower);
            const sqrtPriceUpper = tickToSqrtPriceX96(tickUpper);
            const { amount0: currentAmount0, amount1: currentAmount1 } =
                netLiquidity > 0n
                    ? getPositionAmounts(netLiquidity, sqrtPriceCurrent, sqrtPriceLower, sqrtPriceUpper)
                    : { amount0: 0n, amount1: 0n };

            const inRange = currentTick >= tickLower && currentTick < tickUpper;
            const rangeWidth = tickUpper - tickLower;
            const percentThrough =
                rangeWidth > 0 ? Math.max(0, Math.min(1, (currentTick - tickLower) / rangeWidth)) : 0;

            const collected = collectMap.get(tokenId) ?? { a0: 0n, a1: 0n };
            const withdrawn = decAmtMap.get(tokenId) ?? { a0: 0n, a1: 0n };
            const depositAmount0 = BigInt(Math.floor(Number(pos.deposit_amount0)));
            const depositAmount1 = BigInt(Math.floor(Number(pos.deposit_amount1)));

            const price1Usd = 1; // token1 assumed stablecoin for this demo
            // Per-position deposit price (each position may have deposited at a different block)
            const posDepositTick = getDepositTick(Number(pos.deposit_block));
            const posDepositPrice = tickToPrice(posDepositTick, dec0, dec1);
            // For closed positions, compare deposit vs what was actually withdrawn (not vs $0)
            const ilRefAmount0 = status === "closed" ? withdrawn.a0 : currentAmount0;
            const ilRefAmount1 = status === "closed" ? withdrawn.a1 : currentAmount1;
            const { ilUsd, ilPercent, hodlValueUsd, positionValueUsd } = computeIL(
                depositAmount0,
                depositAmount1,
                ilRefAmount0,
                ilRefAmount1,
                posDepositPrice,
                price1Usd,
                currentPrice,
                price1Usd,
                dec0,
                dec1
            );

            // Uncollected fees (on-chain NPM call) — must be added to collected to get true total
            const uncollected = uncollectedMap.get(tokenId) ?? { tokensOwed0: 0n, tokensOwed1: 0n };
            const { tokensOwed0, tokensOwed1 } = uncollected;
            const feesUncollectedUsd =
                (Number(tokensOwed0) / 10 ** dec0) * currentPrice + (Number(tokensOwed1) / 10 ** dec1) * price1Usd;

            const feesUsd =
                (Number(collected.a0) / 10 ** dec0) * currentPrice +
                (Number(collected.a1) / 10 ** dec1) * price1Usd +
                feesUncollectedUsd;

            const depositTimestampMs = new Date(pos.deposit_at as string).getTime();
            // For active positions, use positionValueUsd; for closed, use withdrawn value
            const withdrawnValueUsd =
                status === "closed"
                    ? (Number(withdrawn.a0) / 10 ** dec0) * currentPrice +
                      (Number(withdrawn.a1) / 10 ** dec1) * price1Usd
                    : positionValueUsd;
            // Fee APR denominator must be hodlValueUsd (deposit amounts at current price),
            // not positionValueUsd — IL shrinks the position but shouldn't inflate APR.
            const feeApr =
                status === "active" ? computeFeeApr(feesUsd, hodlValueUsd, depositTimestampMs, Date.now()) : 0;

            // Time-in-range: fraction of pool swap events since deposit where tick was in range
            const posSwaps = swapTicks.filter((s) => s.blockH >= Number(pos.deposit_block));
            const inRangeCount = posSwaps.filter((s) => s.tick >= tickLower && s.tick < tickUpper).length;
            const timeInRangePct = posSwaps.length >= 3 ? Math.round((inRangeCount / posSwaps.length) * 100) : null;

            return {
                token_id: tokenId,
                status,
                tick_lower: tickLower,
                tick_upper: tickUpper,
                price_lower: tickToPrice(tickLower, dec0, dec1).toFixed(6),
                price_upper: tickToPrice(tickUpper, dec0, dec1).toFixed(6),
                liquidity: netLiquidity.toString(),
                amount0_current: (Number(currentAmount0) / 10 ** dec0).toFixed(6),
                amount1_current: (Number(currentAmount1) / 10 ** dec1).toFixed(6),
                amount0_withdrawn: (Number(withdrawn.a0) / 10 ** dec0).toFixed(6),
                amount1_withdrawn: (Number(withdrawn.a1) / 10 ** dec1).toFixed(6),
                value_usd: status === "closed" ? withdrawnValueUsd.toFixed(2) : positionValueUsd.toFixed(2),
                in_range: inRange,
                percent_through_range: percentThrough,
                token0_symbol: token0.symbol,
                token1_symbol: token1.symbol,
                fees_token0_collected: (Number(collected.a0) / 10 ** dec0).toFixed(6),
                fees_token1_collected: (Number(collected.a1) / 10 ** dec1).toFixed(6),
                fees_usd_total: feesUsd.toFixed(2),
                fees_token0_uncollected: (Number(tokensOwed0) / 10 ** dec0).toFixed(6),
                fees_token1_uncollected: (Number(tokensOwed1) / 10 ** dec1).toFixed(6),
                fees_usd_uncollected: feesUncollectedUsd.toFixed(2),
                deposit_block: pos.deposit_block as number | string,
                deposit_tx: pos.deposit_tx as string,
                deposit_amount0: (Number(depositAmount0) / 10 ** dec0).toFixed(6),
                deposit_amount1: (Number(depositAmount1) / 10 ** dec1).toFixed(6),
                deposit_value_usd: hodlValueUsd.toFixed(2),
                il_usd: ilUsd.toFixed(2),
                il_percent: ilPercent.toFixed(2),
                net_pnl_usd: (feesUsd + ilUsd).toFixed(2),
                fee_apr: status === "active" ? feeApr.toFixed(1) : "0.0",
                time_in_range_percent: timeInRangePct,
            };
        });

        // Sort: active first, then by value desc
        const sorted = [...positions].sort((a, b) => {
            if (a.status !== b.status) return a.status === "active" ? -1 : 1;
            return parseFloat(b.value_usd) - parseFloat(a.value_usd);
        });

        const response = {
            pool: {
                address: pool,
                fee_tier: tokenMeta.feeTier ?? "",
                current_tick: currentTick,
                sqrt_price_x96: sqrtPriceCurrent.toString(),
                current_price_token1_per_token0: currentPrice.toFixed(6),
                block_number: currentBlock,
                block_signed_at: currentBlockAt,
                token0_symbol: token0.symbol,
                token1_symbol: token1.symbol,
            },
            positions: sorted,
        };

        return new Response(JSON.stringify(serializeBigInt(response)), { headers: CORS });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[lp/positions]", err);
        return new Response(JSON.stringify({ error: String(err) }), {
            status: 500,
            headers: CORS,
        });
    }
}
