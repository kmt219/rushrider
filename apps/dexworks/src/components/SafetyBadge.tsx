import type { SafetyScore } from "../scoring/types";
import { ShieldCheck } from "lucide-react";

interface SafetyBadgeProps {
    score: SafetyScore | undefined;
    onClick?: (e: React.MouseEvent) => void;
    size?: "sm" | "md";
}

function getColors(riskLevel: SafetyScore["riskLevel"]): { color: string; bg: string; border: string } {
    switch (riskLevel) {
        case "LOW":
            return { color: "var(--accent)", bg: "rgba(0,200,120,0.08)", border: "rgba(0,200,120,0.25)" };
        case "CAUTION":
            return { color: "var(--warning)", bg: "rgba(250,180,0,0.08)", border: "rgba(250,180,0,0.25)" };
        case "HIGH":
            return { color: "#f97316", bg: "rgba(249,115,22,0.08)", border: "rgba(249,115,22,0.25)" };
        case "DANGER":
            return { color: "var(--destructive)", bg: "rgba(220,38,38,0.08)", border: "rgba(220,38,38,0.25)" };
        default:
            return { color: "var(--fg-muted)", bg: "transparent", border: "var(--border)" };
    }
}

export function SafetyBadge({ score, onClick, size = "sm" }: SafetyBadgeProps) {
    if (!score) {
        return (
            <span className={`safety-badge safety-badge--loading safety-badge--${size}`} title="Safety score loading">
                <ShieldCheck size={size === "sm" ? 10 : 12} />
                <span>--</span>
            </span>
        );
    }

    const { color, bg, border } = getColors(score.riskLevel);
    // Show partial numeric score while REST signals load (total > 0 means Phase 1 is done)
    const isLoading = score.riskLevel === "LOADING";
    const label = isLoading && score.total === 0 ? "--" : String(score.total);

    return (
        <button
            className={`safety-badge safety-badge--${size}${isLoading ? " safety-badge--loading" : ""}`}
            style={{ color, background: bg, borderColor: border }}
            onClick={(e) => {
                e.stopPropagation();
                onClick?.(e);
            }}
            title={
                isLoading
                    ? "Safety score loading..."
                    : `Safety: ${score.total}/100 — ${score.riskLevel}. Click for details.`
            }
            aria-label={`Safety score: ${label}`}
        >
            <ShieldCheck size={size === "sm" ? 10 : 12} />
            <span>{label}</span>
        </button>
    );
}
