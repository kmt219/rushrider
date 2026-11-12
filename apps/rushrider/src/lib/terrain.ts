/**
 * terrain.ts — pure functions turning OHLCV candles into ridable terrain.
 * World coordinates: x grows right, y grows DOWN (canvas convention), so
 * higher prices map to SMALLER y values.
 */
import type { Difficulty, OHLCVCandle } from "../types";

export interface TerrainPoint {
    x: number;
    y: number;
}

export interface Terrain {
    /** Full polyline: runway + chart + finish runout */
    points: TerrainPoint[];
    /** x where chart data begins (end of the runway) */
    chartStartX: number;
    /** x of the finish flag */
    finishX: number;
    /** 3 checkpoint x-positions, equally spaced between start and finish */
    milestones: number[];
    /** y of the runway / first chart point */
    startY: number;
    minY: number;
    maxY: number;
    candleCount: number;
    priceStart: number;
    priceEnd: number;
    difficulty: Difficulty;
    /** stddev of per-candle % returns */
    volatilityPct: number;
    /** steepest rendered segment, degrees */
    maxSlopeDeg: number;
}

export const RUNWAY_LEN = 700;
export const RUNOUT_LEN = 600;

/** Fixed horizontal px per candle — every candle is the same width, so more
 *  candles literally means a longer track. */
export const SEGMENT_SPACING = 160;
/** Target track length so a full ride lasts ~15-20 min at typical pace. */
const TARGET_LENGTH_PX = 380_000;
/** Hard cap on physics/render segments (bounds Matter body count). */
const MAX_SEGMENTS = 2_600;
/** A checkpoint flag every this many px → longer maps get proportionally more. */
const MILESTONE_INTERVAL_PX = 32_000;
/** Keep the steepest raw segment ridable (~42°). */
const MAX_SEG_SLOPE_TAN = Math.tan((42 * Math.PI) / 180);
/** Cap total terrain points so smoothing can't explode body/vertex count. */
const MAX_TERRAIN_POINTS = 2_600;

/** Retained for the difficulty estimate; spacing is now a fixed constant. */
export function segmentSpacing(_candleCount: number): number {
    return SEGMENT_SPACING;
}

/**
 * Ping-pong tile a close series until the track reaches TARGET_LENGTH_PX (or
 * MAX_SEGMENTS). Alternating loops are reversed so the seam is continuous — no
 * cliff where the pattern repeats. Short charts loop many times; long charts a
 * few. Every map ends up long.
 */
export function tileCloses(closes: number[]): number[] {
    const base = closes.length;
    const segPerLoop = Math.max(1, base - 1);
    const loopsForTarget = Math.max(1, Math.ceil(TARGET_LENGTH_PX / (SEGMENT_SPACING * segPerLoop)));
    const maxLoops = Math.max(1, Math.floor(MAX_SEGMENTS / base));
    const loops = Math.min(loopsForTarget, maxLoops);
    if (loops <= 1) {
        return closes;
    }
    const out: number[] = [...closes];
    for (let l = 1; l < loops; l++) {
        const seq = l % 2 === 1 ? [...closes].reverse() : closes;
        // Skip the first element each loop — it duplicates the previous seam point.
        for (let i = 1; i < seq.length; i++) {
            out.push(seq[i]!);
        }
    }
    return out;
}

/** stddev of close-to-close % returns */
export function volatilityPctOf(closes: number[]): number {
    if (closes.length < 3) {
        return 0;
    }
    const returns: number[] = [];
    for (let i = 1; i < closes.length; i++) {
        const prev = closes[i - 1]!;
        if (prev > 0) {
            returns.push(((closes[i]! - prev) / prev) * 100);
        }
    }
    if (returns.length === 0) {
        return 0;
    }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, r) => a + (r - mean) * (r - mean), 0) / returns.length;
    return Math.sqrt(variance);
}

export function difficultyOf(volatilityPct: number, maxSlopeDeg: number): Difficulty {
    const score = 60 * Math.min(volatilityPct / 2, 1) + 40 * Math.min(maxSlopeDeg / 60, 1);
    if (score < 22) {
        return "EASY";
    }
    if (score < 45) {
        return "MEDIUM";
    }
    if (score < 70) {
        return "HARD";
    }
    return "INSANE";
}

/**
 * Catmull-Rom subdivision. Keeps every original point and inserts `subdivisions`
 * interpolated points per segment. Endpoints are preserved exactly.
 */
