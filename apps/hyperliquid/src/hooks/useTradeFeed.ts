import { HL_INFO_URL } from "../constants";
import {
    GOLDRUSH_CHAIN,
    IS_GOLDRUSH_ACTIVE,
    useGoldRushClient,
    type GoldRushLiqEntry,
} from "../context/GoldRushContext";
import { useNodeStreamContext } from "../context/NodeStreamContext";
import { buildPublicFillsQuery } from "../queries";
import { nodeStore } from "../stream/stateStore";
import type { ConnectionState, MockTrade } from "../types";
import { IS_NODE_STREAM_ACTIVE } from "./useNodeStream";
import { useEffect, useState } from "react";

interface HlRecentTrade {
    coin: string;
    side: "A" | "B";
    px: string;
    sz: string;
    time: number;
    hash: string;
    tid: number;
}

function hlTradeToMock(t: HlRecentTrade): MockTrade {
    return {
        id: String(t.tid),
        coin: t.coin,
        px: parseFloat(t.px),
        sz: parseFloat(t.sz),
        side: t.side,
        crossed: true,
        time: new Date(t.time).toISOString(),
        user: "",
        liquidation: false,
        makerFee: 0,
        takerFee: 0,
    };
}

interface WalletTxFill {
    __typename?: string;
    time?: number;
    coin?: string;
    price?: number;
    size?: number;
    side?: "A" | "B";
    tid?: number;
    crossed?: boolean;
    liquidation?: {
        liquidated_user?: string;
        method?: string;
        market_price?: number;
    } | null;
}

interface WalletTxEvent {
    decoded_details?: WalletTxFill;
}

function fillToMockTrade(f: WalletTxFill): MockTrade {
    return {
        id: String(f.tid ?? 0),
        coin: f.coin ?? "",
        px: f.price ?? 0,
        sz: f.size ?? 0,
        side: f.side ?? "A",
        crossed: f.crossed ?? true,
        time: f.time !== null && f.time !== undefined ? new Date(f.time).toISOString() : new Date().toISOString(),
        user: "",
        liquidation: f.liquidation !== null && f.liquidation !== undefined,
        makerFee: 0,
        takerFee: 0,
    };
}

export function useTradeFeed(coin: string | null): { trades: MockTrade[]; status: ConnectionState } {
    const stream = useNodeStreamContext();
    const { client, status: grStatus, stores, bumpLiqTick } = useGoldRushClient();
    const [nodeTrades, setNodeTrades] = useState<MockTrade[]>([]);
    const [grTrades, setGrTrades] = useState<MockTrade[]>([]);
    const [hlTrades, setHlTrades] = useState<MockTrade[]>([]);

    // Node stream path
    useEffect(() => {
        if (!IS_NODE_STREAM_ACTIVE || !coin) return;
        setNodeTrades(nodeStore.getTradeHistory(coin));
    }, [coin, stream.blockTick]);

    // GoldRush path — walletTxs with wallet_addresses: [] streams all fills network-wide.
    // Filter to HypercoreFillTransaction for the active coin client-side.
    // Eliminates HL REST recentTrades polling in GoldRush mode.
    useEffect(() => {
        if (!IS_GOLDRUSH_ACTIVE || IS_NODE_STREAM_ACTIVE || !client || !coin) return;

        setGrTrades([]);

        const unsub = client.subscribe<{ walletTxs?: WalletTxEvent }>(
            { query: buildPublicFillsQuery(GOLDRUSH_CHAIN) },
            {
                next: ({ data }) => {
                    const details = data?.walletTxs?.decoded_details;
                    if (!details || details.__typename !== "HypercoreFillTransaction") return;
                    if (details.coin !== coin) return; // filter to current coin
                    const trade = fillToMockTrade(details);
                    setGrTrades((prev) => [trade, ...prev].slice(0, 100));

                    // Route liquidation fills to liqStore
                    if (details.liquidation?.liquidated_user) {
                        const liqEntry: GoldRushLiqEntry = {
                            coin: details.coin ?? "",
                            liquidatedUser: details.liquidation.liquidated_user,
                            method: details.liquidation.method ?? "LIQUIDATION",
                            marketPx: details.liquidation.market_price ?? details.price ?? 0,
                            side: details.side ?? "A",
                            sz: details.size ?? 0,
                            time: details.time ?? Date.now(),
                        };

                        const buf = stores.liqStore.get(details.coin ?? "") ?? [];
                        buf.unshift(liqEntry);
                        if (buf.length > 50) buf.pop();
                        stores.liqStore.set(details.coin ?? "", buf);
                        bumpLiqTick();
                    }
                },
                error: () => {
                    // walletTxs with empty wallet_addresses may not be supported;
                    // hlTrades fallback below will cover the trade feed
                },
                complete: () => {},
            }
        );

        return () => unsub();
    }, [client, coin, stores, bumpLiqTick]);

    // HL REST API — universal fallback for all modes. Runs even in node-stream mode
    // so that if the WS hasn't delivered trades for this coin yet, the feed isn't
    // stuck on "Waiting for trades..." indefinitely.
    useEffect(() => {
        if (!coin) return;
        // HL recentTrades requires the exact coin key as listed on exchange:
        //   • Main-dex perps/spots: plain ticker ("BTC", "HYPE")
        //   • Builder-dex perps: prefixed ticker ("xyz:CL", "cash:USYC")
        // Do NOT strip the prefix — builder dex coins return null without it.
        setHlTrades([]); // clear stale trades immediately on coin change

        async function fetch_() {
            try {
                const res = await fetch(HL_INFO_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ type: "recentTrades", coin }),
                });
                if (!res.ok) return;
                const raw = (await res.json()) as HlRecentTrade[] | null;
                if (!raw) return;
                setHlTrades(raw.map(hlTradeToMock).reverse());
            } catch {
                // silent
            }
        }

        void fetch_();
        const id = setInterval(() => void fetch_(), 3_000);
        return () => clearInterval(id);
    }, [coin]);

    if (IS_NODE_STREAM_ACTIVE) return { trades: nodeTrades.length > 0 ? nodeTrades : hlTrades, status: stream.status };
    // GoldRush: prefer live walletTxs fills; fall back to HL REST when subscription has no data yet
    if (IS_GOLDRUSH_ACTIVE) return { trades: grTrades.length > 0 ? grTrades : hlTrades, status: grStatus };
    return { trades: hlTrades, status: hlTrades.length > 0 ? "connected" : "connecting" };
}
