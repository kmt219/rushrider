/**
 * useHolderMap — D3 force-directed simulation for the holder bubble map.
 *
 * Architecture:
 *   - D3 simulation runs in a useRef, mutating SimNode objects in-place.
 *   - On each simulation tick, positions are copied to nodesRef.current (HolderNode[]).
 *   - A RAF loop flushes the dirty flag to a `tick` counter state once per frame.
 *   - React reads nodesRef.current[].x/y on each `tick` re-render.
 *   - No React state is allocated per simulation tick — only the uint counter increments.
 *
 * This achieves 60fps animation without flooding React's scheduler.
 */
import type { Cluster, ConcentrationData, HolderNode } from "../types";
import { DEAD_ADDRESSES } from "../utils/concentration";
import { forceCenter, forceCollide, forceManyBody, forceSimulation } from "d3-force";
import { useCallback, useEffect, useRef, useState } from "react";

// D3 mutates these fields onto simulation nodes at runtime.
interface SimulationNodeDatum {
    index?: number;
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
    fx?: number | null;
    fy?: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D3Simulation = any;

/** D3 simulation node — kept separate from HolderNode so D3 only mutates its own objects. */
interface SimNode extends SimulationNodeDatum {
    idx: number;
    address: string;
    radius: number;
}

function riskTier(pct: number): HolderNode["riskTier"] {
    if (pct >= 10) return "whale";
    if (pct >= 3) return "large";
    if (pct >= 0.5) return "medium";
    return "small";
}

function tierColor(tier: HolderNode["riskTier"]): string {
    const map: Record<HolderNode["riskTier"], string> = {
        whale: "var(--danger, #ef4444)",
        large: "var(--warning, #f59e0b)",
        medium: "var(--warning-soft, #fbbf24)",
        small: "var(--accent, #00d084)",
    };
    return map[tier];
}

function shortAddr(addr: string): string {
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export interface UseHolderMapReturn {
    /** Stable ref — read positions from this in the SVG render. */
    nodesRef: React.MutableRefObject<HolderNode[]>;
    /** Increments on every animation frame where positions changed. Use as SVG data-tick. */
    tick: number;
    /** Whether the simulation is still cooling down. */
    isRunning: boolean;
    /**
     * Phase 4 hook-in: called by useHolderStream when a holder event arrives.
     * Sets lastActivity/activityAt on the node and reheats the simulation slightly.
     */
    triggerPulse: (address: string, type: "buy" | "sell" | "transfer") => void;
    /**
     * Phase 4 hook-in: updates a bubble's radius when a live buy/sell arrives.
     * If valueUsd and balance_quote are available, computes a real proportional
     * delta; otherwise falls back to a small fixed nudge.
     */
    updateBalance: (address: string, direction: "buy" | "sell", valueUsd?: number) => void;
    /**
     * Phase 3 hook-in: called after useWalletCluster resolves.
     * Assigns clusterIds to nodes and applies a cluster cohesion force.
     */
    applyClusterAssignments: (clusters: Cluster[]) => void;
    /**
     * Restarts the simulation so drag pin changes (fx/fy) are reflected visually.
     * Call this when the user starts dragging a bubble.
     */
    reheat: () => void;
}

export function useHolderMap(
    data: ConcentrationData | null,
    containerWidth: number,
    containerHeight: number
): UseHolderMapReturn {
    const [tick, setTick] = useState(0);
    const [isRunning, setIsRunning] = useState(false);

    const nodesRef = useRef<HolderNode[]>([]);
    const simRef = useRef<D3Simulation>(null);
    const simNodesRef = useRef<SimNode[]>([]);
    const rafRef = useRef<number | null>(null);
    const dirtyRef = useRef(false);
    const isRunningRef = useRef(false); // mirror of isRunning state for RAF access
    const clustersRef = useRef<Cluster[]>([]);
    const containerWidthRef = useRef(containerWidth);
    const containerHeightRef = useRef(containerHeight);
    const prevAddrsRef = useRef<Set<string>>(new Set());

    // Keep container size refs current so updateBalance can access latest dims.
    useEffect(() => {
        containerWidthRef.current = containerWidth;
        containerHeightRef.current = containerHeight;
    }, [containerWidth, containerHeight]);

    useEffect(() => {
        if (!data || data.holderItems.length === 0 || containerWidth === 0 || containerHeight === 0) return;

        const items = data.holderItems.filter((h) => !DEAD_ADDRESSES.has(h.address));
        if (items.length === 0) return;

        const balances = items.map((h) => {
            try {
                return BigInt(h.balance);
            } catch {
                return 0n;
            }
        });
        const total = balances.reduce((a, b) => a + b, 0n);

        // Radius: proportional to sqrt(supplyPct), capped so the largest bubble ≤ 18% of container
        const maxR = Math.min(containerWidth, containerHeight) * 0.18;
        const calcRadius = (pct: number) => Math.max(5, Math.sqrt(pct / 100) * maxR);

        const nodes: HolderNode[] = items.map((item, i) => {
            const bal = balances[i] ?? 0n;
            const pct = total > 0n ? Number((bal * 10_000n) / total) / 100 : 0;
            const tier = riskTier(pct);
            return {
                address: item.address,
                balance: bal,
                balance_quote: item.balance_quote,
                supplyPct: pct,
                rank: i + 1,
                riskTier: tier,
                radius: calcRadius(pct),
                color: tierColor(tier),
                label: shortAddr(item.address),
                clusterIds: [],
                x: containerWidth / 2 + (Math.random() - 0.5) * 60,
                y: containerHeight / 2 + (Math.random() - 0.5) * 60,
                vx: 0,
                vy: 0,
                fx: null,
                fy: null,
                lastActivity: null,
                activityAt: 0,
            };
        });

        // Mark nodes that weren't in the previous render as entering (A5 fade-in).
        const prevAddrs = prevAddrsRef.current;
        for (const n of nodes) {
            if (!prevAddrs.has(n.address)) n.entering = true;
        }
        prevAddrsRef.current = new Set(nodes.map((n) => n.address));
        // Clear entering flag after animation duration (600ms).
        const enteringTimer = setTimeout(() => {
            for (const n of nodesRef.current) n.entering = false;
            dirtyRef.current = true;
        }, 600);

        nodesRef.current = nodes;

        // D3 works on its own shallow sim node objects — positions are copied back to nodesRef on tick
        const simNodes: SimNode[] = nodes.map((n, i) => ({
            idx: i,
            address: n.address,
            radius: n.radius,
            x: n.x,
            y: n.y,
        }));
        simNodesRef.current = simNodes;

        simRef.current?.stop();
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }

        const sim: D3Simulation = forceSimulation<SimNode>(simNodes)
            .force("center", forceCenter(containerWidth / 2, containerHeight / 2).strength(0.06))
            .force(
                "collide",
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                forceCollide<SimNode>((d: any) => d.radius + 3)
                    .strength(0.85)
                    .iterations(3)
            )
            .force("charge", forceManyBody<SimNode>().strength(-25).distanceMax(200))
            .alphaDecay(0.015)
            .on("tick", () => {
                applyClusterForce();
                for (const sn of simNodes) {
                    const n = nodesRef.current[sn.idx];
                    if (!n) continue;
                    n.x = sn.x ?? containerWidth / 2;
                    n.y = sn.y ?? containerHeight / 2;
                    // Sync drag pin from HolderNode back to SimNode
                    sn.fx = n.fx;
                    sn.fy = n.fy;
                }
                dirtyRef.current = true;
            })
            .on("end", () => {
                isRunningRef.current = false;
                setIsRunning(false);
            });

        simRef.current = sim;
        isRunningRef.current = true;
        setIsRunning(true);

        // Re-apply existing cluster assignments if any (e.g. container resize)
        if (clustersRef.current.length > 0) {
            applyClusterAssignmentsInternal(clustersRef.current);
        }

        // RAF flush: setState at most once per frame, only when positions changed.
        // Loop stops automatically when idle (sim cooled + no dirty flag) and
        // restarts on the next reheat/pulse/updateBalance call.
        const flush = () => {
            if (dirtyRef.current) {
                dirtyRef.current = false;
                setTick((t) => t + 1);
            }
            if (isRunningRef.current || dirtyRef.current) {
                rafRef.current = requestAnimationFrame(flush);
            } else {
                rafRef.current = null;
            }
        };
        rafRef.current = requestAnimationFrame(flush);

        return () => {
            sim.stop();
            clearTimeout(enteringTimer);
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, [data, containerWidth, containerHeight]);

    /** Cluster cohesion force: nudge members toward their cluster centroid */
    function applyClusterForce() {
        const clusters = clustersRef.current;
        if (clusters.length === 0) return;
        const nodes = nodesRef.current;
        const simNodes = simNodesRef.current;

        for (const cluster of clusters) {
            const memberSimNodes = simNodes.filter((sn) => {
                const n = nodes[sn.idx];
                return n && n.clusterIds.includes(cluster.id);
            });
            if (memberSimNodes.length < 2) continue;

            const cx = memberSimNodes.reduce((s, n) => s + (n.x ?? 0), 0) / memberSimNodes.length;
            const cy = memberSimNodes.reduce((s, n) => s + (n.y ?? 0), 0) / memberSimNodes.length;

            const strength = 0.04;
            for (const sn of memberSimNodes) {
                sn.vx = (sn.vx ?? 0) + (cx - (sn.x ?? 0)) * strength;
                sn.vy = (sn.vy ?? 0) + (cy - (sn.y ?? 0)) * strength;
            }
        }
    }

    function applyClusterAssignmentsInternal(clusters: Cluster[]) {
        const nodes = nodesRef.current;
        for (const n of nodes) {
            n.clusterIds = clusters.filter((c) => c.members.includes(n.address)).map((c) => c.id);
        }
        dirtyRef.current = true;
        simRef.current?.alpha(0.3).restart();
        isRunningRef.current = true;
        setIsRunning(true);
        ensureRaf();
    }

    /** Restarts the RAF loop if it has stopped (idle). No-op if already running. */
    function ensureRaf() {
        if (rafRef.current !== null) return;
        const flush = () => {
            if (dirtyRef.current) {
                dirtyRef.current = false;
                setTick((t) => t + 1);
            }
            if (isRunningRef.current || dirtyRef.current) {
                rafRef.current = requestAnimationFrame(flush);
            } else {
                rafRef.current = null;
            }
        };
        rafRef.current = requestAnimationFrame(flush);
    }

    /** Called after useWalletCluster resolves to inject cluster memberships. */
    const applyClusterAssignments = useCallback((clusters: Cluster[]) => {
        clustersRef.current = clusters;
        applyClusterAssignmentsInternal(clusters);
    }, []);

    /** Called by useHolderStream (Phase 4) to pulse a bubble on live trade events. */
    const triggerPulse = useCallback((address: string, type: "buy" | "sell" | "transfer") => {
        const n = nodesRef.current.find((nd) => nd.address === address.toLowerCase());
        if (!n) return;
        n.lastActivity = type;
        n.activityAt = Date.now();
        dirtyRef.current = true;
        simRef.current?.alpha(0.08).restart();
        isRunningRef.current = true;
        setIsRunning(true);
        ensureRaf();
    }, []);

    /** Restarts the simulation so fx/fy drag pins are reflected visually. */
    const reheat = useCallback(() => {
        simRef.current?.alpha(0.3).restart();
        dirtyRef.current = true;
        isRunningRef.current = true;
        setIsRunning(true);
        ensureRaf();
    }, []);

    /**
     * Updates a bubble's supply % and radius when a live buy/sell arrives.
     * If valueUsd + balance_quote are both available, computes a real proportional
     * delta (valueUsd / balance_quote * supplyPct). Otherwise falls back to a
     * small fixed nudge (±0.15%) so the map stays reactive.
     */
    const updateBalance = useCallback((address: string, direction: "buy" | "sell", valueUsd?: number) => {
        const n = nodesRef.current.find((nd) => nd.address === address.toLowerCase());
        if (!n) return;

        let delta: number;
        if (valueUsd && valueUsd > 0 && n.balance_quote && n.balance_quote > 0) {
            // Real proportional estimate: trade value as fraction of current position
            delta = (valueUsd / n.balance_quote) * n.supplyPct;
            // Cap at 50% of current position to avoid extreme swings from noisy data
            delta = Math.min(delta, n.supplyPct * 0.5);
        } else {
            delta = n.supplyPct * 0.0015; // fixed 0.15% of current position
        }

        n.supplyPct = direction === "sell" ? Math.max(0.005, n.supplyPct - delta) : Math.min(100, n.supplyPct + delta);

        const maxR = Math.min(containerWidthRef.current, containerHeightRef.current) * 0.18;
        const newRadius = Math.max(5, Math.sqrt(n.supplyPct / 100) * maxR);
        n.radius = newRadius;
        // Sync radius on the D3 sim node so collision detection stays accurate.
        const sn = simNodesRef.current.find((s) => s.address === address.toLowerCase());
        if (sn) sn.radius = newRadius;
        dirtyRef.current = true;
        ensureRaf();
    }, []);

    return { nodesRef, tick, isRunning, triggerPulse, updateBalance, applyClusterAssignments, reheat };
}
