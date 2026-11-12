/**
 * scoring.ts — pure score tracking. The engine feeds it frame samples; it
 * returns trick events (flips, airtime, superman) and the running score.
 */
export interface TrickEvent {
    label: string;
    points: number;
}

export interface ScoreState {
    score: number;
    /** current airborne stretch in seconds; 0 when grounded */
    airTime: number;
    distancePts: number;
    trickPts: number;
    airborne: boolean;
    rotationAccum: number;
    supermanAwarded: boolean;
    startX: number;
    maxX: number;
    /** longest single airborne stretch this ride (seconds) — for badges */
    maxAirTime: number;
    /** total flips landed this ride — for badges */
    flips: number;
}

export const DISTANCE_DIVISOR = 30;
export const FLIP_POINTS = 300;
export const SUPERMAN_AIR_SECONDS = 2.5;
export const SUPERMAN_POINTS = 500;
export const MIN_BONUS_AIR_SECONDS = 0.5;
export const AIRTIME_POINTS_PER_SECOND = 100;

export function createScoreState(startX: number): ScoreState {
    return {
        score: 0,
        airTime: 0,
        distancePts: 0,
        trickPts: 0,
        airborne: false,
        rotationAccum: 0,
        supermanAwarded: false,
        startX,
        maxX: startX,
        maxAirTime: 0,
        flips: 0,
    };
}

export interface FrameSample {
    dt: number;
    x: number;
    grounded: boolean;
    /** chassis angle delta since last frame, radians */
    angleDelta: number;
}

/** Advance the score by one frame. Mutates `state`; returns any trick events earned. */
export function updateScore(state: ScoreState, sample: FrameSample): TrickEvent[] {
    const events: TrickEvent[] = [];

    // Distance — only forward progress counts.
    state.maxX = Math.max(state.maxX, sample.x);
    state.distancePts = Math.max(0, Math.floor((state.maxX - state.startX) / DISTANCE_DIVISOR));

    if (sample.grounded) {
        if (state.airborne) {
            // ── Landing: settle air bonuses ──
            const flips = Math.floor(Math.abs(state.rotationAccum) / (2 * Math.PI));
            if (flips > 0) {
                const label = state.rotationAccum < 0 ? "Backflip!" : "Frontflip!";
                const pts = flips * FLIP_POINTS;
                events.push({ label: flips > 1 ? `${flips}x ${label}` : label, points: pts });
                state.trickPts += pts;
                state.flips += flips;
            }
            if (state.airTime >= MIN_BONUS_AIR_SECONDS) {
                const pts = Math.floor(state.airTime * AIRTIME_POINTS_PER_SECOND);
                events.push({ label: `Air ${state.airTime.toFixed(1)}s`, points: pts });
                state.trickPts += pts;
            }
        }
        state.airborne = false;
        state.airTime = 0;
        state.rotationAccum = 0;
        state.supermanAwarded = false;
    } else {
        state.airborne = true;
        state.airTime += sample.dt;
        state.maxAirTime = Math.max(state.maxAirTime, state.airTime);
        state.rotationAccum += sample.angleDelta;
        if (!state.supermanAwarded && state.airTime >= SUPERMAN_AIR_SECONDS) {
            state.supermanAwarded = true;
            events.push({ label: "Superman!", points: SUPERMAN_POINTS });
            state.trickPts += SUPERMAN_POINTS;
        }
    }

    state.score = state.distancePts + state.trickPts;
    return events;
}
