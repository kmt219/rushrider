import type { RawOrdersByBlock } from "../types";
import { nodeStore } from "./stateStore";

export function processOrders(msg: RawOrdersByBlock): void {
    const blockTs = new Date(msg.block_time).getTime() || Date.now();

    for (const ev of msg.events) {
        const coin = ev.order.coin;
        const s = nodeStore.getOrCreate(coin);

        const limitPx = parseFloat(ev.order.limit_px);
        const sz = parseFloat(ev.order.sz);
        if (!isFinite(limitPx) || limitPx <= 0) continue;

        const isBid = ev.order.side === "B";
        const bookSide = isBid ? s.liveOrderBook.bids : s.liveOrderBook.asks;

        switch (ev.status) {
            case "open": {
                // Add or increase level
                const existing = bookSide.get(limitPx);
                if (existing) {
                    existing.size += sz;
                    existing.origSize += sz;
                } else {
                    bookSide.set(limitPx, { price: limitPx, size: sz, origSize: sz });
                }
                // Order flow tracking
                const notional = limitPx * sz;
                if (isBid) {
                    s.buyOrderVol24h.add(notional, blockTs);
                } else {
                    s.sellOrderVol24h.add(notional, blockTs);
                }
                break;
            }
            case "filled": {
                // Remove or reduce level
                const existing = bookSide.get(limitPx);
                if (existing) {
                    existing.size = Math.max(0, existing.size - sz);
                    if (existing.size <= 0) bookSide.delete(limitPx);
                }
                s.fillCount24h.add(1, blockTs);
                break;
            }
            case "cancelled":
            case "triggered": {
                const existing = bookSide.get(limitPx);
                if (existing) {
                    existing.size = Math.max(0, existing.size - sz);
                    if (existing.size <= 0) bookSide.delete(limitPx);
                }
                if (ev.status === "cancelled") {
                    s.cancelCount24h.add(1, blockTs);
                }
                break;
            }
            default:
                break;
        }
    }
}
