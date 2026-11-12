import { CATEGORY_INFO } from "../lib/categories";
import type { Transaction } from "../lib/types";
import { formatAmount, formatDate, formatUsd, shortenAddress } from "../lib/utils";

interface TransactionTableProps {
    transactions: Transaction[];
}

export function TransactionTable({ transactions }: TransactionTableProps) {
    if (transactions.length === 0) {
        return <div className="panel-empty">No transactions to display</div>;
    }

    return (
        <div className="tx-table-wrap">
            <table className="tx-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Chain</th>
                        <th>Type</th>
                        <th>Out</th>
                        <th>In</th>
                        <th>Fee</th>
                        <th>Counterparty</th>
                    </tr>
                </thead>
                <tbody>
                    {transactions.map((tx) => {
                        const catInfo = CATEGORY_INFO[tx.category];
                        const sent = tx.transfers.filter((t) => t.bucket === "SENT" || t.bucket === "BURNED");
                        const received = tx.transfers.filter((t) => t.bucket === "RECEIVED" || t.bucket === "MINTED");

                        return (
                            <tr key={`${tx.hash}-${tx.chain}`} className={tx.successful ? "" : "tx-row--failed"}>
                                <td className="tx-date">{formatDate(tx.timestamp)}</td>
                                <td className="tx-chain">{tx.chainDisplayName}</td>
                                <td>
                                    <span
                                        className="category-badge"
                                        style={{ borderColor: catInfo?.color, color: catInfo?.color }}
                                    >
                                        {catInfo?.label ?? tx.category}
                                    </span>
                                </td>
                                <td className="tx-amount tx-amount--out">
                                    {sent.map((t, i) => (
                                        <div key={i}>
                                            {formatAmount(t.amount)} {t.token.symbol}
                                        </div>
                                    ))}
                                </td>
                                <td className="tx-amount tx-amount--in">
                                    {received.map((t, i) => (
                                        <div key={i}>
                                            {formatAmount(t.amount)} {t.token.symbol}
                                        </div>
                                    ))}
                                </td>
                                <td className="tx-fee">{formatUsd(tx.gasFeesUsd)}</td>
                                <td className="tx-counterparty">
                                    {tx.counterpartyLabel ?? shortenAddress(tx.counterparty)}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