export function smoothPoints(points: TerrainPoint[], subdivisions = 6): TerrainPoint[] {
    if (points.length < 3) {
        return points;
    }
    const out: TerrainPoint[] = [];
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)]!;
        const p1 = points[i]!;
        const p2 = points[i + 1]!;
        const p3 = points[Math.min(points.length - 1, i + 2)]!;
        out.push(p1);
        for (let s = 1; s <= subdivisions; s++) {
            const t = s / (subdivisions + 1);
            const t2 = t * t;
            const t3 = t2 * t;
            out.push({
                x:
                    0.5 *
                    (2 * p1.x +
                        (-p0.x + p2.x) * t +
                        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
                        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
                y:
                    0.5 *
                    (2 * p1.y +
                        (-p0.y + p2.y) * t +
                        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
                        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
            });
        }
    }
    out.push(points[points.length - 1]!);
    return out;
}

export function buildTerrain(candles: OHLCVCandle[], smooth: boolean): Terrain {
    const rawCloses = candles.map((c) => c.close).filter((c) => Number.isFinite(c));
    if (rawCloses.length < 2) {
        throw new Error("Need at least 2 candles to build terrain");
    }

    // Tile the chart into a long, seamless track.
    const closes = tileCloses(rawCloses);
    const spacing = SEGMENT_SPACING;

    const minPrice = Math.min(...closes);
    const maxPrice = Math.max(...closes);
    const priceRange = maxPrice - minPrice || 1;
    const norm = closes.map((c) => (c - minPrice) / priceRange);

    // Cap amplitude so the steepest single segment stays ridable (~42°).
    let maxDelta = 1e-4;
    for (let i = 1; i < norm.length; i++) {
        maxDelta = Math.max(maxDelta, Math.abs(norm[i]! - norm[i - 1]!));
    }
    const flatness = priceRange / maxPrice < 1e-9 ? 0 : 1;
    const amplitude = flatness * Math.min(1_500, (MAX_SEG_SLOPE_TAN * spacing) / maxDelta);

    const chartPoints: TerrainPoint[] = norm.map((n, i) => ({
        x: RUNWAY_LEN + i * spacing,
        y: (1 - n) * amplitude,
    }));

    const startY = chartPoints[0]!.y;
    const endPoint = chartPoints[chartPoints.length - 1]!;

    // Adaptive smoothing: keep total points under MAX_TERRAIN_POINTS so the
    // physics body count and per-frame vertex work stay bounded on long tracks.
    const subdivisions = smooth ? Math.max(0, Math.min(6, Math.floor(MAX_TERRAIN_POINTS / chartPoints.length) - 1)) : 0;
    const body = subdivisions > 0 ? smoothPoints(chartPoints, subdivisions) : chartPoints;
    const points: TerrainPoint[] = [{ x: 0, y: startY }, ...body, { x: endPoint.x + RUNOUT_LEN, y: endPoint.y }];

    // Steepest rendered segment.
    let maxSlopeDeg = 0;
    for (let i = 1; i < points.length; i++) {
        const dx = points[i]!.x - points[i - 1]!.x;
        const dy = Math.abs(points[i]!.y - points[i - 1]!.y);
        if (dx > 0) {
            maxSlopeDeg = Math.max(maxSlopeDeg, (Math.atan2(dy, dx) * 180) / Math.PI);
        }
    }

    const ys = points.map((p) => p.y);
    // Difficulty reflects the original chart's volatility, not the tiling.
    const volatilityPct = volatilityPctOf(rawCloses);

    const finishX = endPoint.x + RUNOUT_LEN * 0.6;
    // A checkpoint every MILESTONE_INTERVAL_PX → more flags on longer maps.
    const milestones: number[] = [];
    for (let m = RUNWAY_LEN + MILESTONE_INTERVAL_PX; m < finishX; m += MILESTONE_INTERVAL_PX) {
        milestones.push(m);
    }
    if (milestones.length === 0) {
        milestones.push((RUNWAY_LEN + finishX) / 2);
    }

    return {
        points,
        chartStartX: RUNWAY_LEN,
        finishX,
        milestones,
        startY,
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
        candleCount: rawCloses.length,
        priceStart: rawCloses[0]!,
        priceEnd: rawCloses[rawCloses.length - 1]!,
        difficulty: difficultyOf(volatilityPct, maxSlopeDeg),
        volatilityPct,
        maxSlopeDeg,
    };
}

/** y of the terrain surface at a given x (linear interp along the polyline). */
export function terrainYAt(terrain: Terrain, x: number): number {
    const pts = terrain.points;
    for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i]!;
        const b = pts[i + 1]!;
        if (x >= a.x && x <= b.x) {
            const t = (x - a.x) / (b.x - a.x || 1);
            return a.y + (b.y - a.y) * t;
        }
    }
    return pts[pts.length - 1]!.y;
}
