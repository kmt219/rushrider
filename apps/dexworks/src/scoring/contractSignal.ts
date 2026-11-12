import type { SignalResult } from "./types";

export interface ContractAnalysis {
    ownershipRenounced: boolean | null; // null = unknown / unverifiable
    hasMintEvents: boolean; // post-launch mints detected
    hasSellTxs: boolean; // at least one sell-side transfer exists
    totalTxCount: number; // total transfer events (used for honeypot threshold)
    isSpam: boolean | null;
    isVerified: boolean | null;
}

export function computeContractSignal(analysis: ContractAnalysis): SignalResult {
    const details: string[] = [];

    // Early exit for spam tokens
    if (analysis.isSpam === true) {
        return {
            score: 0,
            loading: false,
            label: "CONTRACT",
            details: ["SPAM TOKEN — flagged by GoldRush"],
            raw: {},
        };
    }

    let score = 0;

    // Ownership renounced (max 8 pts)
    if (analysis.ownershipRenounced === true) {
        score += 8;
        details.push("Ownership renounced");
    } else if (analysis.ownershipRenounced === null) {
        score += 4; // neutral — can't verify on this chain
        details.push("Ownership status unknown");
    } else {
        details.push("Ownership NOT renounced");
    }

    // Post-launch mints (max 6 pts)
    if (!analysis.hasMintEvents) {
        score += 6;
        details.push("No post-launch mints");
    } else {
        details.push("Post-launch mint events detected");
    }

    // Honeypot detection via sell-transaction presence (max 6 pts)
    if (analysis.hasSellTxs) {
        score += 6;
        details.push("Sell transactions confirmed");
    } else if (analysis.totalTxCount < 5) {
        score += 3; // too early to judge — benefit of the doubt
        details.push("No sells yet (too early to assess)");
    } else if (analysis.totalTxCount < 20) {
        score += 1; // suspicious: buying activity with zero sells
        details.push(`${analysis.totalTxCount} txs — no sells yet (suspicious)`);
    } else {
        details.push(`${analysis.totalTxCount} txs — 0 sells (likely honeypot)`);
    }

    // Verified contract bonus/penalty
    if (analysis.isVerified === true) {
        score = Math.min(20, score + 2);
        details.push("Contract source verified");
    } else if (analysis.isVerified === false) {
        score = Math.max(0, score - 2);
        details.push("Contract source unverified");
    }

    const mintEventCount = analysis.hasMintEvents ? ">1" : "NONE";

    const raw: Record<string, string | number> = {
        OWNERSHIP: analysis.ownershipRenounced ? "RENOUNCED" : "NOT RENOUNCED",
        "MINT EVENTS": mintEventCount,
        VERIFIED: analysis.isVerified === true ? "YES" : analysis.isVerified === false ? "NO" : "UNKNOWN",
        SPAM: "CLEAN", // spam tokens exit early above, always CLEAN here
        EVENTS: analysis.totalTxCount,
    };

    return { score: Math.min(20, score), loading: false, label: "CONTRACT", details, raw };
}
