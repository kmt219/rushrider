import { useSafetyScore } from "../hooks/useSafetyScore";
import type { NewPairData, PairMetrics } from "../types";
import { RiskTimeline } from "./RiskTimeline";
import { SignalCard } from "./SignalCard";
import { useEffect, useState } from "react";

interface SafetyDetailPanelProps {
    pairData: NewPairData | null | undefined;
    chainName: string;
    metrics: PairMetrics | null | undefined;
}

function getRiskColor(level: string): string {
    if (level === "LOW") return "var(--accent)";
    if (level === "CAUTION") return "var(--warning)";
    if (level === "HIGH") return "#f97316";
    if (level === "DANGER") return "var(--destructive)";
    return "var(--fg-muted)";
}

function getVerdictHeadline(level: string): string {
    if (level === "LOW") return "LOW RISK — CLEAN";
    if (level === "CAUTION") return "CAUTION";
    if (level === "HIGH") return "HIGH RISK";
    if (level === "DANGER") return "DANGER — AVOID";
    return "SCORING…";
}

function ScoreGauge({ total, level }: { total: number; level: string }) {
    const isLoading = level === "LOADING";
    // During LOADING show muted color; once resolved use risk-level color
    const color = isLoading ? "var(--fg-muted)" : getRiskColor(level);
    const r = 50;
    const cx = 60;
    const cy = 60;
    const circumference = 2 * Math.PI * r;
    const arcLen = (270 / 360) * circumference;
    // During LOADING show partial score arc so the gauge isn't empty
    const fillLen = (total / 100) * arcLen;
    const rotation = -225;

    return (
        <svg width={120} height={120} viewBox="0 0 120 120">
            {/* Track arc */}
            <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="var(--bg-panel)"
                strokeWidth={9}
                strokeDasharray={`${arcLen} ${circumference - arcLen}`}
                strokeDashoffset={0}
                strokeLinecap="round"
                transform={`rotate(${rotation} ${cx} ${cy})`}
            />
            {/* Fill arc — muted + semi-transparent while loading */}
            <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={color}
                strokeWidth={9}
                strokeDasharray={`${fillLen} ${circumference - fillLen}`}
                strokeDashoffset={0}
                strokeLinecap="round"
                transform={`rotate(${rotation} ${cx} ${cy})`}
                style={{ transition: "stroke-dasharray 0.6s ease", opacity: isLoading ? 0.45 : 1 }}
            />
            {/* Center text — show partial total during LOADING so gauge isn't blank */}
            <text
                x={cx}
                y={cy + 6}
                textAnchor="middle"
                fill={color}
                fontSize={isLoading ? 18 : 22}
                fontWeight={800}
                opacity={isLoading ? 0.55 : 1}
            >
                {total}
            </text>
            <text
                x={cx}
                y={cy + 20}
                textAnchor="middle"
                fill="var(--fg-muted)"
                fontSize={10}
                opacity={isLoading ? 0.4 : 1}
            >
                /100
            </text>
        </svg>
    );
}

function AdviceSummary({ signals }: { signals: ReturnType<typeof useSafetyScore>["signals"] }) {
    const entries = Object.entries(signals)
        .filter(([, s]) => !s.loading)
        .sort(([, a], [, b]) => a.score - b.score)
        .slice(0, 2);

    if (entries.length === 0) {
        return (
            <div className="ssm-advice">
                <span className="ssm-advice-label">FOCUS</span>
                Scoring in progress…
            </div>
        );
    }

    return (
        <div className="ssm-advice">
            <span className="ssm-advice-label">FOCUS</span>
            {entries.map(([, s], i) => (
                <span key={s.label}>
                    {i > 0 && <span className="ssm-advice-sep">·</span>}
                    <span className="ssm-advice-signal">{s.label}</span>
                    <span className="ssm-advice-pts"> {s.score}/20</span>
                </span>
            ))}
        </div>
    );
}

