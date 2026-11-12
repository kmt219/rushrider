// Uniswap V3 math utilities.
// All sqrtPrice values are in Q96 format (value × 2^96).
// BigInt is used throughout to match Solidity uint128/uint160/int256 precision.

const Q96 = 2n ** 96n;

export function tickToSqrtPriceX96(tick: number): bigint {
    // Use log/exp to avoid float overflow at extreme ticks (±887272 range).
    // sqrtPrice = exp(tick * ln(1.0001) / 2)
    const sqrtPrice = Math.exp((tick * Math.log(1.0001)) / 2);
    return BigInt(Math.floor(sqrtPrice * Number(Q96)));
}

export function tickToPrice(tick: number, decimals0: number, decimals1: number): number {
    return 1.0001 ** tick * 10 ** (decimals0 - decimals1);
}

export interface PositionAmounts {
    amount0: bigint;
    amount1: bigint;
}

export function getPositionAmounts(
    liquidity: bigint,
    sqrtPriceCurrent: bigint,
    sqrtPriceLower: bigint,
    sqrtPriceUpper: bigint
): PositionAmounts {
    if (sqrtPriceCurrent <= sqrtPriceLower) {
        const amount0 = (liquidity * Q96 * (sqrtPriceUpper - sqrtPriceLower)) / (sqrtPriceUpper * sqrtPriceLower);
        return { amount0, amount1: 0n };
    } else if (sqrtPriceCurrent >= sqrtPriceUpper) {
        const amount1 = (liquidity * (sqrtPriceUpper - sqrtPriceLower)) / Q96;
        return { amount0: 0n, amount1 };
    } else {
        const amount0 = (liquidity * Q96 * (sqrtPriceUpper - sqrtPriceCurrent)) / (sqrtPriceUpper * sqrtPriceCurrent);
        const amount1 = (liquidity * (sqrtPriceCurrent - sqrtPriceLower)) / Q96;
        return { amount0, amount1 };
    }
}

export function computeIL(
    depositAmount0: bigint,
    depositAmount1: bigint,
    currentAmount0: bigint,
    currentAmount1: bigint,
    price0AtDeposit: number,
    price1AtDeposit: number,
    price0Now: number,
    price1Now: number,
    decimals0: number,
    decimals1: number
): { ilUsd: number; ilPercent: number; hodlValueUsd: number; positionValueUsd: number } {
    const d0 = 10 ** decimals0;
    const d1 = 10 ** decimals1;

    const depositValue =
        (Number(depositAmount0) / d0) * price0AtDeposit + (Number(depositAmount1) / d1) * price1AtDeposit;

    const hodlValue = (Number(depositAmount0) / d0) * price0Now + (Number(depositAmount1) / d1) * price1Now;

    const positionValue = (Number(currentAmount0) / d0) * price0Now + (Number(currentAmount1) / d1) * price1Now;

    const ilUsd = positionValue - hodlValue;
    const ilPercent = depositValue > 0 ? (ilUsd / depositValue) * 100 : 0;

    return { ilUsd, ilPercent, hodlValueUsd: hodlValue, positionValueUsd: positionValue };
}

export function computeFeeApr(
    feesUsdTotal: number,
    depositValueUsd: number,
    depositTimestampMs: number,
    nowMs: number
): number {
    const daysActive = (nowMs - depositTimestampMs) / 86_400_000;
    if (daysActive < 0.01 || depositValueUsd <= 0) return 0;
    return Math.min((feesUsdTotal / depositValueUsd) * (365 / daysActive) * 100, 9999);
}

export function buildLiquidityDepth(
    tickData: Array<{ tick: number; liquidityNet: bigint }>
): Array<{ tick: number; activeLiquidity: bigint }> {
    const sorted = [...tickData].sort((a, b) => a.tick - b.tick);
    let running = 0n;
    return sorted.map(({ tick, liquidityNet }) => {
        running += liquidityNet;
        return { tick, activeLiquidity: running < 0n ? 0n : running };
    });
}

export function sqrtPriceX96FromString(s: string): bigint {
    // DB may return scientific notation or float strings — truncate to integer before BigInt()
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid sqrtPriceX96: ${s}`);
    return BigInt(Math.floor(n));
}

// Recursively converts BigInt values to strings for JSON serialization.
export function serializeBigInt(v: unknown): unknown {
    if (typeof v === "bigint") return v.toString();
    if (Array.isArray(v)) return v.map(serializeBigInt);
    if (v !== null && typeof v === "object")
        return Object.fromEntries(
            Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, serializeBigInt(val)])
        );
    return v;
}
