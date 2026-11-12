import { X } from "lucide-react";
import { useEffect, useRef } from "react";

interface Props {
    open: boolean;
    onClose: () => void;
}

interface ShortcutEntry {
    keys: string[];
    description: string;
}

interface ShortcutSection {
    heading: string;
    items: ShortcutEntry[];
}

/** Detect macOS at runtime — uses the modern userAgentData API where available,
 *  then falls back to navigator.platform (deprecated but universally supported). */
function isMacOS(): boolean {
    if (typeof navigator === "undefined") return false;
    const uad = (navigator as Navigator & { userAgentData?: { platform: string } }).userAgentData;
    if (uad?.platform) return uad.platform.toLowerCase().includes("mac");
    return /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? "");
}

function buildSections(mac: boolean): ShortcutSection[] {
    const mod = mac ? "⌘" : "Ctrl";
    const alt = mac ? "⌥" : "Alt";
    const ret = mac ? "↵" : "Enter";
    return [
        {
            heading: "Palette & Actions",
            items: [
                { keys: ["?"], description: "Show keyboard shortcuts" },
                { keys: [mod, "K"], description: "Open command palette" },
                { keys: [alt, "S"], description: "Export watchlist CSV" },
                { keys: [alt, "W"], description: "Unwatch focused pair" },
            ],
        },
        {
            heading: "Watchlist Navigation",
            items: [
                { keys: ["↑", "↓"], description: "Move focus up / down" },
                { keys: [ret], description: "Select focused pair" },
                { keys: ["Esc"], description: "Clear keyboard focus" },
            ],
        },
        {
            heading: "Gem Tabs",
            items: [
                {
                    keys: ["1", "2", "3", "4", "5"],
                    description: "New · Momentum · Gainers · Losers · Spikes",
                },
            ],
        },
        {
            heading: "Timeframe",
            items: [
                { keys: ["["], description: "Previous timeframe" },
                { keys: ["]"], description: "Next timeframe" },
            ],
        },
    ];
}

export function KeyboardShortcutsDialog({ open, onClose }: Props) {
    const mac = isMacOS();
    const sections = buildSections(mac);
    const closeRef = useRef<HTMLButtonElement>(null);

    // Move focus to close button when dialog opens for keyboard accessibility
    useEffect(() => {
        if (open) closeRef.current?.focus();
    }, [open]);

    // Escape closes the dialog
    useEffect(() => {
        if (!open) return;
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") {
                e.stopPropagation();
                onClose();
            }
        }
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [open, onClose]);

    if (!open) return null;

    return (
        /* Backdrop — click outside to dismiss */
        <div className="ks-overlay" role="presentation" onClick={onClose}>
            {/* Dialog panel — stop propagation so inside clicks don't close */}
            <div
                className="ks-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="ks-title"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="ks-header">
                    <span id="ks-title" className="ks-title">
                        KEYBOARD SHORTCUTS
                    </span>
                    <button ref={closeRef} className="ks-close" onClick={onClose} aria-label="Close keyboard shortcuts">
                        <X size={14} />
                    </button>
                </div>

                <div className="ks-body">
                    {sections.map((section) => (
                        <div key={section.heading} className="ks-section">
                            <div className="ks-section-heading">{section.heading}</div>
                            {section.items.map((item, idx) => (
                                <div key={idx} className="ks-row">
                                    <span className="ks-keys">
                                        {item.keys.map((k, ki) => (
                                            <kbd key={ki} className="ks-kbd">
                                                {k}
                                            </kbd>
                                        ))}
                                    </span>
                                    <span className="ks-desc">{item.description}</span>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>

                <div className="ks-footer">{mac ? "⌘K" : "Ctrl+K"} also opens the command palette</div>
            </div>
        </div>
    );
}
