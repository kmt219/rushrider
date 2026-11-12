import {
    AIRTIME_POINTS_PER_SECOND,
    DISTANCE_DIVISOR,
    FLIP_POINTS,
    SUPERMAN_POINTS,
    createScoreState,
    updateScore,
} from "./scoring";
import { describe, expect, it } from "vitest";

const DT = 1 / 60;

function ground(state: ReturnType<typeof createScoreState>, x: number) {
    return updateScore(state, { dt: DT, x, grounded: true, angleDelta: 0 });
}

describe("distance scoring", () => {
    it("awards points for forward progress only", () => {
        const state = createScoreState(0);
        ground(state, 300);
        expect(state.score).toBe(Math.floor(300 / DISTANCE_DIVISOR));
        ground(state, 100); // rolling backwards must not reduce the score
        expect(state.distancePts).toBe(Math.floor(300 / DISTANCE_DIVISOR));
    });
});

describe("flips", () => {
    it("awards a backflip after a full airborne rotation", () => {
        const state = createScoreState(0);
        ground(state, 0);
        // 1.2 rotations backwards over 60 airborne frames
        const perFrame = (-1.2 * 2 * Math.PI) / 60;
        for (let i = 0; i < 60; i++) {
            updateScore(state, { dt: DT, x: i * 5, grounded: false, angleDelta: perFrame });
        }
        const events = ground(state, 300);
        const flip = events.find((e) => e.label.includes("Backflip"));
        expect(flip).toBeDefined();
        expect(flip!.points).toBe(FLIP_POINTS);
    });

    it("does not award flips for slow ground rotation", () => {
        const state = createScoreState(0);
        for (let i = 0; i < 240; i++) {
            const events = updateScore(state, { dt: DT, x: i, grounded: true, angleDelta: 0.1 });
            expect(events).toHaveLength(0);
        }
        expect(state.trickPts).toBe(0);
    });
});

describe("airtime", () => {
    it("awards airtime points on landing after >0.5s in the air", () => {
        const state = createScoreState(0);
        for (let i = 0; i < 60; i++) {
            updateScore(state, { dt: DT, x: i, grounded: false, angleDelta: 0 });
        }
        const events = ground(state, 60);
        const air = events.find((e) => e.label.startsWith("Air"));
        expect(air).toBeDefined();
        expect(air!.points).toBeGreaterThanOrEqual(Math.floor(0.9 * AIRTIME_POINTS_PER_SECOND));
    });

    it("awards Superman exactly once per airborne stretch", () => {
        const state = createScoreState(0);
        let supermans = 0;
        for (let i = 0; i < 60 * 4; i++) {
            const events = updateScore(state, { dt: DT, x: i, grounded: false, angleDelta: 0 });
            supermans += events.filter((e) => e.label === "Superman!").length;
        }
        expect(supermans).toBe(1);
        expect(state.trickPts).toBeGreaterThanOrEqual(SUPERMAN_POINTS);
    });
});
