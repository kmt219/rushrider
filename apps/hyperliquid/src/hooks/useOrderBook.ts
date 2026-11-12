import { HL_INFO_URL } from "../constants";
import { IS_GOLDRUSH_ACTIVE } from "../context/GoldRushContext";
import { useNodeStreamContext } from "../context/NodeStreamContext";
import { nodeStore } from "../stream/stateStore";
import type { OrderBook, OrderBookLevel } from "../types";
import { IS_NODE_STREAM_ACTIVE } from "./useNodeStream";
import { useEffect, useState } from "react";

const EMPTY: OrderBook = { bids: [], asks: [] };

interface HlLevel {
    px: string;
    sz: string;
    n: number;
}

interface HlL2Book {
    coin: string;
    levels: [HlLevel[], HlLevel[]];
    time: number;
}

function mapLevels(levels: HlLevel[]): OrderBookLevel[] {
    return levels.map((l) => ({ price: parseFloat(l.px), size: parseFloat(l.sz) }));
}

export function useOrderBook(coin: string | null): { orderBook: OrderBook; loading: boolean } {
    const stream = useNodeStreamContext();
    const [streamBook, setStreamBook] = useState<OrderBook>(EMPTY);
    const [hlBook, setHlBook] = useState<OrderBook>(EMPTY);

    // Node stream path
    useEffect(() => {
        if (!IS_NODE_STREAM_ACTIVE || !coin) return;
        setStreamBook(nodeStore.getOrderBook(coin));
    }, [coin, stream.blockTick]);

    // HL REST API — poll l2Book with exponential backoff; used when stream has no book data.
    // In GoldRush mode start at a gentler 5s interval — order book is supplementary since
    // GoldRush OHLCV already drives prices. Pure REST mode starts at 2s for responsiveness.
    useEffect(() => {
        if (IS_NODE_STREAM_ACTIVE || !coin) return;
        setHlBook(EMPTY);

        let cancelled = false;
        let retryDelay = IS_GOLDRUSH_ACTIVE ? 5_000 : 2_000;

        async function fetch_() {
            if (cancelled) return;
            try {
                const res = await fetch(HL_INFO_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    // Use full coin key — HL accepts both "BTC" and "xyz:CL" directly
                    body: JSON.stringify({ type: "l2Book", coin }),
                });
                if (!res.ok) {
                    retryDelay = Math.min(retryDelay * 2, 30_000);
                } else {
                    retryDelay = IS_GOLDRUSH_ACTIVE ? 5_000 : 2_000;
                    const data = (await res.json()) as HlL2Book;
                    setHlBook({
                        bids: mapLevels(data.levels[0]),
                        asks: mapLevels(data.levels[1]),
                    });
                }
            } catch {
                retryDelay = Math.min(retryDelay * 2, 30_000);
            }
            if (!cancelled) setTimeout(() => void fetch_(), retryDelay);
        }

        void fetch_();
        return () => {
            cancelled = true;
        };
    }, [coin]);

    if (IS_NODE_STREAM_ACTIVE) return { orderBook: streamBook, loading: false };
    // Prefer stream data; fall back to HL REST when stream has nothing
    const hasStream = streamBook.bids.length > 0 || streamBook.asks.length > 0;
    return { orderBook: hasStream ? streamBook : hlBook, loading: false };
}
