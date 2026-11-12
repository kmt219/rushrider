import { calculateTaxes } from "../lib/taxCalc";
import type { Transaction, TaxReport } from "../lib/types";
import { useState, useMemo, useCallback } from "react";

export function useTaxYear(transactions: Transaction[]) {
    const currentYear = new Date().getFullYear();
    const [taxYear, setTaxYear] = useState<number | null>(null);

    /** Available tax years based on transaction data */
    const availableYears = useMemo(() => {
        const years = new Set<number>();
        for (const tx of transactions) {
            years.add(tx.timestamp.getFullYear());
        }
        return Array.from(years).sort((a, b) => b - a);
    }, [transactions]);

    /** Filtered transactions */
    const filteredTransactions = useMemo(() => {
        if (taxYear === null) return transactions;
        return transactions.filter((tx) => tx.timestamp.getFullYear() === taxYear);
    }, [transactions, taxYear]);

    /** Tax report for selected year */
    const report = useMemo((): TaxReport | null => {
        if (transactions.length === 0) return null;
        return calculateTaxes(transactions, taxYear ?? undefined);
    }, [transactions, taxYear]);

    const selectYear = useCallback((year: number | null) => {
        setTaxYear(year);
    }, []);

    return {
        taxYear,
        availableYears,
        currentYear,
        filteredTransactions,
        report,
        selectYear,
    };
}
