import type { NewPairData, PairMetrics } from "../types";
import { SafetyDetailPanel } from "./SafetyDetailPanel";
import { X } from "lucide-react";
import { useEffect } from "react";

interface SafetyScoreModalProps {
    pairData: NewPairData | null;
    chainName: string;
    metrics: PairMetrics | null | undefined;
    onClose: () => void;
}

export function SafetyScoreModal({ pairData, chainName, metrics, onClose }: SafetyScoreModalProps) {
    // Close on Escape
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    if (!pairData) return null;

    const baseToken = pairData.base_token?.contract_ticker_symbol ?? "TOKEN";
    const quoteToken = pairData.quote_token?.contract_ticker_symbol ?? "QUOTE";

    return (
        <>
            {/* Backdrop */}
            <div className="ssm-backdrop" onClick={onClose} />

            {/* Centered dialog */}
            <div className="ssm-dialog ssm-dialog--wide" role="dialog" aria-modal="true" aria-label="Safety Score">
                {/* Header */}
                <div className="ssm-header">
                    <div className="ssm-header-left">
                        <span className="ssm-header-label">SAFETY SCORE</span>
                        <span className="ssm-header-pair">
                            {baseToken}/{quoteToken}
                            {pairData.protocol && <span className="ssm-header-dex"> · {pairData.protocol}</span>}
                        </span>
                    </div>
                    <button className="ssm-close" onClick={onClose} title="Close">
                        <X size={14} />
                    </button>
                </div>

                {/* Body — wide layout manages its own overflow */}
                <SafetyDetailPanel pairData={pairData} chainName={chainName} metrics={metrics} />
            </div>
        </>
    );
}
