import { getChainCaps } from "../lib/chainCaps";
import { goldrushFetch } from "../lib/goldrushClient";
import { computeContractSignal } from "../scoring/contractSignal";
import { computeDeployerSignal } from "../scoring/deployerSignal";
import { computeHolderSignal } from "../scoring/holderSignal";
import type { HolderDistribution } from "../scoring/holderSignal";
import { computeLiquiditySignal } from "../scoring/liquiditySignal";
import { computeTradingSignal } from "../scoring/tradingSignal";
import { getRiskLevel, computeTotal, LOADING_SIGNAL } from "../scoring/types";
import type { SafetyScore, RiskEvent } from "../scoring/types";
import type { NewPairData, PairMetrics } from "../types";
import { fetchContractAnalysis, clearContractCache } from "./useContractAnalysis";
import { fetchDeployerProfile, withPrefetchSemaphore, clearDeployerCache } from "./useDeployerReputation";
import { useEffect, useState } from "react";

// Module-level buffer for timeline events pushed from outside the hook
// (e.g. live stream callbacks in App.tsx).
const _pendingEvents = new Map<string, import("../scoring/types").RiskEvent[]>();

/**
 * Clear all module-level caches — call on chain switch to prevent cross-chain
 * data contamination. Both maps are keyed by pair address (no chain prefix on
 * _pendingEvents), so stale entries from the old chain must be evicted.
 */
export function clearSafetyCache(): void {
    _signalCache.clear();
    _pendingEvents.clear();
    _inflight.clear();
    _badgeScores.clear();
    _badgeChainsLoaded.clear();
    _unsupportedHolders.clear();
    clearDeployerCache();
    clearContractCache();
}

/**
 * Push a risk timeline event from outside useSafetyScore (e.g. from stream
 * callbacks). The event is merged into the score on the next metrics tick.
 */
const PENDING_EVENTS_CAP = 20;

export function pushTimelineEvent(pairAddress: string, event: import("../scoring/types").RiskEvent): void {
    const key = pairAddress.toLowerCase();
    const arr = _pendingEvents.get(key) ?? [];
    arr.push(event);
    // Cap to avoid unbounded growth for pairs whose modal is never opened
    if (arr.length > PENDING_EVENTS_CAP) arr.splice(0, arr.length - PENDING_EVENTS_CAP);
    _pendingEvents.set(key, arr);
}

// Cache for REST-derived signals (holder/deployer/contract) so re-opening the modal
// doesn't re-fire API calls for the same pair. Trading signal stays live (not cached).
interface CachedRestSignals {
    holderSignal: import("../scoring/types").SignalResult;
    deployerSignal: import("../scoring/types").SignalResult;
    contractSignal: import("../scoring/types").SignalResult;
    baseTimeline: import("../scoring/types").RiskEvent[];
    fetchedAt: number;
}
const _signalCache = new Map<string, CachedRestSignals>();
const SIGNAL_CACHE_TTL = 5 * 60_000;

// localStorage badge cache — persists { total, riskLevel } per pair address so badges
// render instantly on page reload instead of cycling through LOADING.
const BADGE_LS_TTL = SIGNAL_CACHE_TTL;
const _badgeScores = new Map<string, { total: number; riskLevel: string }>();
const _badgeChainsLoaded = new Set<string>();

function _ensureBadgeChainLoaded(normChain: string): void {
    if (_badgeChainsLoaded.has(normChain)) return;
    _badgeChainsLoaded.add(normChain);
    try {
        const raw = localStorage.getItem(`${normChain}:badge-scores`);
        if (!raw) return;
        const { data, ts } = JSON.parse(raw) as { data: [string, { total: number; riskLevel: string }][]; ts: number };
        if (Date.now() - ts > BADGE_LS_TTL) return;
        for (const [addr, entry] of data) _badgeScores.set(`${normChain}:${addr}`, entry);
    } catch {
        /* storage unavailable */
    }
}

function _persistBadgeScore(normChain: string, addr: string, total: number, riskLevel: string): void {
    _badgeScores.set(`${normChain}:${addr}`, { total, riskLevel });
    // Collect all known entries for this chain and flush to localStorage
    const chainData: [string, { total: number; riskLevel: string }][] = [];
    for (const [k, v] of _badgeScores) {
        if (k.startsWith(`${normChain}:`)) chainData.push([k.slice(normChain.length + 1), v]);
    }
    try {
        localStorage.setItem(`${normChain}:badge-scores`, JSON.stringify({ data: chainData, ts: Date.now() }));
    } catch {
        /* storage full */
    }
}
// In-flight promises — if two useSafetyScore instances compute the same pair concurrently
// (e.g. table badge + open modal), the second subscribes to the first's result instead of
// re-queuing duplicate semaphore calls.
const _inflight = new Map<string, Promise<void>>();

