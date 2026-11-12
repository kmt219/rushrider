/**
 * useAppsLive24h — counts unique smart-contract addresses that received transactions
 * in a rolling 24-hour window on MegaETH.
 *
 * Strategy (GoldRush API):
 *   1. Fetch latest block height via block_v2/latest/.
 *   2. Anchor the 24h start by calling block_v2/{start}/{end}/ with a narrow
 *      5-minute window at exactly now-24h (ISO 8601 dates).  Falls back to
 *      sampling the last 5 000 blocks if the date-range endpoint is unavailable.
 *   3. Sample SAMPLE_BLOCKS evenly-spaced block numbers across [block24hAgo, latest].
 *   4. For each sample, fetch one page of transactions and collect to_address values.
 *   5. Deduplicate across all samples → final appsLive24h count.
 *
 * On MegaETH (~10 ms blocks, ~8.64 M blocks/day), 80 samples cover one probe
 * roughly every 108 000 blocks (~18 min of chain time) — a statistically
 * representative cross-section of 24-hour activity.
 */
import { proxyFetch, getChainCaps } from "../lib/chainCaps";
import { useEffect, useRef, useState } from "react";

const SAMPLE_BLOCKS = 80; // evenly-spaced probes across the 24h window
const CONCURRENCY = 8; // parallel block fetches
const POLL_MS = 5 * 60_000; // re-poll every 5 min
const SS_KEY = "apps-live-24h-cache";
const SS_TTL = 5 * 60_000; // cache valid for one poll cycle

interface BlockV2Data {
    items: Array<{ height: number }>;
}

function getCached(): number {
    try {
        const raw = sessionStorage.getItem(SS_KEY);
        if (raw) {
            const { value, ts } = JSON.parse(raw) as { value: number; ts: number };
            if (typeof value === "number" && value > 0 && Date.now() - ts < SS_TTL) return value;
        }
    } catch {
        /* ignore */
    }
    return 0;
}

async function runConcurrent<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
    const results: T[] = new Array(tasks.length);
    let next = 0;

    async function worker() {
        while (next < tasks.length) {
            const i = next++;
            results[i] = await tasks[i]!();
        }
    }

    await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
    return results;
}

export type AppsLive24hStatus = "loading" | "ok" | "unavailable" | "warming-up" | "error";

export function useAppsLive24h(apiKey: string, chainName: string) {
    const [appsLive, setAppsLive] = useState(getCached);
    const [status, setStatus] = useState<AppsLive24hStatus>(() => (getCached() > 0 ? "ok" : "loading"));
    const lastGoodRef = useRef(0);

    useEffect(() => {
        if (!apiKey || !chainName) return;
        const restChain = chainName.replace(/_/g, "-").toLowerCase();
        if (!getChainCaps(restChain).restApi) return;

        async function fetchApps() {
            try {
                // ── Step 1: latest block ────────────────────────────────────
                const latestRes = await proxyFetch(`${restChain}/block_v2/latest/`);
                if (latestRes.status === 551) {
                    setAppsLive(lastGoodRef.current);
                    setStatus("warming-up");
                    return;
                }
                if (latestRes.status === 501) {
                    setAppsLive(lastGoodRef.current);
                    setStatus("unavailable");
                    return;
                }
                if (!latestRes.ok) throw new Error(`Block API ${latestRes.status}`);
                const latestJson = await latestRes.json();
                const latestData = latestJson.data as BlockV2Data | null;
                const latestBlock = latestData?.items?.[0]?.height;
                if (!latestBlock) throw new Error("No block height returned");

                // ── Step 2: block at 24h ago (5-min anchor window) ──────────
                const now = new Date();
                const t24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                const t24hEnd = new Date(t24h.getTime() + 5 * 60 * 1000);
                const startIso = t24h.toISOString().replace(/\.\d{3}Z$/, "Z");
                const endIso = t24hEnd.toISOString().replace(/\.\d{3}Z$/, "Z");

                let block24hAgo = 0;
                try {
                    const rangeRes = await proxyFetch(`${restChain}/block_v2/${startIso}/${endIso}/`);
                    if (rangeRes.ok) {
                        const rangeJson = await rangeRes.json();
                        const items: Array<{ height: number }> = rangeJson.data?.items ?? [];
                        if (items.length > 0) {
                            block24hAgo = Math.min(...items.map((b) => b.height));
                        }
                    } else {
                        console.warn("[AppsLive24h] block_v2 date range unavailable, falling back to last 5000 blocks");
                    }
                } catch {
                    // Network error — fall back to last 5 000 blocks
                    console.warn("[AppsLive24h] block_v2 date range unavailable, falling back to last 5000 blocks");
                }

                // ── Step 3: uniform sample across [block24hAgo, latestBlock] ─
                const start = block24hAgo > 0 ? block24hAgo : Math.max(0, latestBlock - 5000);
                const blockRange = Math.max(latestBlock - start, 1);
                const sampleCount = Math.min(SAMPLE_BLOCKS, blockRange);
                const step = Math.floor(blockRange / sampleCount);

                const blockNums = Array.from({ length: sampleCount }, (_, i) =>
                    Math.min(start + i * step, latestBlock)
                );

                // ── Step 4: fetch txs for each sampled block ─────────────────
                type SlotResult = Set<string> | "warming" | null;

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
                            console.log(`[AppsLive24h] block ${n} RPC error (${res.status}), skipping`);
                            return addrs.size > 0 ? addrs : null;
                        }
                        const json = await res.json();
                        if (json.error) {
                            console.log(
                                `[AppsLive24h] block ${n} RPC error (${json.error.message ?? json.error.code}), skipping`
                            );
                            return addrs.size > 0 ? addrs : null;
                        }
                        const txs: Array<{ to?: string | null }> = json.result?.transactions ?? [];
                        for (const tx of txs) {
                            if (tx.to) addrs.add(tx.to.toLowerCase());
                        }
                        return addrs;
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : String(err);
                        console.log(`[AppsLive24h] block ${n} error (${msg}), skipping`);
                        return addrs.size > 0 ? addrs : null;
                    }
                });

                const results = await runConcurrent(tasks, CONCURRENCY);

                // ── Step 5: deduplicate → final count ────────────────────────
                let warmingCount = 0;
                const contracts = new Set<string>();

                for (const result of results) {
                    if (!result) continue;
                    if (result === "warming") {
                        warmingCount++;
                        continue;
                    }
                    for (const addr of result) contracts.add(addr);
                }

                if (contracts.size > 0) {
                    lastGoodRef.current = contracts.size;
                    setAppsLive(contracts.size);
                    setStatus("ok");
                    try {
                        sessionStorage.setItem(SS_KEY, JSON.stringify({ value: contracts.size, ts: Date.now() }));
                    } catch {
                        /* storage full */
                    }
                    console.log(
                        `[AppsLive24h] ✅ ${contracts.size.toLocaleString()} unique contracts (${sampleCount} blocks sampled)`
                    );
                } else if (warmingCount >= sampleCount / 2) {
                    setAppsLive(lastGoodRef.current);
                    setStatus("warming-up");
                } else {
                    setAppsLive(lastGoodRef.current);
                    setStatus("unavailable");
                }
            } catch (err) {
                console.error("[AppsLive24h]", err);
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
