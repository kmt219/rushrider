import type { SignalResult } from "./types";

export interface DeployerProfile {
    walletAgeDays: number;
    tokenCount: number; // prior tokens deployed (excluding this one)
    portfolioSize: number; // distinct tokens held
    rugPatterns: number; // count of rug-like events detected
    deploysLast30d: number;
    failedTxCount: number;
}

export function computeDeployerSignal(profile: DeployerProfile): SignalResult {
    const details: string[] = [];
    let score = 0;

    const { walletAgeDays, deploysLast30d, failedTxCount } = profile;

    // Wallet age (max 5 pts)
    if (walletAgeDays >= 90) {
        score += 5;
        details.push(`Wallet age: ${Math.floor(walletAgeDays / 30)}mo`);
    } else if (walletAgeDays >= 30) {
        score += 3;
        details.push(`Wallet age: ${walletAgeDays}d`);
    } else if (walletAgeDays >= 7) {
        score += 1;
        details.push(`Wallet age: ${walletAgeDays}d — recent`);
    } else {
        details.push(`Wallet age: ${walletAgeDays}d — very new`);
    }

    // Prior token deployments (max 5 pts)
    if (profile.tokenCount === 0) {
        score += 5;
        details.push("First token deployed");
    } else if (profile.tokenCount <= 2) {
        score += 3;
        details.push(`${profile.tokenCount} prior token(s)`);
    } else if (profile.tokenCount <= 10) {
        score += 3;
        details.push(`${profile.tokenCount} prior tokens deployed`);
    } else {
        details.push(`${profile.tokenCount} prior tokens — serial deployer`);
    }

    // Portfolio diversity (max 4 pts)
    if (profile.portfolioSize >= 5) {
        score += 4;
        details.push(`Diversified portfolio: ${profile.portfolioSize} tokens`);
    } else if (profile.portfolioSize >= 2) {
        score += 2;
        details.push(`Small portfolio: ${profile.portfolioSize} tokens`);
    } else {
        details.push("Wallet holds little besides gas");
    }

    // Rug history (max 6 pts)
    if (profile.rugPatterns === 0) {
        score += 6;
        details.push("No prior rug patterns detected");
    } else if (profile.rugPatterns === 1) {
        score += 2;
        details.push("1 prior rug-like pattern");
    } else {
        details.push(`${profile.rugPatterns} prior rug patterns`);
    }

    // Serial deployer penalty: -3 pts if deploysLast30d >= 3
    if (deploysLast30d >= 3) {
        score = Math.max(0, score - 3);
        details.push(`${deploysLast30d} deploys in last 30d — serial deployer flag`);
    }

    // Failed transactions note
    if (failedTxCount > 0) {
        details.push(`${failedTxCount} failed txs detected`);
    }

    const raw: Record<string, string | number> = {
        "WALLET AGE": `${walletAgeDays}d`,
        "PRIOR TOKENS": profile.tokenCount,
        "DEPLOYS/30D": deploysLast30d,
        "FAILED TXS": failedTxCount,
    };

    return { score: Math.min(20, score), loading: false, label: "DEPLOYER", details, raw };
}
