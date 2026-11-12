import { formatUSD } from "../../utils/format";

interface OIGaugeProps {
    openInterest: number;
    oiCap: number;
}

export function OIGauge({ openInterest, oiCap }: OIGaugeProps) {
    const pct = Math.min((openInterest / oiCap) * 100, 100);
    const level = pct > 80 ? "high" : pct > 50 ? "mid" : "low";

    return (
        <div className="oi-gauge">
            <span>{formatUSD(openInterest)}</span>
            <div className="oi-gauge-bar">
                <div className={`oi-gauge-fill oi-gauge-fill--${level}`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}
