import type { LiveLiquidation } from "../types";

export interface CascadeChain {
    id: string;
    coin: string;
    startBlock: number;
    endBlock: number;
    startTime: number;
    endTime: number;
    liquidations: LiveLiquidation[];
    priceStart: number;
    priceEnd: number;
    priceImpact: number; // % price movement
    totalVolumeLiquidated: number;
    backstopCount: number;
    uniqueUsersLiquidated: number;
    isActive: boolean;
}

export interface CascadeRisk {
    score: number; // 0–100
    label: "LOW" | "MODERATE" | "HIGH" | "EXTREME";
    activeCascade: CascadeChain | null;
    recentCascades24h: number;
    backstopRate24h: number;
}

const CASCADE_GAP_BLOCKS = 10;

// Detect or extend a cascade chain given a new liquidation fill
export function detectOrExtendCascade(
    newLiq: LiveLiquidation,
    blockNumber: number,
    markPx: number,
    activeCascades: Map<string, CascadeChain>
): CascadeChain {
    const existing = activeCascades.get(newLiq.coin);

    if (existing && existing.isActive && blockNumber - existing.endBlock <= CASCADE_GAP_BLOCKS) {
        // Extend existing cascade
        existing.liquidations.push(newLiq);
        existing.endBlock = blockNumber;
        existing.endTime = Date.now();
        existing.totalVolumeLiquidated += newLiq.sz * newLiq.markPx;
        existing.priceEnd = markPx;
        existing.priceImpact =
            existing.priceStart > 0 ? ((existing.priceEnd - existing.priceStart) / existing.priceStart) * 100 : 0;
        if (newLiq.method === "BACKSTOP") existing.backstopCount++;
        const users = new Set(existing.liquidations.map((l) => l.user));
        existing.uniqueUsersLiquidated = users.size;
        return existing;
    }

    // New cascade chain
    const chain: CascadeChain = {
        id: `${newLiq.coin}-${blockNumber}`,
        coin: newLiq.coin,
        startBlock: blockNumber,
        endBlock: blockNumber,
        startTime: Date.now(),
        endTime: Date.now(),
        liquidations: [newLiq],
        priceStart: markPx,
        priceEnd: markPx,
        priceImpact: 0,
        totalVolumeLiquidated: newLiq.sz * newLiq.markPx,
        backstopCount: newLiq.method === "BACKSTOP" ? 1 : 0,
        uniqueUsersLiquidated: 1,
        isActive: true,
    };
    activeCascades.set(newLiq.coin, chain);
    return chain;
}

// Mark cascades as ended when no new liq within CASCADE_GAP_BLOCKS blocks
export function pruneStaleCascades(activeCascades: Map<string, CascadeChain>, currentBlock: number): void {
    for (const [, chain] of activeCascades) {
        if (chain.isActive && currentBlock - chain.endBlock > CASCADE_GAP_BLOCKS) {
            chain.isActive = false;
        }
    }
}

// Compute cascade risk score 0–100 for a market.
//
// Phase 2 TODO: LiquidationLevelChart — overlay the mark price chart with horizontal
// lines at each cascade's priceStart/priceEnd and a heat band showing liquidation density
// at price levels. Requires maintaining a price→liqVolume histogram from liqHistory.
export function computeCascadeRisk(
    liqCount24h: number,
    backstopCount24h: number,
    activeCascade: CascadeChain | null,
    cascadeHistory: CascadeChain[],
    oiUtilization: number
): CascadeRisk {
    let score = 0;

    // Active cascade contributes up to 40 points
    if (activeCascade && activeCascade.isActive) {
        score += activeCascade.backstopCount > 0 ? 40 : 30;
    }

    // Recent cascade in last 1h (3600s) contributes up to 20 points
    const now = Date.now();
    const recentCascade = cascadeHistory.find((c) => !c.isActive && now - c.endTime < 3600000);
    if (recentCascade) score += 20;

    // Liquidation frequency: up to 20 points
    score += Math.min(20, liqCount24h * 0.4);

    // Backstop rate: up to 15 points
    const backstopRate = liqCount24h > 0 ? backstopCount24h / liqCount24h : 0;
    score += backstopRate * 15;

    // OI utilization: up to 5 points
    score += oiUtilization * 5;

    score = Math.min(100, Math.round(score));

    let label: CascadeRisk["label"];
    if (score >= 75) label = "EXTREME";
    else if (score >= 50) label = "HIGH";
    else if (score >= 25) label = "MODERATE";
    else label = "LOW";

    const recentCascades24h = cascadeHistory.filter((c) => now - c.endTime < 24 * 3600 * 1000).length;

    return {
        score,
        label,
        activeCascade: activeCascade ?? null,
        recentCascades24h,
        backstopRate24h: backstopRate,
    };
}

export function formatLiqMethod(method: "MARKET" | "BACKSTOP"): string {
    return method === "BACKSTOP" ? "BST" : "MKT";
}

export function truncateUser(addr: string): string {
    if (!addr || addr.length < 10) return addr;
    return `${addr.slice(0, 6)}..${addr.slice(-4)}`;
}

export function getLiqRiskColor(label: CascadeRisk["label"]): string {
    switch (label) {
        case "EXTREME":
            return "var(--negative)";
        case "HIGH":
            return "#f97316";
        case "MODERATE":
            return "var(--warning)";
        case "LOW":
            return "var(--positive)";
    }
}
