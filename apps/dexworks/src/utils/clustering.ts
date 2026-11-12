/**
 * clustering.ts — Wallet cluster analysis engine.
 *
 * Three independent heuristics:
 *   1. Shared funder   — same gas-funder → same operator
 *   2. Temporal corr   — bought within same 5-min window
 *   3. Direct transfer — on-chain transfers between top-holder wallets
 *
 * Pure sync function — all API fetching is isolated in useWalletCluster.ts.
 */
import type { Cluster, ClusterReason, HolderItem, TransferEdge, TransferItem } from "../types";

/** 8 distinct cluster colors, purple-first to distinguish from risk-tier palette */
const CLUSTER_PALETTE = [
    "#a855f7", // purple
    "#3b82f6", // blue
    "#ec4899", // pink
    "#14b8a6", // teal
    "#f97316", // orange
    "#8b5cf6", // violet
    "#06b6d4", // cyan
    "#eab308", // yellow
];

function clusterColor(idx: number): string {
    return CLUSTER_PALETTE[idx % CLUSTER_PALETTE.length] ?? CLUSTER_PALETTE[0]!;
}

// ── Union-Find ────────────────────────────────────────────────────────────

class UnionFind {
    private parent = new Map<string, string>();

    find(x: string): string {
        if (!this.parent.has(x)) this.parent.set(x, x);
        const p = this.parent.get(x)!;
        if (p !== x) this.parent.set(x, this.find(p));
        return this.parent.get(x)!;
    }

    union(a: string, b: string): void {
        const ra = this.find(a);
        const rb = this.find(b);
        if (ra !== rb) this.parent.set(ra, rb);
    }

    groups(): Map<string, string[]> {
        const g = new Map<string, string[]>();
        for (const [k] of this.parent) {
            const root = this.find(k);
            const arr = g.get(root) ?? [];
            arr.push(k);
            g.set(root, arr);
        }
        return g;
    }
}

// ── Known exchange / router addresses to exclude from funder analysis ─────
const KNOWN_EXCHANGES = new Set([
    "0x7a250d5630b4cf539739df2c5dacb4c659f2488d", // uniswap v2 router
    "0xe592427a0aece92de3edee1f18e0157c05861564", // uniswap v3 router
    "0x1111111254eeb25477b68fb85ed929f73a960582", // 1inch v5
    "0x000000000022d473030f116ddee9f6b43ac78ba3", // permit2
    "0x0000000000000000000000000000000000000000",
]);

// ── Heuristic 1: Shared Funder ────────────────────────────────────────────

function sharedFunderClusters(
    holderAddrs: Set<string>,
    transfers: TransferItem[]
): Map<string, { members: Set<string>; confidence: number }> {
    // For each holder, find who funded them (sent ETH/tokens before their first buy)
    const funderMap = new Map<string, Set<string>>(); // funder → set of funded holders

    for (const tx of transfers) {
        const to = tx.to_address?.toLowerCase();
        const from = tx.from_address?.toLowerCase();
        if (!to || !from) continue;
        if (!holderAddrs.has(to)) continue;
        if (KNOWN_EXCHANGES.has(from)) continue;
        if (from === to) continue;

        let funded = funderMap.get(from);
        if (!funded) {
            funded = new Set();
            funderMap.set(from, funded);
        }
        funded.add(to);
    }

    const result = new Map<string, { members: Set<string>; confidence: number }>();
    let idx = 0;
    for (const [funder, funded] of funderMap) {
        if (funded.size < 2) continue;
        const members = [...funded].filter((a) => holderAddrs.has(a));
        if (members.length < 2) continue;
        result.set(`sf_${funder}`, {
            members: new Set(members),
            confidence: Math.min(0.95, 0.5 + 0.1 * members.length),
        });
        idx++;
    }
    return result;
}

// ── Heuristic 2: Temporal Correlation ────────────────────────────────────

function temporalClusters(
    holderAddrs: Set<string>,
    transfers: TransferItem[]
): Map<string, { members: Set<string>; confidence: number }> {
    // Collect first-receive timestamps per holder
    const firstReceive = new Map<string, number>();
    for (const tx of transfers) {
        const to = tx.to_address?.toLowerCase();
        if (!to || !holderAddrs.has(to)) continue;
        const ts = new Date(tx.block_signed_at).getTime();
        if (!firstReceive.has(to) || ts < firstReceive.get(to)!) {
            firstReceive.set(to, ts);
        }
    }

    const sorted = [...firstReceive.entries()].sort((a, b) => a[1] - b[1]);
    const WINDOW_MS = 5 * 60 * 1000; // 5 min
    const result = new Map<string, { members: Set<string>; confidence: number }>();

    for (let i = 0; i < sorted.length; i++) {
        const anchor = sorted[i];
        if (!anchor) continue;
        const window: string[] = [anchor[0]];
        for (let j = i + 1; j < sorted.length; j++) {
            const entry = sorted[j];
            if (!entry || entry[1] - anchor[1] > WINDOW_MS) break;
            window.push(entry[0]);
        }
        if (window.length >= 2) {
            const key = `tc_${anchor[1]}`;
            result.set(key, { members: new Set(window), confidence: 0.6 });
        }
    }
    return result;
}

