import type { RiskEvent } from "../scoring/types";

interface RiskTimelineProps {
    events: RiskEvent[];
    pairedAt: number;
}

function formatRelative(ms: number): string {
    if (ms < 60_000) return `+${Math.floor(ms / 1000)}s`;
    if (ms < 3_600_000) return `+${Math.floor(ms / 60_000)}m`;
    return `+${(ms / 3_600_000).toFixed(1)}h`;
}

function severityIcon(severity: RiskEvent["severity"]): string {
    switch (severity) {
        case "ok":
            return "✓";
        case "warning":
            return "⚠";
        case "danger":
            return "🔴";
        default:
            return "▪";
    }
}

function severityColor(severity: RiskEvent["severity"]): string {
    switch (severity) {
        case "ok":
            return "var(--accent)";
        case "warning":
            return "var(--warning)";
        case "danger":
            return "var(--destructive)";
        default:
            return "var(--fg-muted)";
    }
}

export function RiskTimeline({ events, pairedAt }: RiskTimelineProps) {
    if (events.length === 0) {
        return (
            <div className="risk-timeline">
                <div className="risk-timeline-title">RISK TIMELINE</div>
                <div className="risk-timeline-empty">No events recorded yet</div>
            </div>
        );
    }

    return (
        <div className="risk-timeline">
            <div className="risk-timeline-title">RISK TIMELINE</div>
            <div className="risk-timeline-list">
                {events.map((ev, i) => {
                    const relMs = ev.relativeMs > 0 ? ev.relativeMs : ev.timestamp - pairedAt;
                    const color = severityColor(ev.severity);
                    return (
                        <div key={i} className="risk-timeline-event">
                            <span className="risk-timeline-time" style={{ color }}>
                                {formatRelative(Math.max(0, relMs))}
                            </span>
                            <span className="risk-timeline-icon" style={{ color }}>
                                {severityIcon(ev.severity)}
                            </span>
                            <span className="risk-timeline-text">{ev.event}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
