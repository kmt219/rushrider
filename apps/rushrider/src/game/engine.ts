/**
 * engine.ts — matter-js physics for the bike + terrain. Matter is invisible
 * math only; rendering happens in render.ts from the state snapshot.
 *
 * Bike anatomy: two wheel circles + a chassis bar + a head sensor circle,
 * tied together with stiff-ish constraints (slight elasticity = suspension).
 * Crash = head touches terrain, or falling below the world.
 */
import type { Terrain } from "../lib/terrain";
import { createScoreState, updateScore } from "./scoring";
import type { ScoreState, TrickEvent } from "./scoring";
import Matter from "matter-js";

const WHEEL_RADIUS = 20;
const CHASSIS_W = 78;
const CHASSIS_H = 10;
const MAX_SPEED = 11; // horizontal px/step — top travel speed
const ACCEL_LERP = 0.05; // how fast travel eases toward target speed (smooth, no jerk)
const GROUND_SPIN_DAMP = 0.82; // bleed chassis wobble while grounded (Hill-Climb forgiveness)
const AIR_AV_STEP = 0.04; // air rotation responsiveness
const MAX_AIR_AV = 0.55; // cap air rotation rate
const LIFT_VELOCITY = 7; // straight-up hop on Space
const MILESTONE_POINTS = 250; // per checkpoint crossed
const FIXED_DT_MS = 1000 / 60;
const FALL_MARGIN = 1_600;

export interface RideInput {
    /** → move right. In the air, rolls the bike forward (front down). */
    forward: boolean;
    /** ← move left. In the air, rolls the bike backward (backflip). */
    back: boolean;
}

export type RidePhase = "ready" | "riding" | "crashed" | "finished";

export interface BikeSnapshot {
    chassis: { x: number; y: number; angle: number };
    rearWheel: { x: number; y: number; angle: number };
    frontWheel: { x: number; y: number; angle: number };
    head: { x: number; y: number };
    speed: number;
    grounded: boolean;
}

export interface RideState {
    phase: RidePhase;
    elapsed: number;
    score: ScoreState;
    bike: BikeSnapshot;
}

export interface RideCallbacks {
    onTrick: (event: TrickEvent) => void;
    onCrash: () => void;
    onFinish: () => void;
}

/** End-of-ride stats used to award badges and build the share card. */
export interface RideSummary {
    score: number;
    distancePts: number;
    trickPts: number;
    maxAirTime: number;
    flips: number;
    milestones: number; // 0-3 checkpoints crossed
    finished: boolean; // reached the finish flag (vs crashed)
    elapsed: number;
}

export class RideEngine {
    readonly input: RideInput = { forward: false, back: false };
    private liftQueued = false;
    private milestonesPassed = 0;

    private engine: Matter.Engine;
    private terrain: Terrain;
    private callbacks: RideCallbacks;

    private rearWheel!: Matter.Body;
    private frontWheel!: Matter.Body;
    private chassis!: Matter.Body;
    private head!: Matter.Body;
    private bikeParts: Matter.Body[] = [];

    private phase: RidePhase = "ready";
    private elapsed = 0;
    private accumulator = 0;
    private scoreState: ScoreState;
    private lastAngle = 0;
    private groundContacts = new Set<string>();

    constructor(terrain: Terrain, callbacks: RideCallbacks) {
        this.terrain = terrain;
        this.callbacks = callbacks;
        this.engine = Matter.Engine.create({ gravity: { x: 0, y: 1, scale: 0.001 } });
        this.scoreState = createScoreState(120);
        this.buildWorld();
    }

