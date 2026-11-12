import { getChainCaps } from "../lib/chainCaps";
import { goldrushFetch } from "../lib/goldrushClient";
import type { DeployerProfile } from "../scoring/deployerSignal";
import { useEffect, useState } from "react";

const _cache = new Map<string, { profile: DeployerProfile; fetchedAt: number }>();
const _unsupported = new Set<string>();
const CACHE_TTL_MS = 30 * 60_000; // 30 min — deployer history doesn't change

export function clearDeployerCache(): void {
    _cache.clear();
    _unsupported.clear();
}

// Shared semaphore: max 5 concurrent REST calls for user-triggered safety scoring
let _active = 0;
const _queue: Array<() => void> = [];

export async function withSemaphore<T>(fn: () => Promise<T>): Promise<T> {
    if (_active >= 5) {
        await new Promise<void>((resolve) => _queue.push(resolve));
    }
    _active++;
    try {
        return await fn();
    } finally {
        _active--;
        const next = _queue.shift();
        if (next) next();
    }
}

// Low-priority background semaphore: max 2 concurrent — used by prefetchSafetyScore so
// background warm-up jobs never block the user-triggered (withSemaphore) path.
let _bgActive = 0;
const _bgQueue: Array<() => void> = [];

export async function withPrefetchSemaphore<T>(fn: () => Promise<T>): Promise<T> {
    if (_bgActive >= 2) {
        await new Promise<void>((resolve) => _bgQueue.push(resolve));
    }
    _bgActive++;
    try {
        return await fn();
    } finally {
        _bgActive--;
        const next = _bgQueue.shift();
        if (next) next();
    }
}

interface TxItem {
    block_signed_at?: string;
    to_address?: string | null;
    from_address?: string;
    value?: string;
    successful?: boolean;
}

interface TxResponse {
    items?: TxItem[];
}

interface BalanceItem {
    contract_address?: string;
}

interface BalancesResponse {
    items?: BalanceItem[];
}

export async function fetchDeployerProfile(chainName: string, deployerAddress: string): Promise<DeployerProfile> {
    const restChain = chainName.replace(/_/g, "-").toLowerCase();
    const addr = deployerAddress.toLowerCase();

    if (!getChainCaps(restChain).restApi) {
        return {
            walletAgeDays: 0,
            tokenCount: 0,
            portfolioSize: 0,
            rugPatterns: 0,
            deploysLast30d: 0,
            failedTxCount: 0,
        };
    }

    const [txRes, balRes] = await Promise.allSettled([
        goldrushFetch<TxResponse>(
            `${restChain}/address/${addr}/transactions_v3/`,
            { "page-size": "200" },
            CACHE_TTL_MS
        ),
        goldrushFetch<BalancesResponse>(`${restChain}/address/${addr}/balances_v2/`, {}, CACHE_TTL_MS),
    ]);

    const txData = txRes.status === "fulfilled" ? txRes.value : null;
    const balData = balRes.status === "fulfilled" ? balRes.value : null;

    // Wallet age from the oldest transaction
    let walletAgeDays = 0;
    if (txData?.items && txData.items.length > 0) {
        const oldest = txData.items[txData.items.length - 1];
        if (oldest?.block_signed_at) {
            walletAgeDays = Math.floor((Date.now() - new Date(oldest.block_signed_at).getTime()) / 86_400_000);
        }
    }

    // Contract-creation txs (to_address is null/empty) = tokens deployed
    const deployTimes: number[] = [];
    const largeTxTimes: number[] = [];

    for (const tx of txData?.items ?? []) {
        const isContractCreate = !tx.to_address || tx.to_address === "0x" || tx.to_address === "";
        if (isContractCreate && tx.block_signed_at) {
            deployTimes.push(new Date(tx.block_signed_at).getTime());
        }
        // Large native value tx FROM the deployer = possible LP removal
        if (tx.from_address?.toLowerCase() === addr && tx.value) {
            try {
                if (BigInt(tx.value) > 0n && tx.block_signed_at) {
                    largeTxTimes.push(new Date(tx.block_signed_at).getTime());
                }
            } catch {
                // malformed value — ignore
            }
        }
    }

    // Exclude the current deploy (last in the list chronologically)
    const priorDeployTimes = deployTimes.slice(0, -1);
    const tokenCount = priorDeployTimes.length;

    // Rug pattern: for each prior deploy, did a large value tx follow within 24h?
    // Also detects LP-removal-like patterns: any outbound tx with value > 0 shortly after deploy.
    let rugPatterns = 0;
    for (const deployTime of priorDeployTimes) {
        const hasRug = largeTxTimes.some((t) => t > deployTime && t < deployTime + 86_400_000);
        if (hasRug) rugPatterns++;
    }

    const portfolioSize = balData?.items?.length ?? 0;

    const thirtyDaysAgo = Date.now() - 30 * 86_400_000;
    // Exclude current deploy for consistency with tokenCount
    const deploysLast30d = priorDeployTimes.filter((t) => t > thirtyDaysAgo).length;
    const failedTxCount = txData?.items?.filter((tx: { successful?: boolean }) => tx.successful === false).length ?? 0;

    return { walletAgeDays, tokenCount, portfolioSize, rugPatterns, deploysLast30d, failedTxCount };
}

export function useDeployerReputation(
    chainName: string,
    deployerAddress: string | null | undefined
): DeployerProfile | null {
    const [profile, setProfile] = useState<DeployerProfile | null>(null);

    useEffect(() => {
        if (!deployerAddress) return;
        const key = `${chainName}:${deployerAddress.toLowerCase()}`;
        if (_unsupported.has(key)) return;

        const cached = _cache.get(key);
        if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
            setProfile(cached.profile);
            return;
        }

        withSemaphore(() => fetchDeployerProfile(chainName, deployerAddress))
            .then((p) => {
                _cache.set(key, { profile: p, fetchedAt: Date.now() });
                setProfile(p);
            })
            .catch((err: { status?: number }) => {
                if (err?.status === 404 || err?.status === 400 || err?.status === 501) _unsupported.add(key);
            });
    }, [chainName, deployerAddress]);

    return profile;
}
