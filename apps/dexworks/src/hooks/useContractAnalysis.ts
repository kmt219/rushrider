import { getChainCaps } from "../lib/chainCaps";
import { goldrushFetch } from "../lib/goldrushClient";
import type { ContractAnalysis } from "../scoring/contractSignal";
import { withSemaphore } from "./useDeployerReputation";
import { useEffect, useState } from "react";

const _cache = new Map<string, { analysis: ContractAnalysis; fetchedAt: number }>();
const _unsupported = new Set<string>();
const _unsupportedMeta = new Set<string>();
const _unsupportedEvents = new Set<string>(); // "chain:addr" tokens whose events endpoint 404s
const CACHE_TTL_MS = 5 * 60_000;

export function clearContractCache(): void {
    _cache.clear();
    _unsupported.clear();
    _unsupportedMeta.clear();
    _unsupportedEvents.clear();
}

// Standard ERC-20 / ownership event topic0 hashes
const OWNERSHIP_TRANSFERRED_TOPIC = "0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

interface EventItem {
    topics?: string[];
    tx_hash?: string;
}

interface EventsResponse {
    items?: EventItem[];
}

export async function fetchContractAnalysis(chainName: string, tokenAddress: string): Promise<ContractAnalysis> {
    const restChain = chainName.replace(/_/g, "-").toLowerCase();
    const addr = tokenAddress.toLowerCase();

    if (!getChainCaps(restChain).restApi) {
        return {
            ownershipRenounced: null,
            hasMintEvents: false,
            hasSellTxs: false,
            totalTxCount: 0,
            isSpam: null,
            isVerified: null,
        };
    }

    let items: EventItem[] = [];
    const eventsKey = `${restChain}:${addr}`;
    if (!_unsupportedEvents.has(eventsKey)) {
        const resp = await goldrushFetch<EventsResponse>(
            `${restChain}/events/address/${addr}/`,
            { "page-size": "200" },
            CACHE_TTL_MS
        ).catch((err: { status?: number }) => {
            if (err?.status === 404 || err?.status === 400 || err?.status === 501) {
                _unsupportedEvents.add(eventsKey);
            }
            return null;
        });
        items = resp?.items ?? [];
    }
    let ownershipRenounced: boolean | null = null;
    let hasMintEvents = false;
    let hasSellTxs = false;
    let transferCount = 0;
    let mintCount = 0;

    for (const ev of items) {
        const topic0 = (ev.topics?.[0] ?? "").toLowerCase();

        if (topic0 === OWNERSHIP_TRANSFERRED_TOPIC) {
            // topics[2] is the new owner (padded 32-byte address)
            const newOwner = (ev.topics?.[2] ?? "").toLowerCase();
            const isZero = newOwner.endsWith("0000000000000000000000000000000000000000") || newOwner.includes("dead");
            if (isZero) {
                ownershipRenounced = true;
            } else if (ownershipRenounced !== true) {
                ownershipRenounced = false;
            }
        }

        if (topic0 === TRANSFER_TOPIC) {
            transferCount++;
            const fromTopic = (ev.topics?.[1] ?? "").toLowerCase();
            // Mint: Transfer from 0x0
            const isFromZero = fromTopic.endsWith("0000000000000000000000000000000000000000");
            if (isFromZero) {
                mintCount++;
                if (mintCount > 1) hasMintEvents = true; // 2nd+ mint = post-launch
            } else {
                // The first non-mint Transfer is typically the initial LP add (deployer → pair).
                // Require ≥2 non-mint transfers before declaring sells confirmed.
                if (transferCount - mintCount >= 2) hasSellTxs = true;
            }
        }
    }

    // Fetch contract metadata for spam/verified flags
    const metaKey = `${restChain}:${addr}`;
    const metaResp = _unsupportedMeta.has(metaKey)
        ? null
        : await goldrushFetch<{ items?: Array<{ is_spam?: boolean; is_scam?: boolean }> }>(
              `${restChain}/tokens/${addr}/`,
              {},
              300_000
          ).catch((err: { status?: number }) => {
              if (err?.status === 404 || err?.status === 400 || err?.status === 501) _unsupportedMeta.add(metaKey);
              return null;
          });
    const metaItem = metaResp?.items?.[0] ?? null;
    const isSpam = metaItem ? Boolean(metaItem.is_spam || metaItem.is_scam) : null;
    const isVerified: boolean | null = null; // GoldRush token endpoint doesn't expose ABI verified flag directly

    return { ownershipRenounced, hasMintEvents, hasSellTxs, totalTxCount: transferCount, isSpam, isVerified };
}

export function useContractAnalysis(
    chainName: string,
    tokenAddress: string | null | undefined
): ContractAnalysis | null {
    const [analysis, setAnalysis] = useState<ContractAnalysis | null>(null);

    useEffect(() => {
        if (!tokenAddress) return;
        const key = `${chainName}:${tokenAddress.toLowerCase()}`;
        if (_unsupported.has(key)) return;

        const cached = _cache.get(key);
        if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
            setAnalysis(cached.analysis);
            return;
        }

        withSemaphore(() => fetchContractAnalysis(chainName, tokenAddress))
            .then((a) => {
                _cache.set(key, { analysis: a, fetchedAt: Date.now() });
                setAnalysis(a);
            })
            .catch((err: { status?: number }) => {
                if (err?.status === 404 || err?.status === 400 || err?.status === 501) _unsupported.add(key);
            });
    }, [chainName, tokenAddress]);

    return analysis;
}
