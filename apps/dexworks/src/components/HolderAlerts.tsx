/**
 * HolderAlerts — fixed-position toast stack for holder intelligence alerts.
 * Renders in the bottom-right corner with auto-dismiss and manual close.
 */
import type { HolderAlertItem } from "../hooks/useHolderAlerts";

const ICONS: Record<string, string> = {
    danger: "🚨",
    warn: "⚠️",
    info: "ℹ️",
};

interface HolderAlertsProps {
    alerts: HolderAlertItem[];
    onDismiss: (id: string) => void;
}

export function HolderAlerts({ alerts, onDismiss }: HolderAlertsProps) {
    if (alerts.length === 0) return null;
    return (
        <div className="holder-alerts-stack" role="log" aria-live="polite">
            {alerts.map((a) => (
                <div key={a.id} className={`holder-alert holder-alert--${a.level}`}>
                    <span className="holder-alert-icon">{ICONS[a.level]}</span>
                    <span className="holder-alert-msg">{a.msg}</span>
                    <button className="holder-alert-close" onClick={() => onDismiss(a.id)} aria-label="Dismiss">
                        ✕
                    </button>
                </div>
            ))}
        </div>
    );
}
