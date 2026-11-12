import type { FundingSnapshot } from "../../types";

interface FundingChartProps {
    data: FundingSnapshot[];
}

function fmtBps(rate: number): string {
    const bps = rate * 10000;
    return `${bps >= 0 ? "+" : ""}${bps.toFixed(3)} bps`;
}

function fmtBpsShort(rate: number): string {
    const bps = rate * 10000;
    return `${bps >= 0 ? "+" : ""}${bps.toFixed(2)}`;
}

export function FundingChart({ data }: FundingChartProps) {
    if (data.length < 2) return <div className="empty-msg">No funding data</div>;

    const slice = data.slice(-96);
    const allRates = data.map((d) => d.rate);
    const rates = slice.map((d) => d.rate);

    const W = 560;
    const H = 180;
    const PAD = { top: 16, right: 12, bottom: 28, left: 54 };
    const cW = W - PAD.left - PAD.right;
    const cH = H - PAD.top - PAD.bottom;

    const rawMax = Math.max(Math.abs(Math.min(...rates)), Math.abs(Math.max(...rates)));
    const maxAbs = Math.max(rawMax, 0.00005);
    const zeroY = PAD.top + cH / 2;

    const barW = Math.max(2, (cW / slice.length) * 0.72);
    const step = cW / slice.length;

    const avgRate = allRates.reduce((a, b) => a + b, 0) / allRates.length;
    const lastRate = rates[rates.length - 1]!;
    const annualised = avgRate * 3 * 365 * 100;
    const annClass = annualised >= 0 ? "val-positive" : "val-negative";
    const lastClass = lastRate >= 0 ? "val-positive" : "val-negative";
    const avgClass = avgRate >= 0 ? "val-positive" : "val-negative";

    const yLabel = (rate: number) => fmtBpsShort(rate);

    const gridRates = [maxAbs, maxAbs / 2, 0, -maxAbs / 2, -maxAbs];

    return (
        <div className="funding-chart-v2">
            <svg
                width="100%"
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="xMidYMid meet"
                style={{ display: "block" }}
            >
                <defs>
                    <linearGradient id="barGainGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--gain)" stopOpacity="0.9" />
                        <stop offset="100%" stopColor="var(--gain)" stopOpacity="0.4" />
                    </linearGradient>
                    <linearGradient id="barLossGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--loss)" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="var(--loss)" stopOpacity="0.9" />
                    </linearGradient>
                </defs>

                {/* Grid lines */}
                {gridRates.map((r, i) => {
                    const gy = zeroY - (r / maxAbs) * (cH / 2);
                    const isZero = r === 0;
                    return (
                        <g key={i}>
                            <line
                                x1={PAD.left}
                                y1={gy}
                                x2={W - PAD.right}
                                y2={gy}
                                stroke={isZero ? "var(--fg-muted)" : "var(--border)"}
                                strokeWidth={isZero ? 0.8 : 0.4}
                                strokeDasharray={isZero ? "none" : "3 3"}
                                opacity={isZero ? 0.6 : 0.5}
                            />
                            <text
                                x={PAD.left - 6}
                                y={gy + 3.5}
                                textAnchor="end"
                                fill="var(--fg-muted)"
                                fontSize="8.5"
                                fontFamily="var(--font-mono)"
                            >
                                {yLabel(r)}
                            </text>
                        </g>
                    );
                })}

                {/* Bars */}
                {slice.map((d, i) => {
                    const x = PAD.left + i * step + (step - barW) / 2;
                    const normalized = d.rate / maxAbs;
                    const barH = Math.abs(normalized) * (cH / 2);
                    const y = d.rate >= 0 ? zeroY - barH : zeroY;
                    const isLast = i === slice.length - 1;
                    const fill = d.rate >= 0 ? "url(#barGainGrad)" : "url(#barLossGrad)";

                    return (
                        <rect
                            key={i}
                            x={x}
                            y={y}
                            width={barW}
                            height={Math.max(barH, 1)}
                            fill={fill}
                            opacity={isLast ? 1 : 0.85}
                            rx={barW > 3 ? 0.5 : 0}
                        >
                            <title>
                                {new Date(d.time).toLocaleString()} — {fmtBps(d.rate)}
                            </title>
                        </rect>
                    );
                })}

                {/* Last bar highlight ring */}
                {(() => {
                    const i = slice.length - 1;
                    const d = slice[i]!;
                    const x = PAD.left + i * step + (step - barW) / 2;
                    const normalized = d.rate / maxAbs;
                    const barH = Math.abs(normalized) * (cH / 2);
                    const y = d.rate >= 0 ? zeroY - barH : zeroY;
                    return (
                        <rect
                            x={x - 0.5}
                            y={y - 0.5}
                            width={barW + 1}
                            height={Math.max(barH, 1) + 1}
                            fill="none"
                            stroke={d.rate >= 0 ? "var(--gain)" : "var(--loss)"}
                            strokeWidth="0.8"
                            opacity="0.7"
                            rx={barW > 3 ? 1 : 0}
                        />
                    );
                })()}

                {/* X-axis date labels */}
                <text
                    x={PAD.left}
                    y={H - 6}
                    fill="var(--fg-muted)"
                    fontSize="8.5"
                    textAnchor="start"
                    fontFamily="var(--font-mono)"
                >
                    {new Date(slice[0]!.time).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </text>
                <text
                    x={(W - PAD.right + PAD.left) / 2}
                    y={H - 6}
                    fill="var(--fg-muted)"
                    fontSize="8.5"
                    textAnchor="middle"
                    fontFamily="var(--font-mono)"
                >
                    {new Date(slice[Math.floor(slice.length / 2)]!.time).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                    })}
                </text>
                <text
                    x={W - PAD.right}
                    y={H - 6}
                    fill="var(--fg-muted)"
                    fontSize="8.5"
                    textAnchor="end"
                    fontFamily="var(--font-mono)"
                >
                    {new Date(slice[slice.length - 1]!.time).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                    })}
                </text>
            </svg>

            {/* Stats row */}
            <div className="funding-stats-v2">
                <div className="funding-stat-card">
                    <span className="funding-stat-label">Avg Rate</span>
                    <span className={`funding-stat-value ${avgClass}`}>{fmtBps(avgRate)}</span>
                </div>
                <div className="funding-stat-card">
                    <span className="funding-stat-label">Last</span>
                    <span className={`funding-stat-value ${lastClass}`}>{fmtBps(lastRate)}</span>
                </div>
                <div className="funding-stat-card">
                    <span className="funding-stat-label">Annualised</span>
                    <span className={`funding-stat-value ${annClass}`}>
                        {annualised >= 0 ? "+" : ""}
                        {annualised.toFixed(2)}%
                    </span>
                </div>
                <div className="funding-stat-card">
                    <span className="funding-stat-label">Samples</span>
                    <span className="funding-stat-value">{allRates.length}</span>
                </div>
            </div>
        </div>
    );
}
