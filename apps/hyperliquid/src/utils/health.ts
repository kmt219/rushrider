/**
 * Health score v2 — 3 data-driven dimensions
 *
 * Only fields that are actually populated from GoldRush ohlcvCandlesForToken are used:
 *   - volume24h   → Volume Score   (0–40 pts)
 *   - change24h   → Volatility Score (0–30 pts)
 *   - markPx      → Price Availability Score (0–30 pts)
 *
 * Total 0–100. Grade thresholds: A≥80, B≥60, C≥40, D<40.
 * When total === 0 (no GoldRush data), grade is "N/A".
 */

export type HealthGrade = "A" | "B" | "C" | "D" | "N/A";

export interface HealthDimension {
    /** Raw pts for this dimension */
    pts: number;
    /** Maximum pts possible for this dimension */
    max: number;
    /** 0–1 fraction (pts / max), 0 when no data */
    score: number;
    /** Grade for this dimension */
    grade: HealthGrade;
    /** Human-readable label */
    label: string;
}

export interface HealthScore {
    /** Total pts (0–100) */
    total: number;
    /** Overall grade */
    grade: HealthGrade;
    /** 0–1 composite (total / 100) */
    composite: number;
    dimensions: {
        volume: HealthDimension;
        volatility: HealthDimension;
        priceAvailability: HealthDimension;
    };
    /** Simple trend placeholder — always "stable" for now (no history yet) */
    trend: "improving" | "stable" | "deteriorating";
}

// ─── Grade helpers ────────────────────────────────────────────

export function ptsToGrade(pts: number, max: number): HealthGrade {
    if (max === 0) return "N/A";
    const pct = pts / max;
    if (pct >= 0.8) return "A";
    if (pct >= 0.6) return "B";
    if (pct >= 0.4) return "C";
    return "D";
}

export function totalToGrade(total: number): HealthGrade {
    if (total === 0) return "N/A";
    if (total >= 80) return "A";
    if (total >= 60) return "B";
    if (total >= 40) return "C";
    return "D";
}

export function getHealthGradeColor(grade: HealthGrade): { bg: string; text: string } {
    switch (grade) {
        case "A":
            return { bg: "rgba(34,197,94,0.15)", text: "#22c55e" };
        case "B":
            return { bg: "rgba(59,130,246,0.15)", text: "#3b82f6" };
        case "C":
            return { bg: "rgba(234,179,8,0.15)", text: "#eab308" };
        case "D":
            return { bg: "rgba(239,68,68,0.15)", text: "#ef4444" };
        case "N/A":
        default:
            return { bg: "rgba(148,163,184,0.15)", text: "#94a3b8" };
    }
}

// ─── Dimension scorers ────────────────────────────────────────

function scoreVolume(volume24h: number): HealthDimension {
    const MAX = 40;
    let pts = 0;
    if (volume24h === 0) {
        pts = 0;
    } else if (volume24h < 1_000_000) {
        pts = 10;
    } else if (volume24h < 10_000_000) {
        pts = 25;
    } else if (volume24h < 100_000_000) {
        pts = 35;
    } else {
        pts = 40;
    }
    return {
        pts,
        max: MAX,
        score: pts / MAX,
        grade: ptsToGrade(pts, MAX),
        label: "Volume",
    };
}

function scoreVolatility(change24h: number): HealthDimension {
    const MAX = 30;
    const abs = Math.abs(change24h);
    let pts = 0;
    if (change24h === 0) {
        pts = 0;
    } else if (abs < 0.02) {
        pts = 30; // stable
    } else if (abs < 0.05) {
        pts = 25;
    } else if (abs < 0.15) {
        pts = 15;
    } else {
        pts = 5; // very volatile
    }
    return {
        pts,
        max: MAX,
        score: pts / MAX,
        grade: ptsToGrade(pts, MAX),
        label: "Volatility",
    };
}

function scorePriceAvailability(markPx: number): HealthDimension {
    const MAX = 30;
    const pts = markPx > 0 ? 30 : 0;
    return {
        pts,
        max: MAX,
        score: pts / MAX,
        grade: ptsToGrade(pts, MAX),
        label: "Price Avail",
    };
}

// ─── Main scorer ──────────────────────────────────────────────

export function computeHealthScore(markPx: number, change24h: number, volume24h: number): HealthScore {
    const volume = scoreVolume(volume24h);
    const volatility = scoreVolatility(change24h);
    const priceAvailability = scorePriceAvailability(markPx);

    const total = volume.pts + volatility.pts + priceAvailability.pts;

    return {
        total,
        grade: totalToGrade(total),
        composite: total / 100,
        dimensions: { volume, volatility, priceAvailability },
        trend: "stable",
    };
}