// Holder distribution fetcher — returns distribution data for scoring
interface HolderItem {
    address?: string;
    balance?: string;
}
interface HolderResponse {
    pagination?: { total_count?: number };
    items?: HolderItem[];
}
interface TokenMetaResponse {
    items?: Array<{ total_supply?: string }>;
}

const DEAD_ADDRESSES = new Set([
    "0x0000000000000000000000000000000000000000",
    "0x000000000000000000000000000000000000dead",
]);

// Track tokens whose holder endpoint returns 404 so we don't re-fetch after cache expires
const _unsupportedHolders = new Set<string>();

async function fetchHolderDistribution(chainName: string, tokenAddress: string): Promise<HolderDistribution> {
    const restChain = chainName.replace(/_/g, "-").toLowerCase();
    const addr = tokenAddress.toLowerCase();
    const holderKey = `${restChain}:${addr}`;
    if (!getChainCaps(restChain).restApi || _unsupportedHolders.has(holderKey)) {
        return { totalCount: 0, topHolderPct: 0, top5HolderPct: 0, top20HolderPct: 0, giniCoeff: 0 };
    }
    try {
        // Fetch holders and token metadata (for total_supply) in parallel
        const [holderRes, metaRes] = await Promise.allSettled([
            goldrushFetch<HolderResponse>(
                `${restChain}/tokens/${addr}/token_holders_v2/`,
                { "page-size": "100" },
                60_000
            ),
            goldrushFetch<TokenMetaResponse>(`${restChain}/tokens/${addr}/`, {}, 300_000),
        ]);
        const resp = holderRes.status === "fulfilled" ? holderRes.value : null;
        const meta = metaRes.status === "fulfilled" ? metaRes.value : null;

        const items = (resp?.items ?? []).filter((h) => !DEAD_ADDRESSES.has((h.address ?? "").toLowerCase()));
        const totalCount = resp?.pagination?.total_count ?? items.length;
        if (items.length === 0) {
            return { totalCount, topHolderPct: 0, top5HolderPct: 0, top20HolderPct: 0, giniCoeff: 0 };
        }
        // GoldRush returns items sorted by balance desc
        const balances = items.map((h) => {
            try {
                return BigInt(h.balance ?? "0");
            } catch {
                return 0n;
            }
        });
        // Use token total_supply as denominator when available so percentages reflect
        // share of the whole supply, not just share of the top-100 holders.
        const topSum = balances.reduce((a, b) => a + b, 0n);
        let denominator = topSum;
        const totalSupplyStr = meta?.items?.[0]?.total_supply;
        if (totalSupplyStr) {
            try {
                const ts = BigInt(totalSupplyStr);
                if (ts > topSum) denominator = ts;
            } catch {
                // malformed — fall back to topSum
            }
        }
        const top1 = balances[0] ?? 0n;
        const top5 = balances.slice(0, 5).reduce((a, b) => a + b, 0n);
        const topHolderPct = denominator > 0n ? Number((top1 * 10000n) / denominator) / 100 : 0;
        const top5HolderPct = denominator > 0n ? Number((top5 * 10000n) / denominator) / 100 : 0;
        const top20 = balances.slice(0, 20).reduce((a, b) => a + b, 0n);
        const top20HolderPct = denominator > 0n ? Number((top20 * 10000n) / denominator) / 100 : 0;

        // Gini coefficient over available balances (0 = perfect equality, 1 = all to one)
        let giniCoeff = 0;
        if (balances.length > 1 && topSum > 0n) {
            const n = balances.length;
            const floats = balances.map((b) => Number(b));
            const sorted = [...floats].sort((a, b) => a - b);
            const totalFloat = sorted.reduce((a, b) => a + b, 0);
            let sumOfAbsDiffs = 0;
            for (let i = 0; i < n; i++) {
                for (let j = i + 1; j < n; j++) {
                    sumOfAbsDiffs += Math.abs(sorted[i]! - sorted[j]!);
                }
            }
            giniCoeff = totalFloat > 0 ? sumOfAbsDiffs / (n * totalFloat) : 0;
        }

        return { totalCount, topHolderPct, top5HolderPct, top20HolderPct, giniCoeff };
    } catch (err: unknown) {
        // Only suppress retries on 404 — transient network failures should be retried.
        if ((err as { status?: number })?.status === 404) {
            _unsupportedHolders.add(holderKey);
        }
        return { totalCount: 0, topHolderPct: 0, top5HolderPct: 0, top20HolderPct: 0, giniCoeff: 0 };
    }
}

