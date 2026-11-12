import { CATEGORY_INFO } from "./categories";
import type { TaxReport, Transaction } from "./types";
import { formatAmount, formatDateIrs, formatUsd, toCsv, downloadFile } from "./utils";

/** Export Form 8949 CSV (IRS format) */
export function exportForm8949(report: TaxReport, filename = "form-8949.csv"): void {
    const headers = [
        "Description of Property",
        "Date Acquired",
        "Date Sold",
        "Proceeds",
        "Cost or Other Basis",
        "Gain or (Loss)",
    ];

    const allEvents = [...report.shortTermEvents, ...report.longTermEvents];
    const rows = allEvents.map((e) => [
        e.description,
        formatDateIrs(e.dateAcquired),
        formatDateIrs(e.dateSold),
        e.proceeds.toFixed(2),
        e.costBasis.toFixed(2),
        e.gainLoss.toFixed(2),
    ]);

    downloadFile(toCsv(headers, rows), filename);
}

/** Export Schedule D summary as text */
export function exportScheduleD(report: TaxReport, filename = "schedule-d-summary.txt"): void {
    const lines = [
        "SCHEDULE D — Capital Gains and Losses Summary",
        "=".repeat(50),
        "",
        "Part I — Short-Term Capital Gains and Losses",
        `  Total Short-Term Proceeds: ${formatUsd(report.shortTermEvents.reduce((s, e) => s + e.proceeds, 0))}`,
        `  Total Short-Term Basis:    ${formatUsd(report.shortTermEvents.reduce((s, e) => s + e.costBasis, 0))}`,
        `  Net Short-Term Gain/Loss:  ${formatUsd(report.totalShortTermGain)}`,
        `  Number of Transactions:    ${report.shortTermEvents.length}`,
        "",
        "Part II — Long-Term Capital Gains and Losses",
        `  Total Long-Term Proceeds:  ${formatUsd(report.longTermEvents.reduce((s, e) => s + e.proceeds, 0))}`,
        `  Total Long-Term Basis:     ${formatUsd(report.longTermEvents.reduce((s, e) => s + e.costBasis, 0))}`,
        `  Net Long-Term Gain/Loss:   ${formatUsd(report.totalLongTermGain)}`,
        `  Number of Transactions:    ${report.longTermEvents.length}`,
        "",
        "Summary",
        `  Net Capital Gain/Loss:     ${formatUsd(report.totalShortTermGain + report.totalLongTermGain)}`,
        `  Total Ordinary Income:     ${formatUsd(report.totalIncome)}`,
        `  Total Gas Fees Paid:       ${formatUsd(report.totalFees)}`,
    ];

    downloadFile(lines.join("\n"), filename, "text/plain");
}

/** Export TurboTax-compatible CSV */
export function exportTurboTax(report: TaxReport, filename = "turbotax-import.csv"): void {
    const headers = ["Currency Name", "Purchase Date", "Cost Basis", "Date Sold", "Proceeds"];

    const allEvents = [...report.shortTermEvents, ...report.longTermEvents];

    // TurboTax has a 3999-row limit per file
    const BATCH_SIZE = 3999;
    if (allEvents.length <= BATCH_SIZE) {
        const rows = allEvents.map((e) => [
            e.token,
            formatDateIrs(e.dateAcquired),
            e.costBasis.toFixed(2),
            formatDateIrs(e.dateSold),
            e.proceeds.toFixed(2),
        ]);
        downloadFile(toCsv(headers, rows), filename);
    } else {
        // Multiple files — just do the first batch for now
        for (let i = 0; i < allEvents.length; i += BATCH_SIZE) {
            const batch = allEvents.slice(i, i + BATCH_SIZE);
            const rows = batch.map((e) => [
                e.token,
                formatDateIrs(e.dateAcquired),
                e.costBasis.toFixed(2),
                formatDateIrs(e.dateSold),
                e.proceeds.toFixed(2),
            ]);
            const part = Math.floor(i / BATCH_SIZE) + 1;
            downloadFile(toCsv(headers, rows), filename.replace(".csv", `-part${part}.csv`));
        }
    }
}

/** Export full classified transaction list */
export function exportTransactions(transactions: Transaction[], filename = "transactions.csv"): void {
    const headers = ["Date", "Chain", "Tx Hash", "Category", "Counterparty", "Gas Fee (USD)", "Transfers"];

    const rows = transactions.map((tx) => {
        const transferStr = tx.transfers
            .map((t) => `${t.bucket}: ${formatAmount(t.amount)} ${t.token.symbol} (${t.treatment})`)
            .join("; ");

        return [
            tx.timestamp.toISOString(),
            tx.chain,
            tx.hash,
            CATEGORY_INFO[tx.category]?.label ?? tx.category,
            tx.counterpartyLabel ?? tx.counterparty,
            tx.gasFeesUsd.toFixed(2),
            transferStr,
        ];
    });

    downloadFile(toCsv(headers, rows), filename);
}
