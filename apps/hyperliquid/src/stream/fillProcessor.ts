import type { RawNodeFillsByBlock } from "../types";
import { nodeStore } from "./stateStore";

export function processFills(msg: RawNodeFillsByBlock): void {
    const blockTs = new Date(msg.block_time).getTime() || Date.now();

    for (const ev of msg.events) {
        const coin = ev.coin;
        const s = nodeStore.getOrCreate(coin);

        const px = parseFloat(ev.px);
        const sz = parseFloat(ev.sz);
        if (!isFinite(px) || !isFinite(sz) || px <= 0 || sz <= 0) continue;

        const notional = px * sz;
        // ev.fee (total exchange fee) is intentionally not aggregated here; only builder_fee feeds revenue metrics
        const builderFee = parseFloat(ev.builder_fee) || 0;
        const isTaker = ev.crossed;

        // Volume split
        s.volume24h.add(notional, blockTs);
        s.tradeCount24h.add(1, blockTs);
        if (isTaker) {
            s.takerVolume24h.add(notional, blockTs);
        } else {
            s.makerVolume24h.add(notional, blockTs);
        }

        // Builder fees
        if (builderFee > 0) {
            s.builderRevenue24h.add(builderFee, blockTs);
        }

        // Windowed unique traders: track address → most-recent-trade timestamp
        // Prune addresses last seen more than 24h ago before adding
        s.uniqueTraders24h.set(ev.user_address, blockTs);
        // Prune stale entries periodically (every ~1000 fills to amortise cost)
        if (s.uniqueTraders24h.size > 1000 && s.uniqueTraders24h.size % 1000 === 0) {
            const cutoff = blockTs - 24 * 60 * 60 * 1000;
            for (const [addr, ts] of s.uniqueTraders24h) {
                if (ts < cutoff) s.uniqueTraders24h.delete(addr);
            }
        }

        // Fill count (denominator for cancel/fill ratio)
        s.fillCount24h.add(1, blockTs);

        // Liquidations
        if (ev.liquidation) {
            const markPx = parseFloat(ev.liquidation.mark_px) || px;
            const isBackstop = ev.liquidation.method === "BACKSTOP";

            s.liqCount24h.add(1, blockTs);
            s.liqVolume24h.add(notional, blockTs);
            if (isBackstop) s.backstopLiqCount24h.add(1, blockTs);

            const liq = {
                id: `${String(msg.block_number)}-${ev.user_address}-${coin}`,
                coin,
                user: ev.liquidation.liquidated_user,
                sz,
                markPx,
                method: ev.liquidation.method,
                time: msg.block_time,
            };
            s.liqHistory.push(liq);
            s.lastLiquidation = liq;
        }
    }
}
