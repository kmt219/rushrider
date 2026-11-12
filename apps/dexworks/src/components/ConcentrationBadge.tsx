import type { ConcentrationTier } from "../types";
import { hhiColor, hhiLabel } from "../utils/concentration";

interface ConcentrationBadgeProps {
    hhi: number;
    tier: ConcentrationTier;
    loading?: boolean;
}

/**
 * Inline HHI concentration badge for pair table rows.
 * Shows the 0-100 HHI score with a color-coded tier label.
 */
export function ConcentrationBadge({ hhi, tier, loading }: ConcentrationBadgeProps) {
    if (loading) {
        return <span className="hhi-badge hhi-badge--loading">…</span>;
    }

    return (
        <span
            className={`hhi-badge hhi-badge--${tier}`}
            title={`HHI: ${hhi}/100 — ${tier} concentration. Lower is safer.`}
            style={{ color: hhiColor(tier) }}
        >
            {hhi}
            <span className="hhi-badge-tier">{hhiLabel(tier)}</span>
        </span>
    );
}
