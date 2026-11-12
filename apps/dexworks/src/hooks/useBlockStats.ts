import { proxyFetch, getChainCaps } from "../lib/chainCaps";
import { useEffect, useRef, useState } from "react";

const POLL_MS = 10_000;

export type BlockStatsStatus = "loading" | "ok" | "error";

export function useBlockStats(apiKey: string, chainName: string) {
    const [blockHeight, setBlockHeight] = useState(0);
    const [blockTps, setBlockTps] = useState(0);
    const [status, setStatus] = useState<BlockStatsStatus>("loading");

    // Cached last-good values — never reset to 0 on transient error
    const lastGoodRef = useRef<{ height: number; tps: number }>({ height: 0, tps: 0 });
    // Previous poll snapshot for delta computation
    const prevPollRef = useRef<{ height: number; ts: number } | null>(null);

    useEffect(() => {
        if (!apiKey || !chainName) return;
        const restChain = chainName.replace(/_/g, "-").toLowerCase();
        if (!getChainCaps(restChain).restApi) return;

        async function fetchBlockStats() {
            try {
                const res = await proxyFetch(`${restChain}/block_v2/latest/`);

                if (res.status === 551) {
                    // Chain warming up — keep last good values, surface as error
                    setBlockHeight(lastGoodRef.current.height);
                    setBlockTps(lastGoodRef.current.tps);
                    setStatus("error");
                    return;
                }

                if (!res.ok) throw new Error(`Block API ${res.status}`);

                const json = await res.json();
                const item = json.data?.items?.[0];
                if (!item) throw new Error("No block data returned");

                const height = item.height as number | undefined;
                if (!height) throw new Error("No block height");

                // tx_count may be absent on some chains — fall back to 0 gracefully
                const txCount = (item.tx_count as number | undefined) ?? 0;
                const now = Date.now();

                // Compute estimated TPS from delta between this and the previous poll
                let tps = 0;
                if (prevPollRef.current && height > prevPollRef.current.height && txCount > 0) {
                    const deltaBlocks = height - prevPollRef.current.height;
                    const blockTimeSec = (now - prevPollRef.current.ts) / 1000;
                    if (blockTimeSec > 0) {
                        tps = (deltaBlocks * txCount) / blockTimeSec;
                    }
                }

                prevPollRef.current = { height, ts: now };

                // Keep last-good tps so UI doesn't flicker back to "--" between polls
                const resolvedTps = tps > 0 ? tps : lastGoodRef.current.tps;
                lastGoodRef.current = { height, tps: resolvedTps };

                setBlockHeight(height);
                setBlockTps(resolvedTps);
                setStatus("ok");

                console.log(`[BlockStats] height=${height} tx_count=${txCount} tps=${resolvedTps.toFixed(1)}`);
            } catch (err) {
                console.error("[BlockStats]", err);
                // Surface stale good values on error, never blank the UI
                setBlockHeight(lastGoodRef.current.height);
                setBlockTps(lastGoodRef.current.tps);
                setStatus("error");
            }
        }

        fetchBlockStats();
        const t = setInterval(fetchBlockStats, POLL_MS);
        return () => clearInterval(t);
    }, [apiKey, chainName]);

    return { blockHeight, blockTps, status };
}
