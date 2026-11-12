import { exportForm8949, exportScheduleD, exportTurboTax, exportTransactions } from "../lib/exporters";
import type { TaxReport, Transaction } from "../lib/types";
import { Download } from "lucide-react";

interface ExportPanelProps {
    report: TaxReport;
    transactions: Transaction[];
}

export function ExportPanel({ report, transactions }: ExportPanelProps) {
    const hasEvents = report.shortTermEvents.length + report.longTermEvents.length > 0;

    return (
        <div className="export-panel">
            <div className="export-panel-title">Export Reports</div>
            <div className="export-buttons">
                <button className="btn btn--export" onClick={() => exportForm8949(report)} disabled={!hasEvents}>
                    <Download size={14} />
                    Form 8949 CSV
                </button>
                <button className="btn btn--export" onClick={() => exportScheduleD(report)} disabled={!hasEvents}>
                    <Download size={14} />
                    Schedule D Summary
                </button>
                <button className="btn btn--export" onClick={() => exportTurboTax(report)} disabled={!hasEvents}>
                    <Download size={14} />
                    TurboTax CSV
                </button>
                <button
                    className="btn btn--export"
                    onClick={() => exportTransactions(transactions)}
                    disabled={transactions.length === 0}
                >
                    <Download size={14} />
                    All Transactions
                </button>
            </div>
        </div>
    );
}
