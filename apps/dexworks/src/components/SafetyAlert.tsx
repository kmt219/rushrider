import { useEffect } from "react";

export interface SafetyAlertData {
    id: string;
    pairAddress: string;
    pairLabel: string;
    message: string;
    score: number;
}

interface SafetyAlertProps {
    alert: SafetyAlertData;
    onDismiss: (id: string) => void;
    onView: (pairAddress: string) => void;
}

function ScoreColor(score: number): string {
    if (score >= 50) return "var(--warning)";
    if (score >= 20) return "#f97316";
    return "var(--destructive)";
}

export function SafetyAlert({ alert, onDismiss, onView }: SafetyAlertProps) {
    useEffect(() => {
        // DANGER alerts (score < 30) persist longer so the user has time to act
        const ms = alert.score < 30 ? 20_000 : 10_000;
        const t = setTimeout(() => onDismiss(alert.id), ms);
        return () => clearTimeout(t);
    }, [alert.id, alert.score, onDismiss]);

    return (
        <div className="safety-alert" role="alert">
            <div className="safety-alert-header">
                <span className="safety-alert-icon">⚠</span>
                <span className="safety-alert-title">SAFETY ALERT — {alert.pairLabel}</span>
                <button className="safety-alert-close" onClick={() => onDismiss(alert.id)} aria-label="Dismiss alert">
                    ✕
                </button>
            </div>
            <div className="safety-alert-body">
                <span className="safety-alert-score" style={{ color: ScoreColor(alert.score) }}>
                    Score: {alert.score}/100
                </span>
                <span className="safety-alert-msg">{alert.message}</span>
            </div>
            <div className="safety-alert-actions">
                <button
                    className="safety-alert-btn"
                    onClick={() => {
                        onView(alert.pairAddress);
                        onDismiss(alert.id);
                    }}
                >
                    VIEW DETAILS
                </button>
                <button className="safety-alert-btn safety-alert-btn--muted" onClick={() => onDismiss(alert.id)}>
                    DISMISS
                </button>
            </div>
        </div>
    );
}

interface SafetyAlertsOverlayProps {
    alerts: SafetyAlertData[];
    onDismiss: (id: string) => void;
    onView: (pairAddress: string) => void;
}

export function SafetyAlertsOverlay({ alerts, onDismiss, onView }: SafetyAlertsOverlayProps) {
    if (alerts.length === 0) return null;
    return (
        <div className="safety-alerts-overlay" aria-live="polite">
            {alerts.map((a) => (
                <SafetyAlert key={a.id} alert={a} onDismiss={onDismiss} onView={onView} />
            ))}
        </div>
    );
}