function makeSkeleton(pairAddress: string, pairedAt: number): SafetyScore {
    return {
        pairAddress,
        total: 0,
        signals: {
            liquidity: { ...LOADING_SIGNAL, label: "LIQUIDITY" },
            holders: { ...LOADING_SIGNAL, label: "HOLDERS" },
            deployer: { ...LOADING_SIGNAL, label: "DEPLOYER" },
            contract: { ...LOADING_SIGNAL, label: "CONTRACT" },
            trading: { ...LOADING_SIGNAL, label: "TRADING" },
        },
        riskLevel: "LOADING",
        timeline: [{ timestamp: pairedAt, relativeMs: 0, event: "Pair created", severity: "info" }],
        lastUpdated: Date.now(),
    };
}

/**
 * Shared computation: fetch all 3 REST signals, compute, populate _signalCache.
 * Deduplicates via _inflight — callers that arrive while a fetch is in progress
 * subscribe to the same promise instead of launching duplicate requests.
 * Returns a resolved promise immediately if _signalCache is already warm.
 */
function _startComputation(pairData: NewPairData, chainName: string): Promise<void> {
    const key = pairData.pair_address.toLowerCase();
    const cacheKey = `${chainName}:${key}`;

    const existing = _inflight.get(cacheKey);
    if (existing) return existing;

    const cached = _signalCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < SIGNAL_CACHE_TTL) return Promise.resolve();

    const pAt = new Date(pairData.block_signed_at).getTime();
    const tokenAddress = pairData.base_token?.contract_address;
    const deployerAddress = pairData.deployer_address;
    const hasRestApi = getChainCaps(chainName.replace(/_/g, "-").toLowerCase()).restApi;

    const promise: Promise<void> = Promise.allSettled([
        tokenAddress && hasRestApi && isEvmAddress(tokenAddress)
            ? fetchHolderDistribution(chainName, tokenAddress)
            : Promise.resolve(null),
        deployerAddress && hasRestApi && isEvmAddress(deployerAddress)
            ? fetchDeployerProfile(chainName, deployerAddress)
            : Promise.resolve(null),
        tokenAddress && hasRestApi && isEvmAddress(tokenAddress)
            ? fetchContractAnalysis(chainName, tokenAddress)
            : Promise.resolve(null),
    ])
        .then(([holderRes, deployerRes, contractRes]) => {
            const holderDist = holderRes.status === "fulfilled" ? holderRes.value : null;
            const deployerProfile = deployerRes.status === "fulfilled" ? deployerRes.value : null;
            const contractAnalysis = contractRes.status === "fulfilled" ? contractRes.value : null;

            const holderSignal = holderDist
                ? computeHolderSignal(holderDist)
                : { score: 10, loading: false, label: "HOLDERS", details: ["Data unavailable"], raw: {} };
            const deployerSignal = deployerProfile
                ? computeDeployerSignal(deployerProfile)
                : { score: 10, loading: false, label: "DEPLOYER", details: ["Data unavailable"], raw: {} };
            const contractSignal = contractAnalysis
                ? computeContractSignal(contractAnalysis)
                : { score: 10, loading: false, label: "CONTRACT", details: ["Data unavailable"], raw: {} };

            const baseTimeline: RiskEvent[] = [
                { timestamp: pAt, relativeMs: 0, event: "Pair created", severity: "info" },
            ];
            if (contractAnalysis?.isSpam === true)
                baseTimeline.push({
                    timestamp: Date.now(),
                    relativeMs: Date.now() - pAt,
                    event: "Token flagged as SPAM by GoldRush",
                    severity: "danger",
                });
            if (contractAnalysis?.hasSellTxs)
                baseTimeline.push({
                    timestamp: Date.now(),
                    relativeMs: Date.now() - pAt,
                    event: "Sell transactions confirmed",
                    severity: "ok",
                });
            if (contractAnalysis?.hasMintEvents)
                baseTimeline.push({
                    timestamp: Date.now(),
                    relativeMs: Date.now() - pAt,
                    event: "Post-launch mints detected",
                    severity: "danger",
                });
            if (deployerProfile && deployerProfile.rugPatterns > 0)
                baseTimeline.push({
                    timestamp: Date.now(),
                    relativeMs: Date.now() - pAt,
                    event: `Deployer: ${deployerProfile.rugPatterns} prior rug pattern(s)`,
                    severity: "danger",
                });
            if (deployerProfile && deployerProfile.deploysLast30d >= 3)
                baseTimeline.push({
                    timestamp: Date.now(),
                    relativeMs: Date.now() - pAt,
                    event: `Serial deployer: ${deployerProfile.deploysLast30d} tokens in last 30d`,
                    severity: "warning",
                });
            if (holderDist && holderDist.topHolderPct > 50)
                baseTimeline.push({
                    timestamp: Date.now(),
                    relativeMs: Date.now() - pAt,
                    event: `Top holder owns ${holderDist.topHolderPct.toFixed(0)}% of supply`,
                    severity: "warning",
                });
            if (contractAnalysis?.ownershipRenounced === true)
                baseTimeline.push({
                    timestamp: Date.now(),
                    relativeMs: Date.now() - pAt,
                    event: "Ownership renounced",
                    severity: "ok",
                });
            baseTimeline.sort((a, b) => a.timestamp - b.timestamp);

            _signalCache.set(cacheKey, {
                holderSignal,
                deployerSignal,
                contractSignal,
                baseTimeline,
                fetchedAt: Date.now(),
            });
        })
        .finally(() => {
            _inflight.delete(cacheKey);
        });

    _inflight.set(cacheKey, promise);
    return promise;
}

