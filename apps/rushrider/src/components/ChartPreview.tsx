/** SVG chart preview on the track detail page — line, START dot, price/date axis labels. */
import type { OHLCVCandle } from "../types";

interface ChartPreviewProps {
    candles: OHLCVCandle[];
    up: boolean;
}

function fmtPrice(p: number): string {
    if (p >= 1_000) {
        return `$${Math.round(p).toLocaleString("en-US")}`;
    }
    if (p >= 1) {
        return `$${p.toFixed(2)}`;
    }
    return `$${p.toPrecision(3)}`;
}

function fmtTime(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function ChartPreview({ candles, up }: ChartPreviewProps) {
    const width = 720;
    const height = 280;
    const pad = { top: 24, right: 64, bottom: 28, left: 16 };

    const closes = candles.map((c) => c.close);
    if (closes.length < 2) {
        return <div className="chart-preview chart-preview-empty">NO TRACK DATA</div>;
    }
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;

    const xy = (i: number, c: number): [number, number] => [
        pad.left + (i / (closes.length - 1)) * innerW,
        pad.top + (1 - (c - min) / range) * innerH,
    ];
    const pts = closes
        .map((c, i) =>
            xy(i, c)
                .map((v) => v.toFixed(1))
                .join(",")
        )
        .join(" ");
    const [startX, startY] = xy(0, closes[0]!);
    const color = up ? "var(--accent)" : "var(--loss)";
    const mid = (min + max) / 2;

    return (
        <div className="chart-preview">
            <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                <polyline points={pts} fill="none" stroke={color} strokeWidth="2" />
                <circle cx={startX} cy={startY} r="5" fill={color} />
                <text x={startX + 10} y={startY - 10} className="chart-label">
                    START
                </text>
                <text x={width - pad.right + 8} y={pad.top + 4} className="chart-label">
                    {fmtPrice(max)}
                </text>
                <text x={width - pad.right + 8} y={pad.top + innerH / 2 + 4} className="chart-label">
                    {fmtPrice(mid)}
                </text>
                <text x={width - pad.right + 8} y={pad.top + innerH + 4} className="chart-label">
                    {fmtPrice(min)}
                </text>
                <text x={pad.left} y={height - 8} className="chart-label">
                    {fmtTime(candles[0]!.timestamp)}
                </text>
                <text x={pad.left + innerW - 36} y={height - 8} className="chart-label">
                    {fmtTime(candles[candles.length - 1]!.timestamp)}
                </text>
            </svg>
        </div>
    );
}
