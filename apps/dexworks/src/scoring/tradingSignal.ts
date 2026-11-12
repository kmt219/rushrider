import type { PairMetrics } from "../types";
import type { SignalResult } from "./types";

export function computeTradingSignal(metrics: PairMetrics | null | undefined): SignalResult {
    if (!metrics || metrics.txTimestamps.length < 3) {
        return {
            score: 10, // neutral when insufficient data
            loading: false,
            label: "TRADING",
            details: ["Insufficient trading data"],
            raw: { SWAPS: 0, "BUY RATIO": "N/A", "SPIKE SCORE": 0, "PRICE SWING": "N/A" },
        };
    }

    const details: string[] = [];
    let score = 0;

    const ticks = metrics.priceHistory;

    // Buy/sell balance (max 6 pts)
    // Prefer stream swap counts from updatePairs last_1hr — exact counts from GoldRush.
    // Fall back to price-tick direction when stream data isn't available yet.
    if (metrics.buys1h != null && metrics.sells1h != null) {
        const totalSwaps = metrics.buys1h + metrics.sells1h;
        if (totalSwaps > 0) {
            const buyRatio = metrics.buys1h / totalSwaps;
            if (buyRatio >= 0.4 && buyRatio <= 0.6) {
                score += 6;
                details.push(`Balanced: ${metrics.buys1h}B / ${metrics.sells1h}S in 1h`);
            } else if (buyRatio > 0.1 && buyRatio < 0.9) {
                score += 3;
                details.push(`${(buyRatio * 100).toFixed(0)}% buys (${totalSwaps} swaps 1h)`);
            } else {
                details.push(`${(buyRatio * 100).toFixed(0)}% buys — one-sided (${totalSwaps} swaps 1h)`);
            }
        } else {
            score += 3;
            details.push("No swaps recorded in 1h");
        }
    } else {
        // Fallback: infer direction from price tick movement
        let ups = 0;
        let downs = 0;
        for (let i = 1; i < ticks.length; i++) {
            const prev = ticks[i - 1]!.price;
            const cur = ticks[i]!.price;
            if (cur > prev) ups++;
            else if (cur < prev) downs++;
        }
        const total = ups + downs;
        if (total > 0) {
            const buyRatio = ups / total;
            if (buyRatio >= 0.4 && buyRatio <= 0.6) {
                score += 6;
                details.push(`Balanced trading: ${(buyRatio * 100).toFixed(0)}% buys`);
            } else if (buyRatio < 0.9 && buyRatio > 0.1) {
                score += 3;
                details.push(`${(buyRatio * 100).toFixed(0)}% buys`);
            } else {
                details.push(`${(buyRatio * 100).toFixed(0)}% buys — one-sided`);
            }
        } else {
            score += 3;
            details.push("Price flat — no directional movement");
        }
    }

    // Unique makers in first hour (max 4 pts)
    const makers = metrics.makersSet?.size ?? 0;
    if (makers >= 10) {
        score += 4;
        details.push(`${makers} unique traders`);
    } else if (makers >= 5) {
        score += 2;
        details.push(`${makers} unique traders`);
    } else if (makers >= 1) {
        score += 1;
        details.push(`${makers} unique trader${makers !== 1 ? "s" : ""} — thin`);
    } else {
        details.push("No unique traders tracked yet");
    }

    // Price swing detection — pump & dump risk (max 5 pts)
    // Uses the last 300 ticks (~10 min at 2s cadence from updatePairs stream)
    if (ticks.length >= 2) {
        const recentTicks = ticks.slice(-Math.min(ticks.length, 300));
        if (recentTicks.length >= 2) {
            const prices = recentTicks.map((t) => t.price).filter((p) => p > 0);
            const minP = Math.min(...prices);
            const maxP = Math.max(...prices);
            if (minP > 0) {
                const swing = (maxP - minP) / minP;
                if (swing < 0.5) {
                    score += 5;
                    details.push(`Price swing: ${(swing * 100).toFixed(0)}% (stable)`);
                } else {
                    details.push(`Price swing: ${(swing * 100).toFixed(0)}% — pump & dump risk`);
                }
            } else {
                score += 5;
            }
        } else {
            score += 5;
        }
    } else {
        score += 5;
    }

    // Transaction velocity in last hour (max 4 pts)
    const cutoff1h = Date.now() - 3_600_000;
    const recentTxCount = metrics.txTimestamps.filter((ts) => ts > cutoff1h).length;
    if (recentTxCount > 10) {
        score += 4;
        details.push(`${recentTxCount} txs in 1h`);
    } else if (recentTxCount >= 3) {
        score += 2;
        details.push(`${recentTxCount} txs in 1h`);
    } else {
        score += 1;
        details.push(`${recentTxCount} tx${recentTxCount !== 1 ? "s" : ""} in 1h — quiet`);
    }

    // Wallet volume concentration — no single wallet >30% of txs (max 1 pt)
    // Uses tx count as a proxy for volume (individual swap sizes not available in stream)
    if (metrics.makersTxCount && metrics.makersTxCount.size > 0) {
        const totalTxs = [...metrics.makersTxCount.values()].reduce((a, b) => a + b, 0);
        const maxWalletTxs = Math.max(...metrics.makersTxCount.values());
        const maxPct = totalTxs > 0 ? maxWalletTxs / totalTxs : 0;
        if (maxPct < 0.2) {
            score += 1;
            details.push(`No wallet dominates tx flow (max ${(maxPct * 100).toFixed(0)}%)`);
        } else if (maxPct >= 0.3) {
            details.push(`Single wallet: ${(maxPct * 100).toFixed(0)}% of txs — wash-trade risk`);
        }
    }

    // Anomalous spike penalty (from recentSpikeScore z-score)
    if (metrics.recentSpikeScore > 3) {
        score = Math.max(0, score - 3);
        details.push(`Anomalous tx spike (z=${metrics.recentSpikeScore.toFixed(1)})`);
    }

    // Build raw KPI bag
    const cutoff1hRaw = Date.now() - 3_600_000;
    const swapCount = metrics.txTimestamps.filter((ts) => ts > cutoff1hRaw).length;

    let buyRatioPct = "N/A";
    if (metrics.buys1h != null && metrics.sells1h != null) {
        const totalSwaps = metrics.buys1h + metrics.sells1h;
        if (totalSwaps > 0) {
            buyRatioPct = `${((metrics.buys1h / totalSwaps) * 100).toFixed(0)}%`;
        }
    } else {
        const tickArr = metrics.priceHistory;
        let ups = 0;
        let downs = 0;
        for (let i = 1; i < tickArr.length; i++) {
            const prev = tickArr[i - 1]!.price;
            const cur = tickArr[i]!.price;
            if (cur > prev) ups++;
            else if (cur < prev) downs++;
        }
        const total = ups + downs;
        if (total > 0) {
            buyRatioPct = `${((ups / total) * 100).toFixed(0)}%`;
        }
    }

    let priceSwing = "N/A";
    const ticksForSwing = metrics.priceHistory.slice(-Math.min(metrics.priceHistory.length, 300));
    if (ticksForSwing.length >= 2) {
        const prices = ticksForSwing.map((t) => t.price).filter((p) => p > 0);
        if (prices.length >= 2) {
            const minP = Math.min(...prices);
            const maxP = Math.max(...prices);
            if (minP > 0) {
                priceSwing = `${(((maxP - minP) / minP) * 100).toFixed(0)}%`;
            }
        }
    }

    const raw: Record<string, string | number> = {
        SWAPS: swapCount,
        "BUY RATIO": buyRatioPct,
        "SPIKE SCORE": metrics.recentSpikeScore.toFixed(1),
        "PRICE SWING": priceSwing,
    };

    return { score: Math.min(20, score), loading: false, label: "TRADING", details, raw };
}
