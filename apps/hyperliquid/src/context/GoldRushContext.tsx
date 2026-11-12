import { IS_NODE_STREAM_ACTIVE } from "../hooks/useNodeStream";
import { createHardenedClient } from "../lib/wsClient";
import type { ConnectionState } from "../types";
import type { Client } from "graphql-ws";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

const GOLDRUSH_STREAM_URL =
    (import.meta.env.VITE_GOLDRUSH_STREAM_URL as string | undefined) ?? "wss://streaming.goldrushdata.com/graphql";
const GOLDRUSH_API_KEY = import.meta.env.VITE_GOLDRUSH_API_KEY as string | undefined;

/** True when VITE_GOLDRUSH_API_KEY is set and node stream is not taking priority */
export const IS_GOLDRUSH_ACTIVE = Boolean(GOLDRUSH_API_KEY) && !IS_NODE_STREAM_ACTIVE;

/** SCREAMING_SNAKE_CASE chain name used in all GoldRush streaming subscriptions */
export const GOLDRUSH_CHAIN = (import.meta.env.VITE_GOLDRUSH_CHAIN_NAME as string | undefined) ?? "HYPERCORE_MAINNET";

export interface GoldRushFundingEntry {
    rate: number;
    time: number; // Unix ms
}

export interface GoldRushLiqEntry {
    coin: string;
    liquidatedUser: string;
    method: string;
    marketPx: number;
    side: "B" | "A";
    sz: number;
    time: number;
}

export interface GoldRushStores {
    fundingMap: Map<string, GoldRushFundingEntry>;
    tradersMap: Map<string, Map<string, number>>;
    liqStore: Map<string, GoldRushLiqEntry[]>;
}

interface GoldRushState {
    client: Client | null;
    status: ConnectionState;
    stores: GoldRushStores;
    liqTick: number;
    bumpLiqTick: () => void;
}

const GoldRushContext = createContext<GoldRushState>({
    client: null,
    status: "disconnected",
    stores: { fundingMap: new Map(), tradersMap: new Map(), liqStore: new Map() },
    liqTick: 0,
    bumpLiqTick: () => {},
});

export function GoldRushProvider({ children }: { children: ReactNode }) {
    const [status, setStatus] = useState<ConnectionState>(IS_GOLDRUSH_ACTIVE ? "connecting" : "disconnected");
    // Keep client stable — never re-create it
    const clientRef = useRef<Client | null>(null);
    const [client, setClient] = useState<Client | null>(null);
    // Mutable stores — written by fill events without triggering re-renders
    const storesRef = useRef<GoldRushStores>({
        fundingMap: new Map(),
        tradersMap: new Map(),
        liqStore: new Map(),
    });
    // Counter that bumps each time liqStore is written — lets consumers re-read the mutable map
    const [liqTick, setLiqTick] = useState(0);
    const bumpLiqTick = useCallback(() => setLiqTick((n) => n + 1), []);

    useEffect(() => {
        if (!IS_GOLDRUSH_ACTIVE) return;

        const c = createHardenedClient({
            url: GOLDRUSH_STREAM_URL,
            apiKey: GOLDRUSH_API_KEY!,
            label: "GOLDRUSH",
            onConnected: () => setStatus("connected"),
            onClosed: () => setStatus("disconnected"),
            onError: () => setStatus("error"),
        });
        clientRef.current = c;
        setClient(c);

        return () => {
            void c.dispose();
            clientRef.current = null;
            setClient(null);
        };
    }, []); // create once

    return (
        <GoldRushContext.Provider value={{ client, status, stores: storesRef.current, liqTick, bumpLiqTick }}>
            {children}
        </GoldRushContext.Provider>
    );
}

export function useGoldRushClient(): GoldRushState {
    return useContext(GoldRushContext);
}
