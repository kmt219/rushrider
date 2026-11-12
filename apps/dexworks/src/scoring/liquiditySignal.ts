import type { NewPairData } from "../types";
import type { SignalResult } from "./types";

// Per-pair liquidity history for drop detection (last 1 hour)
const _liqHistory = new Map<string, { timestamp: number; liquidity: number }[]>();

/** Clear all liquidity history — call on chain switch to prevent stale data contamination. */
export function clearLiquidityHistory(): void {
    _liqHistory.clear();
}

/**
 * Returns the fractional liquidity drop in the last `windowMs` milliseconds.
 * Positive value = liquidity decreased (e.g. 0.35 = dropped 35%).
 * Negative value = liquidity increased.
 * Returns 0 if insufficient history.
 */
export function getLiquidityDrop(pairAddress: string, windowMs: number): number {
    const key = pairAddress.toLowerCase();
    const history = _liqHistory.get(key) ?? [];
    if (history.length < 2) return 0;
    const cutoff = Date.now() - windowMs;
    const window = history.filter((h) => h.timestamp >= cutoff);
    if (window.length < 2) return 0;
    const oldest = window[0]!.liquidity;
    const newest = window[window.length - 1]!.liquidity;
    if (oldest <= 0) return 0;
    return (oldest - newest) / oldest;
}

export function recordLiquidityUpdate(pairAddress: string, liquidity: number, timestamp = Date.now()) {
    const key = pairAddress.toLowerCase();
    let history = _liqHistory.get(key);
    if (!history) {
        history = [];
        _liqHistory.set(key, history);
    }
    history.push({ timestamp, liquidity });
    // Keep last 1 hour
    const cutoff = timestamp - 3_600_000;
    const trimIdx = history.findIndex((h) => h.timestamp >= cutoff);
    if (trimIdx > 0) history.splice(0, trimIdx);
}

export function computeLiquiditySignal(pair: NewPairData): SignalResult {
    const details: string[] = [];
    let score = 0;

    const liquidity = pair.liquidity ?? 0;
    const marketCap = pair.market_cap ?? 0;
    const pairedAt = new Date(pair.block_signed_at).getTime();
    const ageMin = (Date.now() - pairedAt) / 60_000;

    // Liquidity amount tier (max 6 pts)
    if (liquidity >= 100_000) {
        score += 6;
        details.push(`$${(liquidity / 1000).toFixed(0)}K liquidity — substantial`);
    } else if (liquidity >= 10_000) {
        score += 4;
        details.push(`$${(liquidity / 1000).toFixed(1)}K liquidity — moderate`);
    } else if (liquidity >= 1_000) {
        score += 2;
        details.push(`$${liquidity.toFixed(0)} liquidity — minimal`);
    } else {
        details.push(`$${liquidity.toFixed(0)} liquidity — trivially low`);
    }

    // Stability: detect >20% drop over last hour (max 6 pts)
    const key = pair.pair_address.toLowerCase();
    const history = _liqHistory.get(key) ?? [];
    if (history.length >= 2) {
        const hourAgo = history[0]!.liquidity;
        const current = history[history.length - 1]!.liquidity;
        if (hourAgo > 0) {
            const drop = (hourAgo - current) / hourAgo;
            if (drop > 0.5) {
                details.push(`Liquidity dropped ${(drop * 100).toFixed(0)}% — rug in progress`);
            } else if (drop > 0.2) {
                score += 2;
                details.push(`Liquidity dropped ${(drop * 100).toFixed(0)}% in 1h`);
            } else {
                score += 6;
                details.push("Liquidity stable");
            }
        } else {
            score += 6;
            details.push("Liquidity stable");
        }
    } else {
        score += 6;
        details.push("Liquidity stability unknown (new pair)");
    }

    // Liq/MCap ratio (max 4 pts)
    if (marketCap > 0 && liquidity > 0) {
        const ratio = liquidity / marketCap;
        if (ratio >= 0.1) {
            score += 4;
            details.push(`Liq/MCap: ${(ratio * 100).toFixed(0)}% — healthy`);
        } else if (ratio >= 0.01) {
            score += 2;
            details.push(`Liq/MCap: ${(ratio * 100).toFixed(1)}% — low`);
        } else {
            details.push(`Liq/MCap: ${(ratio * 100).toFixed(2)}% — extreme thin`);
        }
    } else {
        score += 2;
        details.push("Liq/MCap ratio unavailable");
    }

    // Pool age (max 4 pts)
    if (ageMin >= 60) {
        score += 4;
        details.push(`Pool age: ${(ageMin / 60).toFixed(1)}h`);
    } else if (ageMin >= 10) {
        score += 2;
        details.push(`Pool age: ${ageMin.toFixed(0)}min`);
    } else {
        score += 1;
        details.push(`Pool age: ${ageMin.toFixed(0)}min — just launched`);
    }

    // Build raw KPI bag
    const poolSizeStr =
        liquidity >= 1_000_000
            ? `$${(liquidity / 1_000_000).toFixed(1)}M`
            : liquidity >= 1_000
              ? `$${(liquidity / 1_000).toFixed(1)}K`
              : `$${liquidity.toFixed(0)}`;

    const liqMcapRatio = marketCap > 0 && liquidity > 0 ? `${((liquidity / marketCap) * 100).toFixed(1)}%` : "N/A";

    const ageHours = ageMin / 60;
    const ageStr = ageHours >= 1 ? `${ageHours.toFixed(1)}h` : `${ageMin.toFixed(0)}m`;

    let stabilityLabel = "UNKNOWN";
    if (history.length >= 2) {
        const hourAgo2 = history[0]!.liquidity;
        const current2 = history[history.length - 1]!.liquidity;
        if (hourAgo2 > 0) {
            const drop2 = (hourAgo2 - current2) / hourAgo2;
            if (drop2 > 0.5) stabilityLabel = "RUGGING";
            else if (drop2 > 0.2) stabilityLabel = "DROPPING";
            else stabilityLabel = "STABLE";
        } else {
            stabilityLabel = "STABLE";
        }
    }

    const raw: Record<string, string | number> = {
        "POOL SIZE": poolSizeStr,
        "LIQ/MCAP": liqMcapRatio,
        AGE: ageStr,
        STABILITY: stabilityLabel,
    };

    return { score: Math.min(20, score), loading: false, label: "LIQUIDITY", details, raw };
}
