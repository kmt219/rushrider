import { useCascadeData } from "../hooks/useCascadeData";
import type { HIP3Market } from "../types";
import { formatUSD } from "../utils/format";
import { computeCascadeRisk, getLiqRiskColor } from "../utils/liquidation";

interface LiquidationTableProps {
    markets: HIP3Market[];
    selectedCoin: string | null;
    onSelectMarket: (coin: string) => void;
}

function LiqTableRow({ market, selected, onSelect }: { market: HIP3Market; selected: boolean; onSelect: () => void }) {
    const { active: activeCascade, history: cascadeHistory } = useCascadeData(market.coin);
    const cascadeRisk = computeCascadeRisk(
        market.liqCount24h,
        Math.round(market.backstopLiqRate * market.liqCount24h),
        activeCascade,
        cascadeHistory,
        market.oiUtilization
    );
    const riskColor = getLiqRiskColor(cascadeRisk.label);
    const backstopCount = Math.round(market.backstopLiqRate * market.liqCount24h);

    return (
        <tr className={selected ? "selected" : ""} onClick={onSelect}>
            <td>
                <span className="market-coin">{market.coin}</span>
                <span className="val-dim"> · {market.builder}</span>
            </td>
            <td className="val-mono">{market.markPx.toFixed(2)}</td>
            <td>
                <span className="liq-risk-badge" style={{ color: riskColor, borderColor: riskColor }}>
                    {cascadeRisk.score} {cascadeRisk.label}
                </span>
            </td>
            <td className={market.liqCount24h > 10 ? "val-warning" : ""}>{market.liqCount24h}</td>
            <td>{formatUSD(market.liquidationVolume24h)}</td>
            <td className={backstopCount > 0 ? "val-backstop" : "val-dim"}>
                {backstopCount > 0 ? backstopCount : "—"}
            </td>
            <td>
                {activeCascade !== null && activeCascade.isActive ? (
                    <span className="cascade-active-indicator">⚡ ACTIVE</span>
                ) : cascadeRisk.score >= 50 ? (
                    <span className="val-warning">recent</span>
                ) : (
                    <span className="val-dim">—</span>
                )}
            </td>
        </tr>
    );
}

export function LiquidationTable({ markets, selectedCoin, onSelectMarket }: LiquidationTableProps) {
    const sorted = [...markets].sort((a, b) => b.liqCount24h - a.liqCount24h);

    return (
        <div className="liq-table-wrap">
            <table className="liq-table">
                <thead>
                    <tr>
                        <th>Market</th>
                        <th>Price</th>
                        <th>Risk</th>
                        <th>Liq 24h</th>
                        <th>Liq Vol 24h</th>
                        <th>Backstop</th>
                        <th>Active Cascade</th>
                    </tr>
                </thead>
                <tbody>
                    {sorted.map((market) => (
                        <LiqTableRow
                            key={market.coin}
                            market={market}
                            selected={selectedCoin === market.coin}
                            onSelect={() => onSelectMarket(market.coin)}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    );
}
