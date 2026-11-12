import type { Difficulty, Track } from "../types";
import Sparkline from "./Sparkline";

export interface TrackCardData {
    track: Track;
    closes: number[];
    difficulty: Difficulty | null;
}

interface TrackCardProps {
    data: TrackCardData;
    onSelect: (track: Track) => void;
}

export function difficultyClass(d: Difficulty): string {
    return `badge badge-${d.toLowerCase()}`;
}

export default function TrackCard({ data, onSelect }: TrackCardProps) {
    const { track, closes, difficulty } = data;
    const pct =
        track.pctChange24h ??
        (closes.length >= 2 && closes[0]! > 0 ? ((closes[closes.length - 1]! - closes[0]!) / closes[0]!) * 100 : null);
    const up = (pct ?? 0) >= 0;

    return (
        <button className="track-card" onClick={() => onSelect(track)}>
            <div className="track-card-head">
                <span className="track-card-symbol">{track.symbol}</span>
                {difficulty ? <span className={difficultyClass(difficulty)}>{difficulty}</span> : null}
            </div>
            <Sparkline closes={closes} up={up} />
            <div className="track-card-foot">
                {track.name}
                {pct !== null ? (
                    <span className={up ? "pct-up" : "pct-down"}>
                        {" · "}
                        {up ? "+" : ""}
                        {pct.toFixed(1)}%
                    </span>
                ) : null}
            </div>
        </button>
    );
}
