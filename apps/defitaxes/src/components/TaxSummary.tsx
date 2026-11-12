import type { TaxReport } from "../lib/types";
import { formatUsd } from "../lib/utils";

interface TaxSummaryProps {
    report: TaxReport;
}

export function TaxSummary({ report }: TaxSummaryProps) {
    const netGain = report.totalShortTermGain + report.totalLongTermGain;

    return (
        <div className="tax-summary">
            <div className="summary-cards">
                <div className="summary-card">
                    <div className="summary-card-label">Short-Term Gain/Loss</div>
                    <div className={`summary-card-value ${report.totalShortTermGain >= 0 ? "gain" : "loss"}`}>
                        {formatUsd(report.totalShortTermGain)}
                    </div>
                    <div className="summary-card-count">{report.shortTermEvents.length} events</div>
                </div>
                <div className="summary-card">
                    <div className="summary-card-label">Long-Term Gain/Loss</div>
                    <div className={`summary-card-value ${report.totalLongTermGain >= 0 ? "gain" : "loss"}`}>
                        {formatUsd(report.totalLongTermGain)}
                    </div>
                    <div className="summary-card-count">{report.longTermEvents.length} events</div>
                </div>
                <div className="summary-card">
                    <div className="summary-card-label">Ordinary Income</div>
                    <div className="summary-card-value">{formatUsd(report.totalIncome)}</div>
                    <div className="summary-card-count">{report.income.length} events</div>
                </div>
                <div className="summary-card">
                    <div className="summary-card-label">Gas Fees Paid</div>
                    <div className="summary-card-value loss">{formatUsd(report.totalFees)}</div>
                </div>
            </div>

            <div className="summary-net">
                <span className="summary-net-label">Net Capital Gain/Loss</span>
                <span className={`summary-net-value ${netGain >= 0 ? "gain" : "loss"}`}>{formatUsd(netGain)}</span>
            </div>

            {report.shortTermEvents.length + report.longTermEvents.length > 0 && (
                <div className="form-8949-preview">
                    <div className="form-8949-header">Form 8949 Preview (first 10)</div>
                    <table className="form-8949-table">
                        <thead>
                            <tr>
                                <th>Description</th>
                                <th>Acquired</th>
                                <th>Sold</th>
                                <th>Proceeds</th>
                                <th>Basis</th>
                                <th>Gain/Loss</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[...report.shortTermEvents, ...report.longTermEvents].slice(0, 10).map((e, i) => (
                                <tr key={i}>
                                    <td>{e.description}</td>
                                    <td>{e.dateAcquired.toLocaleDateString()}</td>
                                    <td>{e.dateSold.toLocaleDateString()}</td>
                                    <td>{formatUsd(e.proceeds)}</td>
                                    <td>{formatUsd(e.costBasis)}</td>
                                    <td className={e.gainLoss >= 0 ? "gain" : "loss"}>{formatUsd(e.gainLoss)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
