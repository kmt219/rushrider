import type { OHLCVCandle } from "../types";
import {
    RUNWAY_LEN,
    buildTerrain,
    difficultyOf,
    segmentSpacing,
    smoothPoints,
    tileCloses,
    volatilityPctOf,
} from "./terrain";
import { describe, expect, it } from "vitest";

function candlesFrom(closes: number[]): OHLCVCandle[] {
    return closes.map((close, i) => ({
        timestamp: new Date(2026, 0, 1, 0, i).toISOString(),
        open: close,
        high: close,
        low: close,
        close,
        volume: 0,
    }));
}

describe("segmentSpacing", () => {
    it("is a fixed positive constant regardless of candle count", () => {
        expect(segmentSpacing(15)).toBe(segmentSpacing(60));
        expect(segmentSpacing(60)).toBeGreaterThan(0);
    });
});

describe("tileCloses", () => {
    it("extends short series into a long track (many loops)", () => {
        const tiled = tileCloses([1, 2, 3, 4, 5]);
        expect(tiled.length).toBeGreaterThan(1000); // short charts loop many times
    });
    it("ping-pongs continuously — no cliff at the seam", () => {
        const base = [1, 5, 2, 8];
        const tiled = tileCloses(base);
        // Every adjacent step in the tiled series also exists in the base series'
        // set of adjacent deltas (mirrored), so no jump larger than the base's max.
        let maxBaseStep = 0;
        for (let i = 1; i < base.length; i++) {
            maxBaseStep = Math.max(maxBaseStep, Math.abs(base[i]! - base[i - 1]!));
        }
        for (let i = 1; i < tiled.length; i++) {
            expect(Math.abs(tiled[i]! - tiled[i - 1]!)).toBeLessThanOrEqual(maxBaseStep + 1e-9);
        }
    });
});

describe("volatilityPctOf", () => {
    it("is zero for a flat series", () => {
        expect(volatilityPctOf([5, 5, 5, 5])).toBe(0);
    });
    it("grows with bigger swings", () => {
        const calm = volatilityPctOf([100, 101, 100, 101, 100]);
        const wild = volatilityPctOf([100, 130, 90, 140, 80]);
        expect(wild).toBeGreaterThan(calm);
    });
});

describe("difficultyOf", () => {
    it("maps calm flat charts to EASY and violent steep ones to INSANE", () => {
        expect(difficultyOf(0.05, 5)).toBe("EASY");
        expect(difficultyOf(5, 75)).toBe("INSANE");
    });
    it("is monotonic in volatility", () => {
        const order = ["EASY", "MEDIUM", "HARD", "INSANE"];
        const a = order.indexOf(difficultyOf(0.3, 30));
        const b = order.indexOf(difficultyOf(1.4, 30));
        expect(b).toBeGreaterThanOrEqual(a);
    });
});

describe("smoothPoints", () => {
    it("preserves endpoints exactly and inserts subdivisions", () => {
        const pts = [
            { x: 0, y: 10 },
            { x: 100, y: 50 },
            { x: 200, y: 0 },
        ];
        const out = smoothPoints(pts, 4);
        expect(out[0]).toEqual(pts[0]);
        expect(out[out.length - 1]).toEqual(pts[2]);
        expect(out.length).toBe(3 + 2 * 4);
    });
    it("keeps x strictly increasing for chart-like input", () => {
        const pts = Array.from({ length: 10 }, (_, i) => ({ x: i * 100, y: Math.sin(i) * 80 }));
        const out = smoothPoints(pts);
        for (let i = 1; i < out.length; i++) {
            expect(out[i]!.x).toBeGreaterThan(out[i - 1]!.x);
        }
    });
});

describe("buildTerrain", () => {
    it("maps higher prices to smaller y (up = up on screen)", () => {
        const terrain = buildTerrain(candlesFrom([1, 2, 3, 4, 5]), false);
        // First 5 chart points are the original ascending closes — y must descend.
        const chart = terrain.points.slice(1, 6);
        for (let i = 1; i < chart.length; i++) {
            expect(chart[i]!.y).toBeLessThan(chart[i - 1]!.y);
        }
    });

    it("prepends a runway and appends a runout", () => {
        const terrain = buildTerrain(candlesFrom([10, 12, 11, 14]), false);
        expect(terrain.points[0]!.x).toBe(0);
        expect(terrain.points[0]!.y).toBe(terrain.startY);
        expect(terrain.chartStartX).toBe(RUNWAY_LEN);
        expect(terrain.finishX).toBeGreaterThan(terrain.points[terrain.points.length - 2]!.x);
    });

    it("keeps a flat chart flat instead of amplifying noise", () => {
        const terrain = buildTerrain(candlesFrom([5, 5, 5, 5, 5]), false);
        const ys = terrain.points.map((p) => p.y);
        expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1e-6);
    });

    it("records price endpoints and candle count", () => {
        const terrain = buildTerrain(candlesFrom([10, 20, 15]), false);
        expect(terrain.priceStart).toBe(10);
        expect(terrain.priceEnd).toBe(15);
        expect(terrain.candleCount).toBe(3);
    });

    it("throws on fewer than 2 candles", () => {
        expect(() => buildTerrain(candlesFrom([1]), false)).toThrow();
    });

    it("spaces milestones equally and scales their count with track length", () => {
        const terrain = buildTerrain(candlesFrom([10, 12, 11, 14, 13, 16]), false);
        // Long track → several checkpoints, all inside (start, finish).
        expect(terrain.milestones.length).toBeGreaterThanOrEqual(3);
        expect(terrain.milestones[0]!).toBeGreaterThan(terrain.chartStartX);
        expect(terrain.milestones[terrain.milestones.length - 1]!).toBeLessThan(terrain.finishX);
        // Equal spacing between consecutive checkpoints.
        for (let i = 2; i < terrain.milestones.length; i++) {
            const g1 = terrain.milestones[i - 1]! - terrain.milestones[i - 2]!;
            const g2 = terrain.milestones[i]! - terrain.milestones[i - 1]!;
            expect(Math.abs(g1 - g2)).toBeLessThan(1e-6);
        }
    });
});