/**
 * Background pre-computation of safety signals for a pair.
 * Runs through the low-priority semaphore so it never blocks interactive scoring.
 * Populates _signalCache so clicking the pair renders instantly.
 */
export function prefetchSafetyScore(pairData: NewPairData, chainName: string): void {
    if (!getChainCaps(chainName.replace(/_/g, "-").toLowerCase()).restApi) return;
    // Skip if already cached or in-flight
    const cacheKey = `${chainName}:${pairData.pair_address.toLowerCase()}`;
    if (_inflight.has(cacheKey)) return;
    const cached = _signalCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < SIGNAL_CACHE_TTL) return;
    withPrefetchSemaphore(() => _startComputation(pairData, chainName)).catch(() => {});
}

export function useSafetyScore(
    pairData: NewPairData | null | undefined,
    chainName: string,
    metrics: PairMetrics | null | undefined,
    /** When false, only read from cache — do NOT fire REST calls. Use for table badges. */
    eager = true
): SafetyScore {
    const pairedAt = pairData ? new Date(pairData.block_signed_at).getTime() : 0;
    const [score, setScore] = useState<SafetyScore>(() => {
        if (!pairData) return makeSkeleton("", 0);
        const normChain = chainName.replace(/_/g, "-").toLowerCase();
        const addr = pairData.pair_address.toLowerCase();
        _ensureBadgeChainLoaded(normChain);
        const badgeCached = _badgeScores.get(`${normChain}:${addr}`);
        const skeleton = makeSkeleton(addr, pairedAt);
        if (badgeCached) return { ...skeleton, total: badgeCached.total, riskLevel: badgeCached.riskLevel };
        return skeleton;
    });

    useEffect(() => {
        if (!pairData) return;
        const key = pairData.pair_address.toLowerCase();
        const pAt = new Date(pairData.block_signed_at).getTime();

        // Phase 1 — immediate (stream data only, zero API calls)
        const liqSignal = computeLiquiditySignal(pairData);
        const tradingSignal = computeTradingSignal(metrics);

        // Phase 1 partial: liquidity + trading available immediately.
        // Keep riskLevel LOADING so alert logic (which skips LOADING) doesn't fire on
        // the partial score. The badge reads total > 0 to show a number during loading.
        const partialTotal = liqSignal.score + tradingSignal.score + 10 + 10 + 10;
        const partial: SafetyScore = {
            pairAddress: key,
            total: partialTotal,
            signals: {
                liquidity: liqSignal,
                holders: { ...LOADING_SIGNAL, label: "HOLDERS" },
                deployer: { ...LOADING_SIGNAL, label: "DEPLOYER" },
                contract: { ...LOADING_SIGNAL, label: "CONTRACT" },
                trading: tradingSignal,
            },
            riskLevel: "LOADING",
            timeline: [{ timestamp: pAt, relativeMs: 0, event: "Pair created", severity: "info" }],
            lastUpdated: Date.now(),
        };
        setScore(partial);

        // Check module-level cache before firing REST calls
        const cacheKey = `${chainName}:${key}`;
        const cached = _signalCache.get(cacheKey);
        if (cached && Date.now() - cached.fetchedAt < SIGNAL_CACHE_TTL) {
            const freshLiq = computeLiquiditySignal(pairData);
            const freshTrading = computeTradingSignal(metrics);
            const cachedSignals = {
                liquidity: freshLiq,
                holders: cached.holderSignal,
                deployer: cached.deployerSignal,
                contract: cached.contractSignal,
                trading: freshTrading,
            };
            const cachedTotal = computeTotal(cachedSignals);
            const pending = _pendingEvents.get(key) ?? [];
            _pendingEvents.delete(key);
            const mergedTimeline = [...cached.baseTimeline, ...pending].sort((a, b) => a.timestamp - b.timestamp);
            const cachedRiskLevel = getRiskLevel(cachedTotal, false);
            setScore({
                pairAddress: key,
                total: cachedTotal,
                signals: cachedSignals,
                riskLevel: cachedRiskLevel,
                timeline: mergedTimeline,
                lastUpdated: Date.now(),
            });
            _persistBadgeScore(chainName.replace(/_/g, "-").toLowerCase(), key, cachedTotal, cachedRiskLevel);
            return;
        }

        // Phase 2 — fire REST calls only when eager (safety panel open).
        // Badge rows pass eager=false so they never trigger REST calls — they show
        // whatever is already in _signalCache / localStorage and stay there.
        if (!eager) return;

        const computePromise = _startComputation(pairData, chainName);

        // Both the creator and any concurrent subscribers update their own state
        // once the shared computation resolves.
        computePromise
            .then(() => {
                const result = _signalCache.get(cacheKey);
                if (!result) return;
                const freshLiqSignal = computeLiquiditySignal(pairData);
                const finalSignals = {
                    liquidity: freshLiqSignal,
                    holders: result.holderSignal,
                    deployer: result.deployerSignal,
                    contract: result.contractSignal,
                    trading: computeTradingSignal(metrics),
                };
                const total = computeTotal(finalSignals);
                const scoreEvents: RiskEvent[] = [];
                if (total < 30) {
                    scoreEvents.push({
                        timestamp: Date.now(),
                        relativeMs: Date.now() - pAt,
                        event: `Safety score: ${total}/100 — HIGH RISK`,
                        severity: "danger",
                    });
                } else if (total < 50) {
                    scoreEvents.push({
                        timestamp: Date.now(),
                        relativeMs: Date.now() - pAt,
                        event: `Safety score: ${total}/100 — CAUTION`,
                        severity: "warning",
                    });
                }
                const pending = _pendingEvents.get(key) ?? [];
                _pendingEvents.delete(key);
                const timeline = [...result.baseTimeline, ...scoreEvents, ...pending].sort(
                    (a, b) => a.timestamp - b.timestamp
                );
                const finalRiskLevel = getRiskLevel(total, false);
                setScore({
                    pairAddress: key,
                    total,
                    signals: finalSignals,
                    riskLevel: finalRiskLevel,
                    timeline,
                    lastUpdated: Date.now(),
                });
                _persistBadgeScore(chainName.replace(/_/g, "-").toLowerCase(), key, total, finalRiskLevel);
            })
            .catch(() => {});
    }, [pairData?.pair_address, chainName]);

    // Update trading signal as live metrics accumulate (no re-fetch).
    // Also merge any externally-pushed timeline events on this tick.
    useEffect(() => {
        if (!pairData) return;
        const key = pairData.pair_address.toLowerCase();

        // Drain pending timeline events first
        const pending = _pendingEvents.get(key);
        if (pending && pending.length > 0) {
            _pendingEvents.delete(key);
            setScore((prev) => {
                // Only merge after REST signals have loaded (partial LOADING state has no real timeline)
                if (prev.riskLevel === "LOADING") return prev;
                const merged = [...prev.timeline, ...pending].sort((a, b) => a.timestamp - b.timestamp);
                return { ...prev, timeline: merged, lastUpdated: Date.now() };
            });
        }

        if (!metrics) return;
        const tradingSignal = computeTradingSignal(metrics);
        setScore((prev) => {
            if (prev.riskLevel === "LOADING") return prev;
            if (prev.signals.trading.score === tradingSignal.score) return prev;
            const newSignals = { ...prev.signals, trading: tradingSignal };
            const total = computeTotal(newSignals);
            return {
                ...prev,
                total,
                signals: newSignals,
                riskLevel: getRiskLevel(total, false),
                lastUpdated: Date.now(),
            };
        });
    }, [metrics?.txTimestamps.length, metrics?.recentSpikeScore, metrics?.buys1h, metrics?.sells1h]);

    return score;
}
