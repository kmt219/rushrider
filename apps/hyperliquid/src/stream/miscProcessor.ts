import type { RawMiscEventsByBlock, FundingSnapshot } from "../types";
import { nodeStore } from "./stateStore";

export function processMisc(msg: RawMiscEventsByBlock): void {
    const blockTs = new Date(msg.block_time).getTime() || Date.now();

    // ── Funding events ─────────────────────────────────────────
    for (const ev of msg.funding) {
        const coin = ev.coin;
        const s = nodeStore.getOrCreate(coin);

        const rate = parseFloat(ev.funding_rate);
        if (!isFinite(rate)) continue;

        s.latestFundingRate = rate;

        const snapshot: FundingSnapshot = {
            time: msg.block_time,
            rate,
            premium: rate, // premium not separately available; use rate as proxy
        };
        s.fundingHistory.push(snapshot);
    }

    // ── Capital flows ───────────────────────────────────────────
    // Capital events are global (not per-coin). We accumulate them on a
    // special "__GLOBAL__" key for net flow display in the status bar.
    for (const ev of msg.capital) {
        const usdc = parseFloat(ev.usdc) || 0;
        if (!isFinite(usdc)) continue;

        const globalState = nodeStore.getOrCreate("__GLOBAL__");

        if (ev.type === "deposit" || (ev.type === "perp_transfer" && ev.to_perp)) {
            globalState.netCapitalFlow24h.add(usdc, blockTs);
        } else if (ev.type === "withdrawal" || (ev.type === "perp_transfer" && !ev.to_perp)) {
            globalState.netCapitalFlow24h.add(-usdc, blockTs);
        }
    }
}