    private buildWorld() {
        const world = this.engine.world;
        Matter.World.clear(world, false);

        // Terrain: one thin static rectangle per polyline segment, rotated to
        // match the segment and shifted half its thickness below the line so
        // the top face is the ridable surface.
        const thickness = 24;
        const segments: Matter.Body[] = [];
        const pts = this.terrain.points;
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i]!;
            const b = pts[i + 1]!;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.hypot(dx, dy);
            if (len < 1) {
                continue;
            }
            const angle = Math.atan2(dy, dx);
            // Normal pointing down from the surface
            const nx = -Math.sin(angle);
            const ny = Math.cos(angle);
            const seg = Matter.Bodies.rectangle(
                (a.x + b.x) / 2 + (nx * thickness) / 2,
                (a.y + b.y) / 2 + (ny * thickness) / 2,
                len + 2,
                thickness,
                { isStatic: true, angle, friction: 1, label: "terrain" }
            );
            segments.push(seg);
        }
        Matter.World.add(world, segments);

        // Bike — spawn over the runway.
        const spawnX = 120;
        const spawnY = this.terrain.startY - WHEEL_RADIUS - 30;
        const group = Matter.Body.nextGroup(true);
        const partOpts: Matter.IChamferableBodyDefinition = {
            collisionFilter: { group },
            friction: 0.9,
            restitution: 0, // no bounce — terrain seams must not launch the wheels
        };

        this.rearWheel = Matter.Bodies.circle(spawnX - 32, spawnY + 18, WHEEL_RADIUS, {
            ...partOpts,
            label: "rearWheel",
            density: 0.0028,
        });
        this.frontWheel = Matter.Bodies.circle(spawnX + 32, spawnY + 18, WHEEL_RADIUS, {
            ...partOpts,
            label: "frontWheel",
            density: 0.0024,
        });
        this.chassis = Matter.Bodies.rectangle(spawnX, spawnY - 10, CHASSIS_W, CHASSIS_H, {
            ...partOpts,
            label: "chassis",
            density: 0.0032,
        });
        this.head = Matter.Bodies.circle(spawnX - 4, spawnY - 44, 10, {
            ...partOpts,
            label: "head",
            density: 0.0008,
        });

        const link = (
            bodyA: Matter.Body,
            bodyB: Matter.Body,
            pointA: Matter.Vector,
            stiffness: number,
            damping: number
        ) =>
            Matter.Constraint.create({
                bodyA,
                bodyB,
                pointA,
                pointB: { x: 0, y: 0 },
                stiffness,
                damping,
            });

        const constraints = [
            // Wheels — triangulated to the chassis; slight give acts as suspension.
            link(this.chassis, this.rearWheel, { x: -32, y: 6 }, 0.45, 0.12),
            link(this.chassis, this.rearWheel, { x: -4, y: 6 }, 0.45, 0.12),
            link(this.chassis, this.frontWheel, { x: 32, y: 6 }, 0.45, 0.12),
            link(this.chassis, this.frontWheel, { x: 4, y: 6 }, 0.45, 0.12),
            // Head rides above the chassis — rigid enough to track, soft enough to bob.
            link(this.chassis, this.head, { x: -14, y: -6 }, 0.85, 0.2),
            link(this.chassis, this.head, { x: 10, y: -6 }, 0.85, 0.2),
        ];

        this.bikeParts = [this.rearWheel, this.frontWheel, this.chassis, this.head];
        Matter.World.add(world, [...this.bikeParts, ...constraints]);

        this.lastAngle = this.chassis.angle;

        // Ground contact + crash detection.
        Matter.Events.on(this.engine, "collisionStart", (event) => {
            for (const pair of event.pairs) {
                const labels = [pair.bodyA.label, pair.bodyB.label];
                if (labels.includes("terrain")) {
                    if (labels.includes("rearWheel") || labels.includes("frontWheel")) {
                        this.groundContacts.add(pair.id);
                    }
                    if (labels.includes("head") && this.phase === "riding") {
                        this.crash();
                    }
                }
            }
        });
        Matter.Events.on(this.engine, "collisionEnd", (event) => {
            for (const pair of event.pairs) {
                this.groundContacts.delete(pair.id);
            }
        });
    }

    get grounded(): boolean {
        return this.groundContacts.size > 0;
    }

    start() {
        if (this.phase === "ready") {
            this.phase = "riding";
        }
    }

    /** Space — queue a small hop, applied next step if grounded. */
    lift() {
        this.liftQueued = true;
    }

    /** Advance simulation by real elapsed ms using fixed 60Hz physics steps. */
    step(realDtMs: number): TrickEvent[] {
        if (this.phase !== "riding") {
            return [];
        }
        const events: TrickEvent[] = [];
        this.accumulator = Math.min(this.accumulator + realDtMs, FIXED_DT_MS * 5);
        while (this.accumulator >= FIXED_DT_MS) {
            this.accumulator -= FIXED_DT_MS;
            this.fixedStep(events);
            if (this.phase !== "riding") {
                break;
            }
        }
        return events;
    }

    private fixedStep(events: TrickEvent[]) {
        const dt = FIXED_DT_MS / 1000;
        this.elapsed += dt;

        // ── Controls (Hill-Climb style) ──
        // Grounded: → moves right, ← moves left. Drive by easing horizontal
        // velocity toward a target (smooth, no bounce) rather than forcing wheel
        // spin, which fought the contact solver and made the bike jitter. Wheel
        // spin is then synced to travel purely for the rolling look.
        // Airborne: → / ← roll the whole bike (constraints carry the wheels).
        const dir = (this.input.forward ? 1 : 0) - (this.input.back ? 1 : 0);
        if (this.grounded) {
            if (dir !== 0) {
                // Drive BOTH wheels (AWD) toward the no-slip spin for the target
                // travel speed, ramped. Matched spin + zero restitution = smooth
                // roll with no slip-bounce; we never touch the chassis/rider
                // velocity, so the rider can't get whipped into the ground.
                const targetSpin = (dir * MAX_SPEED) / WHEEL_RADIUS;
                const rs = this.rearWheel.angularVelocity + (targetSpin - this.rearWheel.angularVelocity) * ACCEL_LERP;
                const fs =
                    this.frontWheel.angularVelocity + (targetSpin - this.frontWheel.angularVelocity) * ACCEL_LERP;
                Matter.Body.setAngularVelocity(this.rearWheel, rs);
                Matter.Body.setAngularVelocity(this.frontWheel, fs);
            }
            // Damp chassis wobble so bumps don't flip the bike.
            Matter.Body.setAngularVelocity(this.chassis, this.chassis.angularVelocity * GROUND_SPIN_DAMP);
        } else if (dir !== 0) {
            const av = Math.max(-MAX_AIR_AV, Math.min(MAX_AIR_AV, this.chassis.angularVelocity + dir * AIR_AV_STEP));
            Matter.Body.setAngularVelocity(this.chassis, av);
        }
        if (this.liftQueued) {
            this.liftQueued = false;
            if (this.grounded) {
                // Pure vertical pop — same upward velocity on every part, x and
                // rotation untouched, so the bike lifts straight up without lean.
                for (const part of this.bikeParts) {
                    Matter.Body.setVelocity(part, { x: part.velocity.x, y: -LIFT_VELOCITY });
                }
            }
        }

        Matter.Engine.update(this.engine, FIXED_DT_MS);

        // ── Scoring ──
        const angle = this.chassis.angle;
        const angleDelta = angle - this.lastAngle;
        this.lastAngle = angle;
        const trickEvents = updateScore(this.scoreState, {
            dt,
            x: this.chassis.position.x,
            grounded: this.grounded,
            angleDelta,
        });
        for (const e of trickEvents) {
            events.push(e);
            this.callbacks.onTrick(e);
        }

        // ── Milestones: award each checkpoint as the rider crosses it ──
        while (
            this.milestonesPassed < this.terrain.milestones.length &&
            this.chassis.position.x >= this.terrain.milestones[this.milestonesPassed]!
        ) {
            this.milestonesPassed++;
            this.scoreState.trickPts += MILESTONE_POINTS;
            this.scoreState.score = this.scoreState.distancePts + this.scoreState.trickPts;
            const ev: TrickEvent = {
                label: `Checkpoint ${this.milestonesPassed}/${this.terrain.milestones.length}`,
                points: MILESTONE_POINTS,
            };
            events.push(ev);
            this.callbacks.onTrick(ev);
        }

        // ── End conditions ──
        if (this.chassis.position.y > this.terrain.maxY + FALL_MARGIN) {
            this.crash();
            return;
        }
        if (this.chassis.position.x >= this.terrain.finishX) {
            this.phase = "finished";
            this.callbacks.onFinish();
        }
    }

    private crash() {
        if (this.phase !== "riding") {
            return;
        }
        this.phase = "crashed";
        this.callbacks.onCrash();
    }

    getState(): RideState {
        return {
            phase: this.phase,
            elapsed: this.elapsed,
            score: this.scoreState,
            bike: {
                chassis: {
                    x: this.chassis.position.x,
                    y: this.chassis.position.y,
                    angle: this.chassis.angle,
                },
                rearWheel: {
                    x: this.rearWheel.position.x,
                    y: this.rearWheel.position.y,
                    angle: this.rearWheel.angle,
                },
                frontWheel: {
                    x: this.frontWheel.position.x,
                    y: this.frontWheel.position.y,
                    angle: this.frontWheel.angle,
                },
                head: { x: this.head.position.x, y: this.head.position.y },
                speed: this.chassis.speed,
                grounded: this.grounded,
            },
        };
    }

    getSummary(): RideSummary {
        return {
            score: this.scoreState.score,
            distancePts: this.scoreState.distancePts,
            trickPts: this.scoreState.trickPts,
            maxAirTime: this.scoreState.maxAirTime,
            flips: this.scoreState.flips,
            milestones: this.milestonesPassed,
            finished: this.phase === "finished",
            elapsed: this.elapsed,
        };
    }

    destroy() {
        Matter.Events.off(this.engine, "collisionStart");
        Matter.Events.off(this.engine, "collisionEnd");
        Matter.World.clear(this.engine.world, false);
        Matter.Engine.clear(this.engine);
    }
}
