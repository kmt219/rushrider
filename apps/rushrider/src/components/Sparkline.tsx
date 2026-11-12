/** Pure-SVG sparkline for track cards and search results. */
interface SparklineProps {
    closes: number[];
    width?: number;
    height?: number;
    up: boolean;
}

export default function Sparkline({ closes, width = 260, height = 84, up }: SparklineProps) {
    if (closes.length < 2) {
        return <div className="sparkline-empty">NO DATA</div>;
    }
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;
    const pad = 6;
    const pts = closes
        .map((c, i) => {
            const x = pad + (i / (closes.length - 1)) * (width - pad * 2);
            const y = pad + (1 - (c - min) / range) * (height - pad * 2);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
    const color = up ? "var(--accent)" : "var(--loss)";
    return (
        <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" />
        </svg>
    );
}
