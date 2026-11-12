import { getChainByGql } from "../lib/chains";
import { PILL_COMBOS, fetchCandles } from "../lib/goldrush";
import { buildTerrain } from "../lib/terrain";
import type { StreamClient } from "../lib/wsClient";
import type { OHLCVCandle, TimeframeId, Track } from "../types";
import ChartPreview from "./ChartPreview";
import { difficultyClass } from "./TrackCard";
import { useEffect, useMemo, useState } from "react";

interface TrackDetailProps {
    client: StreamClient;
    track: Track;
    onHome: () => void;
    onRide: (timeframe: TimeframeId, candles: OHLCVCandle[], smooth: boolean) => void;
}

const PILLS: TimeframeId[] = ["15M", "1H", "1D"];

export default function TrackDetail({ client, track, onHome, onRide }: TrackDetailProps) {
    const [timeframe, setTimeframe] = useState<TimeframeId>("1H");
    const [smooth, setSmooth] = useState(true);
    const [candles, setCandles] = useState<OHLCVCandle[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [comboLabel, setComboLabel] = useState<string | null>(null);

    const chain = getChainByGql(track.chainGql);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setCandles(null);
        const addr = chain.isOrderBook
            ? { token: track.tokenAddress }
            : { pair: track.pairAddress, token: track.tokenAddress };
        void fetchCandles(client, track.chainGql, addr, PILL_COMBOS[timeframe], 8_000).then((result) => {
            if (!cancelled) {
                setCandles(result?.candles ?? []);
                setComboLabel(result?.combo.label ?? null);
                setLoading(false);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [client, track, timeframe, chain.isOrderBook]);

    const terrainStats = useMemo(() => {
        if (!candles || candles.length < 2) {
            return null;
        }
        try {
            return buildTerrain(candles, false);
        } catch {
            return null;
        }
    }, [candles]);

    const pct =
        candles && candles.length >= 2 && candles[0]!.close > 0
            ? ((candles[candles.length - 1]!.close - candles[0]!.close) / candles[0]!.close) * 100
            : null;
    const up = (pct ?? 0) >= 0;

    return (
        <div className="detail">
            <header className="topbar">
                <span className="logo">
                    RUSH<span className="logo-accent">RIDER</span>
                </span>
            </header>

            <main className="detail-main">
                <button className="back-btn" onClick={onHome}>
                    ← Home
                </button>

                <div className="detail-title">
                    <h1 className="detail-symbol">{track.symbol}</h1>
                    <span className="detail-name">
                        {track.name} · {chain.displayName}
                    </span>
                </div>
                <div className="detail-sub">
                    {pct !== null ? (
                        <span className={up ? "pct-up" : "pct-down"}>
                            {up ? "+" : ""}
                            {pct.toFixed(1)}%
                        </span>
                    ) : null}
                    {terrainStats ? (
                        <span className={difficultyClass(terrainStats.difficulty)}>{terrainStats.difficulty}</span>
                    ) : null}
                </div>

                <div className="pill-row">
                    <div className="pills">
                        {PILLS.map((p) => (
                            <button
                                key={p}
                                className={p === timeframe ? "pill active" : "pill"}
                                onClick={() => setTimeframe(p)}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                    <button
                        className={smooth ? "pill smooth-toggle active" : "pill smooth-toggle"}
                        onClick={() => setSmooth((s) => !s)}
                    >
                        Smooth
                    </button>
                </div>

                {loading ? (
                    <div className="chart-preview chart-preview-empty">LOADING TRACK…</div>
                ) : (
                    <ChartPreview candles={candles ?? []} up={up} />
                )}

                <div className="tile-row">
                    <div className="tile">
                        <span className="tile-label">POINTS</span>
                        <span className="tile-value">{candles?.length ?? "—"}</span>
                    </div>
                    <div className="tile">
                        <span className="tile-label">VOLATILITY</span>
                        <span className="tile-value tile-warn">
                            {terrainStats ? terrainStats.difficulty.toLowerCase() : "—"}
                        </span>
                    </div>
                    <div className="tile">
                        <span className="tile-label">MAX SLOPE</span>
                        <span className="tile-value">
                            {terrainStats ? `${Math.round(terrainStats.maxSlopeDeg)}°` : "—"}
                        </span>
                    </div>
                    <div className="tile">
                        <span className="tile-label">PERIOD</span>
                        <span className="tile-value">{comboLabel ?? timeframe}</span>
                    </div>
                </div>

                <button
                    className="ride-btn"
                    disabled={!candles || candles.length < 2}
                    onClick={() => candles && onRide(timeframe, candles, smooth)}
                >
                    Ride this chart
                </button>
            </main>
        </div>
    );
}
