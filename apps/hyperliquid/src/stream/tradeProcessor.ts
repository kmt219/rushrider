import type { RawNodeTradesByBlock, MockTrade } from "../types";
import { nodeStore } from "./stateStore";

const ONE_MINUTE_MS = 60_000;

function floorToMinute(ts: number): number {
    return Math.floor(ts / ONE_MINUTE_MS) * ONE_MINUTE_MS;
}

export function processTrades(msg: RawNodeTradesByBlock): void {
    const blockTs = new Date(msg.block_time).getTime() || Date.now();

    for (let i = 0; i < msg.events.length; i++) {
        const ev = msg.events[i]!;
        const coin = ev.coin;
        const s = nodeStore.getOrCreate(coin);

        const px = parseFloat(ev.px);
        const sz = parseFloat(ev.sz);
        if (!isFinite(px) || !isFinite(sz) || px <= 0 || sz <= 0) continue;

        const notional = px * sz;

        const MS24H = 24 * 60 * 60 * 1000;
        // Capture previous-day price on first trade; refresh after 24h so change24h stays accurate
        if (s.prevDayPx === 0 || blockTs - s.prevDayPxTs > MS24H) {
            s.prevDayPx = px;
            s.prevDayPxTs = blockTs;
        }

        s.lastPx = px;

        // Build/update 1-minute candle
        const bucket = floorToMinute(blockTs);
        if (!s.currentCandle || s.currentCandle.time !== bucket) {
            // Flush completed candle to ring buffer
            if (s.currentCandle) {
                s.candles1m.push({ ...s.currentCandle });
            }
            s.currentCandle = {
                time: bucket,
                open: px,
                high: px,
                low: px,
                close: px,
                volume: notional,
            };
        } else {
            s.currentCandle.high = Math.max(s.currentCandle.high, px);
            s.currentCandle.low = Math.min(s.currentCandle.low, px);
            s.currentCandle.close = px;
            s.currentCandle.volume += notional;
        }

        // Append to trade history ring buffer (i used in id to avoid intra-block collisions)
        const trade: MockTrade = {
            id: `${String(msg.block_number)}-${coin}-${i}`,
            coin,
            px,
            sz,
            side: ev.side,
            crossed: true, // trades are always taker-perspective by convention
            time: msg.block_time,
            user: ev.users[0] ?? "",
            liquidation: false,
            makerFee: -0.0002,
            takerFee: 0.0005,
        };
        s.tradeHistory.push(trade);
    }
}