export function SafetyDetailPanel({ pairData, chainName, metrics }: SafetyDetailPanelProps) {
    const score = useSafetyScore(pairData, chainName, metrics);
    const pairedAt = pairData ? new Date(pairData.block_signed_at).getTime() : 0;
    const riskColor = getRiskColor(score.riskLevel);

    // Key stats derived from signal raw bags
    const liquidityRaw = score.signals.liquidity.raw;
    const holdersRaw = score.signals.holders.raw;

    const poolSizeDisplay = liquidityRaw?.["POOL SIZE"] ?? "—";
    const holderCount = holdersRaw?.["TOTAL"] ?? "—";

    const ageMin = pairedAt > 0 ? (Date.now() - pairedAt) / 60_000 : 0;
    const ageDisplay = ageMin >= 60 ? `${(ageMin / 60).toFixed(1)}h` : ageMin >= 1 ? `${ageMin.toFixed(0)}m` : "< 1m";

    // Verdict: top 2 risk factors — exclude loading and "Data unavailable" signals
    // so chains without REST support (e.g. Tempo) don't show neutral placeholders
    // as weaknesses.
    const sortedSignals = Object.entries(score.signals)
        .filter(([, s]) => !s.loading && !s.details.includes("Data unavailable"))
        .sort(([, a], [, b]) => a.score - b.score)
        .slice(0, 2);
    const verdictFactors = sortedSignals.map(([, s]) => `${s.label} (${s.score}/20)`).join(" · ");

    const [copied, setCopied] = useState(false);

    function handleCopyReport() {
        const lines = [
            `SAFETY REPORT — ${pairData?.base_token?.contract_ticker_symbol ?? "TOKEN"}/${pairData?.quote_token?.contract_ticker_symbol ?? "QUOTE"}`,
            `Score: ${score.total}/100 — ${score.riskLevel}`,
            "",
            "SIGNALS:",
            ...Object.entries(score.signals).map(([, s]) => {
                const kpis =
                    s.raw && Object.keys(s.raw).length > 0
                        ? ` (${Object.entries(s.raw)
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(", ")})`
                        : "";
                return `  ${s.label}: ${s.score}/20${kpis}`;
            }),
            "",
            "TOP RISK FACTORS:",
            verdictFactors || "—",
            "",
            "TIMELINE:",
            ...score.timeline.map((ev) => {
                const relSec = Math.round(ev.relativeMs / 1000);
                const t =
                    relSec < 60
                        ? `+${relSec}s`
                        : relSec < 3600
                          ? `+${Math.floor(relSec / 60)}m`
                          : `+${(relSec / 3600).toFixed(1)}h`;
                return `  [${t}] ${ev.severity.toUpperCase()} — ${ev.event}`;
            }),
        ];
        void navigator.clipboard
            .writeText(lines.join("\n"))
            .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            })
            .catch(() => {});
    }

    const [showAllTimeline, setShowAllTimeline] = useState(false);
    useEffect(() => setShowAllTimeline(false), [pairData?.pair_address]);
    const displayedTimeline = showAllTimeline ? score.timeline : score.timeline.slice(0, 5);

    return (
        <div className="ssm-wide-body">
            {/* ── Left panel ── */}
            <div className="ssm-left">
                {/* Gauge + badge */}
                <div className="ssm-gauge-wrap">
                    <ScoreGauge total={score.total} level={score.riskLevel} />
                    <div className="ssm-gauge-score" style={{ color: riskColor }}>
                        {score.riskLevel === "LOADING" ? "SCORING…" : `${score.riskLevel} RISK`}
                    </div>
                    {score.riskLevel === "LOADING" && (
                        <div style={{ fontSize: "10px", color: "var(--fg-muted)", opacity: 0.55, marginTop: "2px" }}>
                            partial score
                        </div>
                    )}
                </div>

                {/* Disclaimer */}
                <div className="ssm-disclaimer">
                    <span>ⓘ</span> Informational only — not financial advice
                </div>

                {/* Key stats */}
                <dl className="ssm-key-stats">
                    <div className="ssm-key-stat-row">
                        <dt>PAIR AGE</dt>
                        <dd>{ageDisplay}</dd>
                    </div>
                    <div className="ssm-key-stat-row">
                        <dt>POOL SIZE</dt>
                        <dd>{poolSizeDisplay}</dd>
                    </div>
                    <div className="ssm-key-stat-row">
                        <dt>HOLDERS</dt>
                        <dd>{holderCount}</dd>
                    </div>
                </dl>

                {/* Auto-generated advice */}
                <AdviceSummary signals={score.signals} />

                {/* Risk timeline with show-more */}
                <div className="ssm-timeline-wrap">
                    <RiskTimeline events={displayedTimeline} pairedAt={pairedAt} />
                    {score.timeline.length > 5 && (
                        <button className="ssm-timeline-toggle" onClick={() => setShowAllTimeline((v) => !v)}>
                            {showAllTimeline ? "SHOW LESS" : `+${score.timeline.length - 5} MORE`}
                        </button>
                    )}
                </div>
            </div>

            {/* ── Right grid (3 cols × 2 rows) ── */}
            <div className="ssm-right">
                {/* Row 1 */}
                <SignalCard signal={score.signals.liquidity} />
                <SignalCard signal={score.signals.holders} />
                <SignalCard signal={score.signals.deployer} />

                {/* Row 2 */}
                <SignalCard signal={score.signals.contract} />
                <SignalCard signal={score.signals.trading} />

                {/* Verdict card */}
                <div className="ssm-verdict-card">
                    <div className="ssm-verdict-headline" style={{ color: riskColor }}>
                        {getVerdictHeadline(score.riskLevel)}
                    </div>
                    <div className="ssm-verdict-factors">
                        {verdictFactors
                            ? `Weakest: ${verdictFactors}`
                            : score.riskLevel === "LOADING"
                              ? "Fetching holder & deployer data…"
                              : "All signals clean"}
                    </div>
                    <button className="ssm-verdict-copy" onClick={handleCopyReport}>
                        {copied ? "COPIED!" : "COPY REPORT"}
                    </button>
                </div>
            </div>
        </div>
    );
}
