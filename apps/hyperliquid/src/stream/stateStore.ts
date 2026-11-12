import type { HIP3Market, MockTrade, OrderBook, FundingSnapshot, LiveLiquidation, CandleBar } from "../types";
import { RingBuffer } from "../utils/ringBuffer";

// ─── Per-coin order book state ─────────────────────────────────
export interface OrderLevel {
    price: number;
    size: number;
    origSize: number;
}

export interface LiveOrderBook {
    bids: Map<number, OrderLevel>; // keyed by price
    asks: Map<number, OrderLevel>;
}

// ─── Windowed counter helpers ──────────────────────────────────
// A RollingWindow stores {timestamp, value} pairs and sums those
// within the last windowMs milliseconds.
export class RollingWindow {
    private entries: { ts: number; val: number }[] = [];

    constructor(private readonly windowMs: number) {}

    add(val: number, ts = Date.now()): void {
        this.entries.push({ ts, val });
        this.prune(ts);
    }

    sum(now = Date.now()): number {
        this.prune(now);
        return this.entries.reduce((s, e) => s + e.val, 0);
    }

    count(now = Date.now()): number {
        this.prune(now);
        return this.entries.length;
    }

    private prune(now: number): void {
        const cutoff = now - this.windowMs;
        const idx = this.entries.findIndex((e) => e.ts >= cutoff);
        if (idx > 0) this.entries = this.entries.slice(idx);
        else if (idx === -1) this.entries = [];
    }
}

// ─── Per-coin state ────────────────────────────────────────────
export interface CoinState {
    // price & volume (from TradeProcessor)
    lastPx: number;
    prevDayPx: number;
    prevDayPxTs: number; // block timestamp when prevDayPx was last captured
    tradeHistory: RingBuffer<MockTrade>;
    candles1m: RingBuffer<CandleBar>;
    currentCandle: CandleBar | null;

    // volume split (from FillProcessor)
    volume24h: RollingWindow;
    makerVolume24h: RollingWindow;
    takerVolume24h: RollingWindow;
    tradeCount24h: RollingWindow;
    uniqueTraders24h: Map<string, number>; // address → last-seen blockTs (windowed 24h)
    builderRevenue24h: RollingWindow;

    // liquidations (from FillProcessor)
    liqCount24h: RollingWindow;
    liqVolume24h: RollingWindow;
    backstopLiqCount24h: RollingWindow;
    liqHistory: RingBuffer<LiveLiquidation>;
    lastLiquidation: LiveLiquidation | null;

    // order book (from OrderProcessor)
    liveOrderBook: LiveOrderBook;
    fillCount24h: RollingWindow; // denominator for cancelToFillRatio
    cancelCount24h: RollingWindow;
    buyOrderVol24h: RollingWindow;
    sellOrderVol24h: RollingWindow;

    // funding (from MiscProcessor)
    fundingHistory: RingBuffer<FundingSnapshot>;
    latestFundingRate: number;

    // capital flows (from MiscProcessor)
    netCapitalFlow24h: RollingWindow; // positive = net inflow
}

function makeCoinState(): CoinState {
    const MS24H = 24 * 60 * 60 * 1000;
    return {
        lastPx: 0,
        prevDayPx: 0,
        prevDayPxTs: 0,
        tradeHistory: new RingBuffer<MockTrade>(500),
        candles1m: new RingBuffer<CandleBar>(1440), // 24h of 1-minute candles
        currentCandle: null,

        volume24h: new RollingWindow(MS24H),
        makerVolume24h: new RollingWindow(MS24H),
        takerVolume24h: new RollingWindow(MS24H),
        tradeCount24h: new RollingWindow(MS24H),
        uniqueTraders24h: new Map(),
        builderRevenue24h: new RollingWindow(MS24H),

        liqCount24h: new RollingWindow(MS24H),
        liqVolume24h: new RollingWindow(MS24H),
        backstopLiqCount24h: new RollingWindow(MS24H),
        liqHistory: new RingBuffer<LiveLiquidation>(100),
        lastLiquidation: null,

        liveOrderBook: { bids: new Map(), asks: new Map() },
        fillCount24h: new RollingWindow(MS24H),
        cancelCount24h: new RollingWindow(MS24H),
        buyOrderVol24h: new RollingWindow(MS24H),
        sellOrderVol24h: new RollingWindow(MS24H),

        fundingHistory: new RingBuffer<FundingSnapshot>(200),
        latestFundingRate: 0,

        netCapitalFlow24h: new RollingWindow(MS24H),
    };
}

// ─── Store ────────────────────────────────────────────────────
export class MarketStateStore {
    private coins: Map<string, CoinState> = new Map();

    getOrCreate(coin: string): CoinState {
        let state = this.coins.get(coin);
        if (!state) {
            state = makeCoinState();
            this.coins.set(coin, state);
        }
        return state;
    }

    get(coin: string): CoinState | undefined {
        return this.coins.get(coin);
    }

    allCoins(): string[] {
        return [...this.coins.keys()];
    }

    // ── Snapshot getters called by React hooks ──────────────────

    getTradeHistory(coin: string): MockTrade[] {
        return this.coins.get(coin)?.tradeHistory.toArray() ?? [];
    }

