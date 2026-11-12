import type { AcquisitionLot, IncomeEvent, TaxEvent, TaxReport, Transaction } from "./types";

const MS_PER_DAY = 86400000;
const LONG_TERM_DAYS = 365;

/**
 * FIFO capital gains calculator.
 * Processes classified transactions and produces a tax report.
 */
export function calculateTaxes(transactions: Transaction[], taxYear?: number): TaxReport {
    // Sort chronologically
    const sorted = [...transactions].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // FIFO queues per token (key: "chain:contractAddress")
    const lots = new Map<string, AcquisitionLot[]>();
    const shortTermEvents: TaxEvent[] = [];
    const longTermEvents: TaxEvent[] = [];
    const income: IncomeEvent[] = [];
    let totalFees = 0;

    for (const tx of sorted) {
        // Accumulate gas fees
        totalFees += tx.gasFeesUsd;

        for (const transfer of tx.transfers) {
            const tokenKey = `${tx.chain}:${transfer.token.contractAddress.toLowerCase()}`;

            if (transfer.treatment === "buy" || transfer.treatment === "withdraw") {
                // Acquisition
                const queue = lots.get(tokenKey) ?? [];
                queue.push({
                    date: tx.timestamp,
                    amount: transfer.amount,
                    costBasisPerUnit: transfer.rate,
                    token: transfer.token.symbol,
                    chain: tx.chain,
                    txHash: tx.hash,
                });
                lots.set(tokenKey, queue);
            } else if (transfer.treatment === "sell" || transfer.treatment === "fee") {
                // Disposal — FIFO match
                let remaining = transfer.amount;
                const proceeds = transfer.amount * transfer.rate;
                const queue = lots.get(tokenKey) ?? [];

                // Allocate gas fee proportionally to sells in this tx
                const allocatedFee = transfer.treatment === "fee" ? transfer.amount * transfer.rate : 0;

                while (remaining > 0 && queue.length > 0) {
                    const lot = queue[0]!;
                    const matched = Math.min(remaining, lot.amount);
                    const costBasis = matched * lot.costBasisPerUnit;
                    const matchedProceeds = (matched / transfer.amount) * proceeds;

                    const holdingDays = (tx.timestamp.getTime() - lot.date.getTime()) / MS_PER_DAY;
                    const holdingPeriod = holdingDays > LONG_TERM_DAYS ? "long-term" : "short-term";

                    const event: TaxEvent = {
                        description: `${transfer.token.symbol} (${tx.chain})`,
                        token: transfer.token.symbol,
                        amount: matched,
                        dateAcquired: lot.date,
                        dateSold: tx.timestamp,
                        proceeds: matchedProceeds - allocatedFee * (matched / transfer.amount),
                        costBasis,
                        gainLoss: matchedProceeds - allocatedFee * (matched / transfer.amount) - costBasis,
                        holdingPeriod,
                        chain: tx.chain,
                        txHash: tx.hash,
                    };

                    // Filter by tax year if specified
                    if (!taxYear || tx.timestamp.getFullYear() === taxYear) {
                        if (holdingPeriod === "short-term") {
                            shortTermEvents.push(event);
                        } else {
                            longTermEvents.push(event);
                        }
                    }

                    lot.amount -= matched;
                    remaining -= matched;

                    if (lot.amount <= 0.000000001) {
                        queue.shift();
                    }
                }

                // If no lots to match against, this is a disposal with unknown basis
                if (remaining > 0.000000001) {
                    const unknownEvent: TaxEvent = {
                        description: `${transfer.token.symbol} (${tx.chain}) [unknown basis]`,
                        token: transfer.token.symbol,
                        amount: remaining,
                        dateAcquired: tx.timestamp, // same date = unknown
                        dateSold: tx.timestamp,
                        proceeds: (remaining / transfer.amount) * proceeds,
                        costBasis: 0,
                        gainLoss: (remaining / transfer.amount) * proceeds,
                        holdingPeriod: "short-term",
                        chain: tx.chain,
                        txHash: tx.hash,
                    };
                    if (!taxYear || tx.timestamp.getFullYear() === taxYear) {
                        shortTermEvents.push(unknownEvent);
                    }
                }
            } else if (transfer.treatment === "income") {
                // Income event + acquisition at FMV
                const fmv = transfer.amount * transfer.rate;
                if (!taxYear || tx.timestamp.getFullYear() === taxYear) {
                    income.push({
                        date: tx.timestamp,
                        description: `${transfer.token.symbol} income (${tx.chain})`,
                        token: transfer.token.symbol,
                        amount: transfer.amount,
                        fairMarketValueUsd: fmv,
                        chain: tx.chain,
                        txHash: tx.hash,
                    });
                }

                // Also add as acquisition for future disposals
                const queue = lots.get(tokenKey) ?? [];
                queue.push({
                    date: tx.timestamp,
                    amount: transfer.amount,
                    costBasisPerUnit: transfer.rate,
                    token: transfer.token.symbol,
                    chain: tx.chain,
                    txHash: tx.hash,
                });
                lots.set(tokenKey, queue);
            }
            // deposit, withdraw, ignore → no tax event
        }
    }

    return {
        shortTermEvents,
        longTermEvents,
        income,
        totalShortTermGain: shortTermEvents.reduce((sum, e) => sum + e.gainLoss, 0),
        totalLongTermGain: longTermEvents.reduce((sum, e) => sum + e.gainLoss, 0),
        totalIncome: income.reduce((sum, e) => sum + e.fairMarketValueUsd, 0),
        totalFees,
    };
}
