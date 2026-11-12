import { HL_INFO_URL } from "../constants";
import { useNodeStreamContext } from "../context/NodeStreamContext";
import { nodeStore } from "../stream/stateStore";
import type { FundingSnapshot } from "../types";
import { IS_NODE_STREAM_ACTIVE } from "./useNodeStream";
import { useEffect, useRef, useState } from "react";

interface HlFundingEntry {
    coin: string;
    fundingRate: string;
    premium: string;
    time: number;
}

export function useFundingHistory(coin: string | null): { history: FundingSnapshot[]; loading: boolean } {
    const stream = useNodeStreamContext();
    const [history, setHistory] = useState<FundingSnapshot[]>([]);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Node stream path
    useEffect(() => {
        if (!IS_NODE_STREAM_ACTIVE || !coin) return;
        setHistory(nodeStore.getFundingHistory(coin));
    }, [coin, stream.blockTick]);

    // HL REST API — fetch last 7 days of funding history; used when stream has no data
    useEffect(() => {
        if (IS_NODE_STREAM_ACTIVE || !coin) return;
        const startTime = Date.now() - 7 * 24 * 60 * 60 * 1000;

        async function fetch_() {
            try {
                const res = await fetch(HL_INFO_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ type: "fundingHistory", coin, startTime }),
                });
                if (!res.ok) return;
                const data = (await res.json()) as HlFundingEntry[];
                setHistory(
                    data.map((e) => ({
                        time: new Date(e.time).toISOString(),
                        rate: parseFloat(e.fundingRate),
                        premium: parseFloat(e.premium),
                    }))
                );
            } catch {
                // silent
            }
        }

        void fetch_();
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => void fetch_(), 60 * 60 * 1000);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            intervalRef.current = null;
        };
    }, [coin]);

    return { history, loading: false };
}
