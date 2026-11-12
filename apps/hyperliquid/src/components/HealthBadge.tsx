import { getHealthGradeColor } from "../utils/health";
import type { HealthScore } from "../utils/health";

interface HealthBadgeProps {
    health: HealthScore;
    showTooltip?: boolean;
}

export function HealthBadge({ health, showTooltip = true }: HealthBadgeProps) {
    const { bg, text } = getHealthGradeColor(health.grade);
    const trendArrow = health.trend === "improving" ? "↑" : health.trend === "deteriorating" ? "↓" : "→";
    const trendColor =
        health.trend === "improving"
            ? "var(--positive)"
            : health.trend === "deteriorating"
              ? "var(--negative)"
              : "var(--fg-dim)";

    const tooltipText = showTooltip
        ? health.grade === "N/A"
            ? "Health: N/A — no GoldRush data yet"
            : "Health: " +
              health.grade +
              " (" +
              health.total +
              "/100) — Vol: " +
              health.dimensions.volume.pts +
              "pts, Volatility: " +
              health.dimensions.volatility.pts +
              "pts, Price: " +
              health.dimensions.priceAvailability.pts +
              "pts"
        : undefined;

    return (
        <span className="health-badge" style={{ background: bg, color: text }} title={tooltipText}>
            {health.grade}
            {health.grade !== "N/A" && (
                <span className="health-trend" style={{ color: trendColor }}>
                    {trendArrow}
                </span>
            )}
        </span>
    );
}
