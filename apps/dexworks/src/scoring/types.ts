export interface SignalResult {
    score: number; // 0–20
    loading: boolean;
    label: string;
    details: string[];
    raw?: Record<string, string | number>;
}

export const LOADING_SIGNAL: SignalResult = {
    score: 0,
    loading: true,
    label: "",
    details: [],
};

export interface SafetyScore {
    pairAddress: string;
    total: number; // 0–100
    signals: {
        liquidity: SignalResult;
        holders: SignalResult;
        deployer: SignalResult;
        contract: SignalResult;
        trading: SignalResult;
    };
    riskLevel: "LOW" | "CAUTION" | "HIGH" | "DANGER" | "LOADING";
    timeline: RiskEvent[];
    lastUpdated: number;
}

export interface RiskEvent {
    timestamp: number;
    relativeMs: number; // ms since pair creation
    event: string;
    severity: "info" | "warning" | "danger" | "ok";
}

export function getRiskLevel(total: number, loading: boolean): SafetyScore["riskLevel"] {
    if (loading) return "LOADING";
    if (total >= 80) return "LOW";
    if (total >= 50) return "CAUTION";
    if (total >= 20) return "HIGH";
    return "DANGER";
}

export function computeTotal(signals: SafetyScore["signals"]): number {
    return (
        signals.liquidity.score +
        signals.holders.score +
        signals.deployer.score +
        signals.contract.score +
        signals.trading.score
    );
}
