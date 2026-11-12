/** Treatment assigned to each transfer within a transaction */
export type Treatment = "buy" | "sell" | "fee" | "deposit" | "withdraw" | "income" | "ignore";

/** Transaction categories */
export type Category =
    | "FEE"
    | "SWAP"
    | "ADD_LIQUIDITY"
    | "REMOVE_LIQUIDITY"
    | "STAKE"
    | "UNSTAKE"
    | "DEPOSIT"
    | "WITHDRAW"
    | "BRIDGE_OUT"
    | "BRIDGE_IN"
    | "WRAP"
    | "UNWRAP"
    | "BORROW"
    | "REPAY"
    | "AIRDROP"
    | "INCOME"
    | "COMPOUND"
    | "SELF"
    | "SPAM"
    | "ERROR"
    | "TRANSFER_OUT"
    | "TRANSFER_IN"
    | "UNKNOWN";

/** Token identity */
export interface Token {
    contractAddress: string;
    symbol: string;
    decimals: number;
    name: string;
}

/** A single value transfer within a transaction */
export interface Transfer {
    from: string;
    to: string;
    amount: number;
    token: Token;
    /** USD rate at time of transfer */
    rate: number;
    treatment: Treatment;
    /** Bucket classification */
    bucket: "SENT" | "RECEIVED" | "SELF" | "BURNED" | "MINTED";
}

/** Classified transaction */
export interface Transaction {
    hash: string;
    timestamp: Date;
    chain: string;
    chainDisplayName: string;
    blockHeight: number;
    transfers: Transfer[];
    category: Category;
    counterparty: string;
    counterpartyLabel: string | null;
    gasFeeNative: number;
    gasFeesUsd: number;
    successful: boolean;
    rawMethodId: string;
}

/** A single tax event (disposal or acquisition) */
export interface TaxEvent {
    description: string;
    token: string;
    amount: number;
    dateAcquired: Date;
    dateSold: Date;
    proceeds: number;
    costBasis: number;
    gainLoss: number;
    holdingPeriod: "short-term" | "long-term";
    chain: string;
    txHash: string;
}

/** Income event */
export interface IncomeEvent {
    date: Date;
    description: string;
    token: string;
    amount: number;
    fairMarketValueUsd: number;
    chain: string;
    txHash: string;
}

/** Full tax report */
export interface TaxReport {
    shortTermEvents: TaxEvent[];
    longTermEvents: TaxEvent[];
    income: IncomeEvent[];
    totalShortTermGain: number;
    totalLongTermGain: number;
    totalIncome: number;
    totalFees: number;
}

/** Processing pipeline state */
export type ProcessingStep = "idle" | "discovering" | "fetching" | "pricing" | "classifying" | "calculating" | "done";

export interface ProcessingState {
    step: ProcessingStep;
    progress: string;
    chainsFound: number;
    txFetched: number;
    txTotal: number;
    errors: string[];
}

/** Price cache entry */
export interface PricePoint {
    date: string; // YYYY-MM-DD
    price: number;
}

/** FIFO acquisition lot */
export interface AcquisitionLot {
    date: Date;
    amount: number;
    costBasisPerUnit: number;
    token: string;
    chain: string;
    txHash: string;
}
