import { earnedBadges } from "../game/achievements";
import { RideEngine } from "../game/engine";
import type { RidePhase, RideSummary } from "../game/engine";
import { DEFAULT_THEME, drawFrame, updateCamera } from "../game/render";
import type { Callout, Camera } from "../game/render";
import { bestScoreFor, recordBestScore, recordCrash, recordRide } from "../lib/stats";
import { buildTerrain } from "../lib/terrain";
import type { OHLCVCandle, TimeframeId, Track } from "../types";
import Minimap from "./Minimap";
import ShareCard from "./ShareCard";
import { useEffect, useMemo, useRef, useState } from "react";

interface RideProps {
    track: Track;
    timeframe: TimeframeId;
    candles: OHLCVCandle[];
    smooth: boolean;
    onExit: () => void;
}

interface HudState {
    phase: RidePhase;
    score: number;
    airTime: number;
    elapsed: number;
    riderX: number;
    riderY: number;
    grounded: boolean;
}

const INITIAL_HUD: HudState = {
    phase: "ready",
    score: 0,
    airTime: 0,
    elapsed: 0,
    riderX: 0,
    riderY: 0,
    grounded: true,
};

function fmtTimer(s: number): string {
    const m = Math.floor(s / 60);
    return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
}

export default function Ride({ track, timeframe, candles, smooth, onExit }: RideProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [hud, setHud] = useState<HudState>(INITIAL_HUD);
    const [resetCounter, setResetCounter] = useState(0);
    const [newBest, setNewBest] = useState(false);
    const [summary, setSummary] = useState<RideSummary | null>(null);
    const [showShare, setShowShare] = useState(false);
    const finalScoreRef = useRef(0);

    const terrain = useMemo(() => buildTerrain(candles, smooth), [candles, smooth]);
    const trackUp = terrain.priceEnd >= terrain.priceStart;
    const trackKey = `${track.chainGql}:${track.pairAddress || track.tokenAddress}:${timeframe}`;
    const closes = useMemo(() => candles.map((c) => c.close), [candles]);
    const badges = useMemo(() => (summary ? earnedBadges(summary) : []), [summary]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) {
            return;
        }

        setNewBest(false);
        setHud(INITIAL_HUD);
        setSummary(null);
        setShowShare(false);

        const callouts: Callout[] = [];
        let statsRecorded = false;

        const engine = new RideEngine(terrain, {
            onTrick: (event) => {
                const state = engine.getState();
                callouts.push({
                    label: event.label,
                    points: event.points,
                    x: state.bike.chassis.x - 120,
                    y: state.bike.chassis.y - 110,
                    age: 0,
                });
            },
            onCrash: () => {
                if (!statsRecorded) {
                    statsRecorded = true;
                    setSummary(engine.getSummary());
                    recordCrash(engine.getState().score.score);
                }
            },
            onFinish: () => {
                if (!statsRecorded) {
                    statsRecorded = true;
                    const score = engine.getState().score.score;
                    finalScoreRef.current = score;
                    setSummary(engine.getSummary());
                    recordRide(score);
                    setNewBest(recordBestScore(trackKey, score));
                }
            },
        });

        const camera: Camera = { x: 0, y: terrain.startY - canvas.height * 0.55 };

        const keys = new Set<string>();
        const applyKeys = () => {
            // → drive forward (go right), ← reverse / brake.
            engine.input.forward = keys.has("ArrowRight");
            engine.input.back = keys.has("ArrowLeft");
        };

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.code === "Escape") {
                onExit();
                return;
            }
            if (e.code === "KeyR") {
                setResetCounter((c) => c + 1);
                return;
            }
            if (["ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
                e.preventDefault();
            }
            if (e.code === "Space") {
                engine.lift(); // small hop
            }
            keys.add(e.code);
            applyKeys();
            engine.start();
        };
        const onKeyUp = (e: KeyboardEvent) => {
            keys.delete(e.code);
            applyKeys();
        };
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener("resize", resize);

        let raf = 0;
        let last = performance.now();
        let hudAccum = 0;

        const loop = (now: number) => {
            const dtMs = Math.min(now - last, 100);
            last = now;
            const dt = dtMs / 1000;

            engine.step(dtMs);
            const state = engine.getState();

            updateCamera(camera, state.bike, canvas.width, canvas.height, dt);
            for (const c of callouts) {
                c.age += dt;
            }
            while (callouts.length > 0 && callouts[0]!.age > 1.6) {
                callouts.shift();
            }

            drawFrame(ctx, canvas.width, canvas.height, camera, terrain, state.bike, callouts, DEFAULT_THEME, trackUp);

            hudAccum += dtMs;
            if (hudAccum > 100) {
                hudAccum = 0;
                setHud({
                    phase: state.phase,
                    score: state.score.score,
                    airTime: state.score.airTime,
                    elapsed: state.elapsed,
                    riderX: state.bike.chassis.x,
                    riderY: state.bike.chassis.y,
                    grounded: state.bike.grounded,
                });
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("resize", resize);
            engine.destroy();
        };
        // resetCounter intentionally re-runs the whole effect to restart the ride.
    }, [terrain, trackUp, trackKey, onExit, resetCounter]);

    const best = bestScoreFor(trackKey);

    return (
        <div className="ride">
            <canvas ref={canvasRef} className="ride-canvas" />
            <div className="scanlines" />

            <div className="hud hud-tl">
                <div className="hud-track">
                    {track.symbol} · {timeframe}
                </div>
                <div className="hud-score">
                    {hud.score.toLocaleString("en-US")} <span className="hud-unit">pts</span>
                </div>
                <div className={hud.grounded ? "hud-air grounded" : "hud-air"}>
                    Air: {hud.grounded ? "grounded" : `${hud.airTime.toFixed(1)}s`}
                </div>
            </div>

            <div className="hud hud-tc">{fmtTimer(hud.elapsed)}</div>

            <div className="hud hud-tr">
                <div className="powered-banner">
                    POWERED BY{" "}
                    <a className="powered-accent" href="https://goldrush.dev" target="_blank" rel="noreferrer">
                        GOLDRUSH
                    </a>
                </div>
                <Minimap terrain={terrain} riderX={hud.riderX} riderY={hud.riderY} />
            </div>

            <div className="hud hud-br">
                <div>
                    <kbd>→</kbd> go right · <kbd>←</kbd> go left · <kbd>Space</kbd> hop
                </div>
                <div>
                    <kbd>R</kbd> reset · <kbd>Esc</kbd> back
                </div>
            </div>

            {hud.phase === "ready" ? (
                <div className="overlay">
                    <div className="overlay-title">
                        {track.symbol} · {timeframe}
                    </div>
                    <div className="overlay-sub">PRESS → TO GO</div>
                </div>
            ) : null}

            {hud.phase === "crashed" || hud.phase === "finished" ? (
                <div className="overlay">
                    <div className={hud.phase === "finished" ? "overlay-title finish" : "overlay-title crash"}>
                        {hud.phase === "finished" ? "FINISH!" : "CRASHED"}
                    </div>
                    <div className="overlay-score">
                        {(hud.phase === "finished" ? finalScoreRef.current : hud.score).toLocaleString("en-US")} pts
                        {newBest ? <span className="new-best"> NEW BEST</span> : null}
                    </div>
                    {badges.length > 0 ? (
                        <div className="overlay-badges">
                            {badges.map((b) => (
                                <span key={b.id} className="overlay-badge" title={b.desc}>
                                    {b.icon} {b.label}
                                </span>
                            ))}
                        </div>
                    ) : null}
                    <div className="overlay-sub">
                        time {fmtTimer(hud.elapsed)}
                        {best > 0 && !newBest ? ` · best ${best.toLocaleString("en-US")}` : ""}
                    </div>
                    <div className="overlay-actions">
                        <button className="overlay-share-btn" onClick={() => setShowShare(true)}>
                            SHARE
                        </button>
                    </div>
                    <div className="overlay-sub">
                        <kbd>R</kbd> ride again · <kbd>Esc</kbd> back
                    </div>
                </div>
            ) : null}

            {showShare && summary ? (
                <ShareCard
                    track={track}
                    timeframe={timeframe}
                    summary={summary}
                    badges={badges}
                    closes={closes}
                    onClose={() => setShowShare(false)}
                />
            ) : null}
        </div>
    );
}