// ── Heuristic 3: Direct Transfer Graph ───────────────────────────────────

function directTransferClusters(
    holderAddrs: Set<string>,
    transfers: TransferItem[]
): Map<string, { members: Set<string>; confidence: number }> {
    const uf = new UnionFind();
    for (const tx of transfers) {
        const from = tx.from_address?.toLowerCase();
        const to = tx.to_address?.toLowerCase();
        if (!from || !to) continue;
        if (holderAddrs.has(from) && holderAddrs.has(to) && from !== to) {
            uf.union(from, to);
        }
    }

    const result = new Map<string, { members: Set<string>; confidence: number }>();
    let idx = 0;
    for (const [, group] of uf.groups()) {
        const inHolder = group.filter((a) => holderAddrs.has(a));
        if (inHolder.length >= 2) {
            result.set(`dt_${idx++}`, { members: new Set(inHolder), confidence: 0.9 });
        }
    }
    return result;
}

// ── Merge + emit final Cluster[] ─────────────────────────────────────────

export function buildClusters(holderItems: HolderItem[], transfers: TransferItem[]): Cluster[] {
    const holderAddrs = new Set(holderItems.map((h) => h.address.toLowerCase()));

    const sfMap = sharedFunderClusters(holderAddrs, transfers);
    const tcMap = temporalClusters(holderAddrs, transfers);
    const dtMap = directTransferClusters(holderAddrs, transfers);

    // Merge all raw clusters via union-find, keep highest confidence + reason
    const uf = new UnionFind();
    const reasonMap = new Map<string, { confidence: number; reason: ClusterReason }>();

    const processMap = (map: Map<string, { members: Set<string>; confidence: number }>, reason: ClusterReason) => {
        for (const [, { members, confidence }] of map) {
            const arr = [...members];
            const first = arr[0];
            if (!first) continue;
            for (let i = 1; i < arr.length; i++) uf.union(first, arr[i]!);
            for (const addr of arr) {
                if (!addr) continue;
                const existing = reasonMap.get(uf.find(addr));
                if (!existing || confidence > existing.confidence) {
                    reasonMap.set(uf.find(addr), { confidence, reason });
                }
            }
        }
    };

    processMap(sfMap, "shared_funder");
    processMap(tcMap, "temporal_correlation");
    processMap(dtMap, "direct_transfer");

    const clusters: Cluster[] = [];
    let colorIdx = 0;

    for (const [root, group] of uf.groups()) {
        const members = group.filter((a) => holderAddrs.has(a));
        if (members.length < 2) continue;

        const meta = reasonMap.get(root) ?? { confidence: 0.6, reason: "temporal_correlation" as ClusterReason };

        const reasonLabel: Record<ClusterReason, string> = {
            shared_funder: "same gas funder",
            temporal_correlation: `bought within 5-min window`,
            direct_transfer: "direct on-chain transfers between wallets",
        };

        clusters.push({
            id: `C${colorIdx}`,
            members,
            confidence: meta.confidence,
            reason: meta.reason,
            explanation: `${members.length} wallets linked by ${reasonLabel[meta.reason]}`,
            color: clusterColor(colorIdx),
        });
        colorIdx++;
    }

    // For shared_funder clusters: attach the funder address and improve explanation
    for (const cluster of clusters) {
        if (cluster.reason !== "shared_funder") continue;
        const memberSet = new Set(cluster.members);
        let bestFunder = "";
        let bestOverlap = 0;
        for (const [key, { members: funded }] of sfMap) {
            const funder = key.slice(3); // "sf_0x123…" → "0x123…"
            const overlap = [...funded].filter((m) => memberSet.has(m)).length;
            if (overlap > bestOverlap) {
                bestOverlap = overlap;
                bestFunder = funder;
            }
        }
        if (bestFunder) {
            cluster.fundingAddress = bestFunder;
            cluster.explanation = `${cluster.members.length} wallets funded by ${bestFunder.slice(0, 6)}…${bestFunder.slice(-4)}`;
        }
    }

    // Sort by confidence desc
    clusters.sort((a, b) => b.confidence - a.confidence);
    return clusters;
}

/**
 * Extract directed transfer edges between top-holder addresses.
 * Only holder→holder transfers are included; external addresses are ignored.
 */
export function buildEdges(holderItems: HolderItem[], transfers: TransferItem[]): TransferEdge[] {
    const holderAddrs = new Set(holderItems.map((h) => h.address.toLowerCase()));
    const counts = new Map<string, number>();

    for (const tx of transfers) {
        const from = tx.from_address?.toLowerCase();
        const to = tx.to_address?.toLowerCase();
        if (!from || !to || from === to) continue;
        if (!holderAddrs.has(from) || !holderAddrs.has(to)) continue;
        const key = `${from}→${to}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return Array.from(counts.entries()).map(([key, count]) => {
        const sep = key.indexOf("→");
        return { from: key.slice(0, sep), to: key.slice(sep + 1), count };
    });
}
