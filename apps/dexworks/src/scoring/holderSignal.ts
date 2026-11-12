import type { SignalResult } from "./types";

export interface HolderDistribution {
    totalCount: number;
    topHolderPct: number; // 0–100
    top5HolderPct: number; // 0–100
    top20HolderPct: number;
    giniCoeff: number; // 0–1, higher = more concentrated
}

export function computeHolderSignal(dist: HolderDistribution): SignalResult {
    const details: string[] = [];
    let score = 0;

    const { topHolderPct, top5HolderPct, top20HolderPct, totalCount, giniCoeff } = dist;

    // Top holder concentration (max 6 pts)
    if (topHolderPct < 5) {
        score += 6;
        details.push(`Top holder: ${topHolderPct.toFixed(1)}%`);
    } else if (topHolderPct < 15) {
        score += 3;
        details.push(`Top holder: ${topHolderPct.toFixed(1)}%`);
    } else if (topHolderPct < 50) {
        score += 1;
        details.push(`Top holder: ${topHolderPct.toFixed(1)}% — concentrated`);
    } else {
        details.push(`Top holder: ${topHolderPct.toFixed(1)}% — WHALE`);
    }

    // Top 5 combined (max 5 pts)
    if (top5HolderPct < 25) {
        score += 5;
        details.push(`Top 5: ${top5HolderPct.toFixed(0)}% combined`);
    } else if (top5HolderPct < 50) {
        score += 3;
        details.push(`Top 5: ${top5HolderPct.toFixed(0)}% combined`);
    } else if (top5HolderPct < 80) {
        score += 1;
        details.push(`Top 5: ${top5HolderPct.toFixed(0)}% — high`);
    } else {
        details.push(`Top 5: ${top5HolderPct.toFixed(0)}% — critical`);
    }

    // Number of holders (max 5 pts)
    if (totalCount > 50) {
        score += 5;
        details.push(`${totalCount.toLocaleString()} holders`);
    } else if (totalCount >= 20) {
        score += 3;
        details.push(`${totalCount} holders`);
    } else if (totalCount >= 10) {
        score += 1;
        details.push(`${totalCount} holders — sparse`);
    } else {
        details.push(`${totalCount} holder${totalCount !== 1 ? "s" : ""} — very few`);
    }

    // Gini coefficient (max 4 pts, replaces recentLargeAccumulator)
    if (giniCoeff < 0.7) {
        score += 4;
        details.push(`Gini: ${giniCoeff.toFixed(2)} — distributed`);
    } else if (giniCoeff < 0.85) {
        score += 2;
        details.push(`Gini: ${giniCoeff.toFixed(2)} — moderate`);
    } else {
        details.push(`Gini: ${giniCoeff.toFixed(2)} — concentrated`);
    }

    const raw: Record<string, string | number> = {
        "TOP HOLDER": `${topHolderPct.toFixed(1)}%`,
        "TOP 5": `${top5HolderPct.toFixed(1)}%`,
        "TOP 20": `${top20HolderPct.toFixed(1)}%`,
        TOTAL: totalCount.toLocaleString(),
        GINI: giniCoeff.toFixed(2),
    };

    return { score: Math.min(20, score), loading: false, label: "HOLDERS", details, raw };
}
