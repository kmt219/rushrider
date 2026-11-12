import { proxyFetch, getChainCaps } from "../lib/chainCaps";
import { useEffect, useRef, useState } from "react";

const POLL_MS = 60_000;
const BLOCK_COUNT = 10; // last N blocks
const CONCURRENCY = 3;

const SS_KEY_APPS = "apps-live-cache";
const SS_TTL_APPS = 5 * 60 * 1000; // 5 min

interface BlockV2Data {
    items: Array<{ height: number }>;
}

function getCachedAppsLive(): number {
    try {
        const raw = sessionStorage.getItem(SS_KEY_APPS);
        if (raw) {
            const { value, ts } = JSON.parse(raw) as { value: number; ts: number };
            if (typeof value === "number" && value > 0 && Date.now() - ts < SS_TTL_APPS) return value;
        }
    } catch {
        /* ignore */
    }
    return 0;
}

/**
 * Process `tasks` with at most `limit` running concurrently.
 * Returns results in input order (settled — errors are caught internally by each task).
 */
async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
    const results: T[] = new Array(tasks.length);
    let nextIndex = 0;

    async function worker() {
        while (nextIndex < tasks.length) {
            const i = nextIndex++;
            results[i] = await tasks[i]!();
        }
    }

    await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
    return results;
}

export type AppsLiveStatus = "loading" | "ok" | "unavailable" | "warming-up" | "error";

// `apiKey` is retained for backward compatibility with App.tsx — auth is handled internally.
export function useAppsLive(apiKey: string, chainName: string) {
    // Seed from sessionStorage so the KPI shows instantly on page refresh
    const [appsLive, setAppsLive] = useState(getCachedAppsLive);
    const [status, setStatus] = useState<AppsLiveStatus>(() => (getCachedAppsLive() > 0 ? "ok" : "loading"));
    const lastGoodRef = useRef(0);

    useEffect(() => {
        if (!apiKey || !chainName) return;
        const restChain = chainName.replace(/_/g, "-").toLowerCase();
        if (!getChainCaps(restChain).restApi) return;

        async function fetchApps() {
            try {
                // Step 1: latest block
                const latestRes = await proxyFetch(`${restChain}/block_v2/latest/`);
                if (latestRes.status === 551) {
                    setAppsLive(lastGoodRef.current);
                    setStatus("warming-up");
                    return;
                }
                if (!latestRes.ok) throw new Error(`Block API ${latestRes.status}`);
                const latestJson = await latestRes.json();
                const blockData = latestJson.data as BlockV2Data | null;
                const latestBlock = blockData?.items?.[0]?.height;
                if (!latestBlock) throw new Error("No block height returned");

                // Step 2: fetch last BLOCK_COUNT blocks with bounded concurrency
                const blockNums = Array.from({ length: BLOCK_COUNT }, (_, i) => latestBlock - i);

                type SlotResult = Set<string> | null;

                const tasks = blockNums.map((n) => async (): Promise<SlotResult> => {
                    const addrs = new Set<string>();
                    try {
                        const res = await fetch("/api/rpc", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                jsonrpc: "2.0",
                                method: "eth_getBlockByNumber",
                                params: ["0x" + n.toString(16), true],
                                id: n,
                            }),
                        });
                        if (!res.ok) {
                            console.log(`[AppsLive] block ${n} RPC error (${res.status}), skipping`);
                            return null;
                        }
                        const json = await res.json();
                        if (json.error) {
                            console.log(
                                `[AppsLive] block ${n} RPC error (${json.error.message ?? json.error.code}), skipping`
                            );
                            return null;
                        }
                        const txs: Array<{ to?: string | null }> = json.result?.transactions ?? [];
                        for (const tx of txs) {
                            if (tx.to) addrs.add(tx.to.toLowerCase());
                        }
                        return addrs;
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : String(err);
                        console.log(`[AppsLive] block ${n} error (${msg}), skipping`);
                        return null;
                    }
                });

                const results = await runWithConcurrency(tasks, CONCURRENCY);

                const contracts = new Set<string>();

                for (const result of results) {
                    if (!result) continue;
                    for (const addr of result) contracts.add(addr);
                }

                if (contracts.size > 0) {
                    lastGoodRef.current = contracts.size;
                    setAppsLive(contracts.size);
                    setStatus("ok");
                    try {
                        sessionStorage.setItem(SS_KEY_APPS, JSON.stringify({ value: contracts.size, ts: Date.now() }));
                    } catch {
                        /* storage full */
                    }
                } else {
                    setAppsLive(lastGoodRef.current);
                    setStatus("unavailable");
                }
            } catch (err) {
                console.error("[AppsLive]", err);
                setAppsLive(lastGoodRef.current);
                setStatus("error");
            }
        }

        fetchApps();
        const t = setInterval(fetchApps, POLL_MS);
        return () => clearInterval(t);
    }, [apiKey, chainName]);

    return { appsLive, status };
}
