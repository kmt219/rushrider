import type { SignalResult } from "../scoring/types";

interface SignalCardProps {
    signal: SignalResult;
}

const SIGNAL_ICONS: Record<string, string> = {
    LIQUIDITY: "◈",
    HOLDERS: "◎",
    DEPLOYER: "⬡",
    CONTRACT: "≡",
    TRADING: "⇅",
};

function getScoreColor(score: number, max = 20): string {
    const pct = score / max;
    if (pct >= 0.8) return "var(--accent)";
    if (pct >= 0.5) return "var(--warning)";
    if (pct >= 0.25) return "#f97316";
    return "var(--destructive)";
}

function getScoreTier(score: number, max = 20): string {
    const pct = score / max;
    if (pct >= 0.8) return "GOOD";
    if (pct >= 0.5) return "FAIR";
    if (pct >= 0.25) return "POOR";
    return "RISK";
}

export function SignalCard({ signal }: SignalCardProps) {
    if (signal.loading) {
        return (
            <div className="signal-card signal-card--loading">
                <div className="signal-card-header">
                    <div className="signal-card-label-group">
                        <span className="signal-card-icon">◌</span>
                        <span className="signal-card-label">{signal.label || "LOADING"}</span>
                    </div>
                    <span className="signal-card-score signal-card-score--muted">—/20</span>
                </div>
                <div className="signal-card-bar-track">
                    <div className="signal-card-bar-fill signal-card-bar-fill--shimmer" style={{ width: "60%" }} />
                </div>
                <div className="signal-card-details-placeholder">
                    <div className="signal-card-skeleton" style={{ width: "80%" }} />
                    <div className="signal-card-skeleton" style={{ width: "60%" }} />
                </div>
            </div>
        );
    }

    const color = getScoreColor(signal.score);
    const pct = (signal.score / 20) * 100;
    const tier = getScoreTier(signal.score);
    const icon = SIGNAL_ICONS[signal.label] ?? "▪";

    return (
        <div className="signal-card" style={{ "--signal-color": color } as React.CSSProperties}>
            <div className="signal-card-header">
                <div className="signal-card-label-group">
                    <span className="signal-card-icon" style={{ color }}>
                        {icon}
                    </span>
                    <span className="signal-card-label">{signal.label}</span>
                </div>
                <div className="signal-card-score-group">
                    <span
                        className="signal-card-tier"
                        style={{ color, borderColor: `${color}40`, background: `${color}12` }}
                    >
                        {tier}
                    </span>
                    <span className="signal-card-score" style={{ color }}>
                        {signal.score}
                        <span className="signal-card-score-max">/20</span>
                    </span>
                </div>
            </div>
            <div className="signal-card-bar-track">
                <div className="signal-card-bar-fill" style={{ width: `${pct}%`, background: color }} />
            </div>
            <ul className="signal-card-details">
                {signal.details.map((d, i) => (
                    <li key={i} className="signal-card-detail">
                        <span className="signal-card-detail-dot" style={{ background: color }} />
                        {d}
                    </li>
                ))}
            </ul>
            {signal.raw && Object.keys(signal.raw).length > 0 && (
                <dl className="signal-kpi-grid">
                    {Object.entries(signal.raw).map(([k, v]) => (
                        <div key={k} className="signal-kpi-row">
                            <dt>{k}</dt>
                            <dd>{v}</dd>
                        </div>
                    ))}
                </dl>
            )}
        </div>
    );
}