    getOrderBook(coin: string): OrderBook {
        const state = this.coins.get(coin);
        if (!state) return { bids: [], asks: [] };
        const bids = [...state.liveOrderBook.bids.values()]
            .sort((a, b) => b.price - a.price)
            .slice(0, 20)
            .map((l) => ({ price: l.price, size: l.size }));
        const asks = [...state.liveOrderBook.asks.values()]
            .sort((a, b) => a.price - b.price)
            .slice(0, 20)
            .map((l) => ({ price: l.price, size: l.size }));
        return { bids, asks };
    }

    getFundingHistory(coin: string): FundingSnapshot[] {
        return this.coins.get(coin)?.fundingHistory.toArray() ?? [];
    }

    getLiqHistory(coin: string): LiveLiquidation[] {
        return this.coins.get(coin)?.liqHistory.toArray() ?? [];
    }

    getCandles(coin: string): CandleBar[] {
        return this.coins.get(coin)?.candles1m.toArray() ?? [];
    }

    getAllLiqHistory(limit: number): LiveLiquidation[] {
        const all: LiveLiquidation[] = [];
        for (const state of this.coins.values()) {
            all.push(...state.liqHistory.toArray());
        }
        return all.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, limit);
    }

    // ── Build HIP3Market snapshot from coin state ──────────────
    buildMarketSnapshot(coin: string, base: HIP3Market): HIP3Market {
        const s = this.coins.get(coin);
        if (!s) return base;

        const now = Date.now();
        const volume24h = s.volume24h.sum(now);
        const makerVolume = s.makerVolume24h.sum(now);
        const takerVolume = s.takerVolume24h.sum(now);
        const liqCount = s.liqCount24h.count(now);
        const liqVol = s.liqVolume24h.sum(now);
        const backstopCount = s.backstopLiqCount24h.count(now);
        const builderRev = s.builderRevenue24h.sum(now);
        const fillCount = s.fillCount24h.count(now);
        const cancelCount = s.cancelCount24h.count(now);
        const buyVol = s.buyOrderVol24h.sum(now);
        const sellVol = s.sellOrderVol24h.sum(now);
        const totalOrderVol = buyVol + sellVol;
        const bidDepth = [...s.liveOrderBook.bids.values()].reduce((a, l) => a + l.price * l.size, 0);
        const askDepth = [...s.liveOrderBook.asks.values()].reduce((a, l) => a + l.price * l.size, 0);
        const oiUtilization = base.oiCap > 0 ? base.openInterest / base.oiCap : 0;

        // Best bid/ask from live order book
        const bestBid = [...s.liveOrderBook.bids.values()].sort((a, b) => b.price - a.price)[0];
        const bestAsk = [...s.liveOrderBook.asks.values()].sort((a, b) => a.price - b.price)[0];
        const midPx = bestBid && bestAsk ? (bestBid.price + bestAsk.price) / 2 : s.lastPx;
        const spreadBps =
            midPx > 0 && bestBid && bestAsk ? ((bestAsk.price - bestBid.price) / midPx) * 10000 : base.spreadBps;

        // Prune stale traders so uniqueTraders24h reflects actual 24h window
        const traderCutoff = now - 24 * 60 * 60 * 1000;
        for (const [addr, ts] of s.uniqueTraders24h) {
            if (ts < traderCutoff) s.uniqueTraders24h.delete(addr);
        }

        return {
            ...base,
            markPx: s.lastPx || base.markPx,
            change24h: s.prevDayPx > 0 ? (s.lastPx - s.prevDayPx) / s.prevDayPx : base.change24h,
            volume24h,
            makerVolume24h: makerVolume,
            takerVolume24h: takerVolume,
            makerTakerRatio: volume24h > 0 ? makerVolume / volume24h : 0.5,
            liqCount24h: liqCount,
            liquidationVolume24h: liqVol,
            backstopLiqRate: liqCount > 0 ? backstopCount / liqCount : 0,
            lastLiquidation: s.lastLiquidation,
            tradeCount24h: s.tradeCount24h.count(now),
            lastTradeTime: new Date().toISOString(),
            uniqueTraders24h: s.uniqueTraders24h.size,
            builderRevenue24h: builderRev,
            avgBuilderFeeRate: volume24h > 0 ? builderRev / volume24h : 0,
            orderFlowImbalance: totalOrderVol > 0 ? (buyVol - sellVol) / totalOrderVol : 0,
            cancelToFillRatio: fillCount > 0 ? cancelCount / fillCount : 0,
            bookImbalance: bidDepth + askDepth > 0 ? bidDepth / (bidDepth + askDepth) : 0.5,
            bidDepth,
            askDepth,
            spreadBps,
            topBidPx: bestBid?.price ?? base.topBidPx,
            topAskPx: bestAsk?.price ?? base.topAskPx,
            topBidSz: bestBid?.size ?? base.topBidSz,
            topAskSz: bestAsk?.size ?? base.topAskSz,
            fundingRate: s.latestFundingRate || base.fundingRate,
            netCapitalFlow24h: s.netCapitalFlow24h.sum(now),
            oiUtilization,
            isAtCap: oiUtilization >= 0.99,
        };
    }
}

// Singleton exported — all processors and hooks share the same store
export const nodeStore = new MarketStateStore();
