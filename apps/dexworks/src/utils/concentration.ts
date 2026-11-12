/**
 * concentration.ts — HHI-based token holder concentration utilities.
 *
 * Herfindahl-Hirschman Index (HHI): sum of squared market shares.
 * Raw range: 0.0 (perfectly distributed) → 1.0 (monopoly).
 * We normalize to 0-100 for display.
 */

export type ConcentrationTier = "safe" | "moderate" | "concentrated" | "dangerous";

/** Dead / burn addresses filtered before computing HHI */
export const DEAD_ADDRESSES = new Set([
    "0x0000000000000000000000000000000000000000",
    "0x000000000000000000000000000000000000dead",
]);

/**
 * Compute normalized HHI (0-100) from an array of BigInt balances.
 * Dead addresses must be filtered BEFORE calling this function.
 */
export function computeHHI(balances: bigint[]): number {
    if (balances.length === 0) return 0;
    const total = balances.reduce((a, b) => a + b, 0n);
    if (total === 0n) return 0;
    let hhi = 0;
    for (const b of balances) {
        const share = Number((b * 1_000_000n) / total) / 1_000_000;
        hhi += share * share;
    }
    return Math.min(100, Math.round(hhi * 100));
}

/** Concentration tier thresholds — tunable without touching components. */
export function getConcentrationTier(hhi: number): ConcentrationTier {
    if (hhi < 15) return "safe";
    if (hhi < 35) return "moderate";
    if (hhi < 60) return "concentrated";
    return "dangerous";
}

/** CSS color variable for a given tier */
export function hhiColor(tier: ConcentrationTier): string {
    const map: Record<ConcentrationTier, string> = {
        safe: "var(--accent, #00d084)",
        moderate: "var(--warning-soft, #fbbf24)",
        concentrated: "var(--warning, #f59e0b)",
        dangerous: "var(--danger, #ef4444)",
    };
    return map[tier];
}

/** Short uppercase label for a given tier */
export function hhiLabel(tier: ConcentrationTier): string {
    const map: Record<ConcentrationTier, string> = {
        safe: "SAFE",
        moderate: "MOD",
        concentrated: "HIGH",
        dangerous: "CRIT",
    };
    return map[tier];
}
