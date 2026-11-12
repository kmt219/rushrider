interface SparklineProps {
    data: number[];
    width?: number;
    height?: number;
}

export function Sparkline({ data, width = 60, height = 20 }: SparklineProps) {
    if (data.length < 2) return null;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const points = data
        .map((v, i) => {
            const x = (i / (data.length - 1)) * width;
            const y = height - ((v - min) / range) * (height - 2) - 1;
            return `${x},${y}`;
        })
        .join(" ");

    const last = data[data.length - 1]!;
    const first = data[0]!;
    const color = last >= first ? "var(--gain)" : "var(--loss)";

    return (
        <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <polyline fill="none" stroke={color} strokeWidth="1.2" points={points} />
        </svg>
    );
}
