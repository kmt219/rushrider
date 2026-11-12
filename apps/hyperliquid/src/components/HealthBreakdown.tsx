import { getHealthGradeColor } from "../utils/health";
import type { HealthDimension, HealthScore } from "../utils/health";

interface HealthBreakdownProps {
    health: HealthScore;
}

interface RingProps {
    value: number;
    max: number;
    size: number;
    stroke: number;
    color: string;
    trackColor?: string;
    children?: React.ReactNode;
}

const RING = 76;
const MAIN_STROKE = 7;
const DIM_STROKE = 5;

function Ring({ value, max, size, stroke, color, trackColor = "var(--border)", children }: RingProps) {
    const r = (size - stroke) / 2;
    const cx = size / 2;
    const cy = size / 2;
    const circumference = 2 * Math.PI * r;
    const filled = Math.min(value / max, 1) * circumference;
    const offset = circumference - filled;

    return (
        <svg width={size} height={size} style={{ display: "block" }}>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
            <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={color}
                strokeWidth={stroke}
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                transform={`rotate(-90 ${cx} ${cy})`}
                style={{ transition: "stroke-dashoffset 0.5s ease" }}
            />
            {children}
        </svg>
    );
}

function DimRing({ dim }: { dim: HealthDimension }) {
    const { text } = getHealthGradeColor(dim.grade);
    const cx = RING / 2;
    const cy = RING / 2;

    return (
        <div className="health-dim-ring">
            <Ring value={dim.pts} max={dim.max} size={RING} stroke={DIM_STROKE} color={text}>
                {/* pts/max on two tight lines, vertically centred together */}
                <text
                    x={cx}
                    y={cy - 5}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={text}
                    fontSize="14"
                    fontWeight="700"
                    fontFamily="var(--font-mono)"
                >
                    {dim.pts}
                </text>
                <text
                    x={cx}
                    y={cy + 8}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="var(--fg-muted)"
                    fontSize="9"
                    fontFamily="var(--font-mono)"
                >
                    /{dim.max}
                </text>
            </Ring>
            <span className="health-dim-ring-label">{dim.label}</span>
        </div>
    );
}

export function HealthBreakdown({ health }: HealthBreakdownProps) {
    const { text } = getHealthGradeColor(health.grade);
    const trendArrow = health.trend === "improving" ? "↑" : health.trend === "deteriorating" ? "↓" : "→";
    const trendColor =
        health.trend === "improving"
            ? "var(--positive)"
            : health.trend === "deteriorating"
              ? "var(--negative)"
              : "var(--fg-dim)";

    const isNoData = health.grade === "N/A";
    const cx = RING / 2;
    const cy = RING / 2;

    return (
        <section className="health-breakdown">
            <span className="health-section-label">MARKET HEALTH</span>
            <div className="health-circular">
                {/* Main ring — same size as dim rings, thicker stroke for hierarchy */}
                <div className="health-main-ring">
                    <Ring value={isNoData ? 0 : health.total} max={100} size={RING} stroke={MAIN_STROKE} color={text}>
                        <text
                            x={cx}
                            y={isNoData ? cy : cy - 8}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill={text}
                            fontSize="16"
                            fontWeight="800"
                            fontFamily="var(--font-mono)"
                        >
                            {isNoData ? "—" : health.grade}
                        </text>
                        {!isNoData && (
                            <text
                                x={cx}
                                y={cy + 5}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fill="var(--fg-muted)"
                                fontSize="8"
                                fontFamily="var(--font-mono)"
                            >
                                {health.total}/100
                            </text>
                        )}
                        {!isNoData && (
                            <text
                                x={cx}
                                y={cy + 15}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fill={trendColor}
                                fontSize="8"
                                fontFamily="var(--font-mono)"
                            >
                                {trendArrow}
                            </text>
                        )}
                    </Ring>
                </div>

                <div className="health-ring-divider" />

                {!isNoData && (
                    <div className="health-dim-rings">
                        <DimRing dim={health.dimensions.volume} />
                        <DimRing dim={health.dimensions.volatility} />
                        <DimRing dim={health.dimensions.priceAvailability} />
                    </div>
                )}

                {isNoData && <span className="health-no-data-inline">No data available</span>}
            </div>
        </section>
    );
}
