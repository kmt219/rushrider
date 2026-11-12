import { AddressInput } from "./components/AddressInput";
import { ExportPanel } from "./components/ExportPanel";
import { ProcessingStatus } from "./components/ProcessingStatus";
import { TaxSummary } from "./components/TaxSummary";
import { TransactionTable } from "./components/TransactionTable";
import { useGoldRush } from "./hooks/useGoldRush";
import { useProcessing } from "./hooks/useProcessing";
import { useTaxYear } from "./hooks/useTaxYear";

export default function App() {
    const client = useGoldRush();
    const { state, transactions, start, reset } = useProcessing(client);
    const { taxYear, availableYears, filteredTransactions, report, selectYear } = useTaxYear(transactions);

    return (
        <div className="app">
            <header className="header">
                <div className="header-left">
                    <span className="header-title">DeFi Taxes</span>
                    <span className="header-badge">Agent Wallet Tax Reports</span>
                </div>
                {availableYears.length > 0 && (
                    <div className="year-selector">
                        <button
                            className={`year-btn ${taxYear === null ? "year-btn--active" : ""}`}
                            onClick={() => selectYear(null)}
                        >
                            All Years
                        </button>
                        {availableYears.map((y) => (
                            <button
                                key={y}
                                className={`year-btn ${taxYear === y ? "year-btn--active" : ""}`}
                                onClick={() => selectYear(y)}
                            >
                                {y}
                            </button>
                        ))}
                    </div>
                )}
            </header>

            <main className="main">
                <div className="disclaimer-banner">
                    <strong>Not tax advice.</strong> DeFi Taxes is a software tool for informational purposes only. It
                    does not constitute tax, legal, or financial advice. Tax laws vary by jurisdiction and change
                    frequently. Always consult a qualified tax professional before filing. The creators of this tool are
                    not liable for errors, omissions, or reliance on this output.
                </div>

                <AddressInput onSubmit={start} onReset={reset} step={state.step} />
                <ProcessingStatus state={state} />

                {state.step === "done" && report && (
                    <>
                        <TaxSummary report={report} />
                        <ExportPanel report={report} transactions={filteredTransactions} />
                        <div className="section">
                            <div className="section-header">Transactions ({filteredTransactions.length})</div>
                            <TransactionTable transactions={filteredTransactions} />
                        </div>
                    </>
                )}
            </main>

            <footer className="footer-disclaimer">
                DeFi Taxes is not a tax advisor. Results are estimates based on on-chain data and may be incomplete.
                Consult a qualified tax professional. US-only export formats (Form 8949, Schedule D, TurboTax).
            </footer>
        </div>
    );
}
