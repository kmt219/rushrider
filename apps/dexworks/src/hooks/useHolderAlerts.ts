/**
 * useHolderAlerts — fires toast notifications for holder-intelligence conditions:
 *   1. HHI concentration shift ≥15 points
 *   2. New cluster with combined supply ≥20%
 *   3. Top-5 holder estimated sell ≥25% of their position
 *   4. Existing cluster grows to ≥20% supply or gains ≥5pts (M6)
 *
 * Condition 3 tracks a per-address baseline on first data load and accumulates
 * estimated sell deltas. An alert fires once the cumulative drop crosses 25%.
 *
 * Returns an alerts array + a dismiss handler.
 * Alerts auto-dismiss after 6 seconds.
 */
import type { Cluster, ConcentrationData, HolderEvent } from "../types";
import { useCallback, useEffect, useRef, useState } from "react";

export type AlertLevel = "info" | "warn" | "danger";

export interface HolderAlertItem {
    id: string;
    level: AlertLevel;
    msg: string;
    at: number;
}

const AUTO_DISMISS_MS = 6_000;
const DEDUP_BUCKET_MS = 60_000; // one alert per condition per minute

export function useHolderAlerts(
    data: ConcentrationData | null,
    clusters: Cluster[],
    events: HolderEvent[]
): { alerts: HolderAlertItem[]; dismiss: (id: string) => void } {
    const [alerts, setAlerts] = useState<HolderAlertItem[]>([]);
    const prevHhiRef = useRef<number | null>(null);
    const prevClusterIdsRef = useRef<Set<string>>(new Set());
    const prevClusterPctRef = useRef<Map<string, number>>(new Map());
    const firedRef = useRef<Map<string, number>>(new Map()); // key → last fired ms

    // C3: baseline supply% per address + accumulated estimated sell deltas
    const baselineSupplyRef = useRef<Map<string, number>>(new Map());
    const cumulativeSellRef = useRef<Map<string, number>>(new Map());

    const push = useCallback((level: AlertLevel, msg: string, dedupeKey: string) => {
        const last = firedRef.current.get(dedupeKey) ?? 0;
        if (Date.now() - last < DEDUP_BUCKET_MS) return;
        firedRef.current.set(dedupeKey, Date.now());
        const id = `${dedupeKey}-${Date.now()}`;
        setAlerts((prev) => [...prev, { id, level, msg, at: Date.now() }].slice(-5));
        setTimeout(() => setAlerts((prev) => prev.filter((a) => a.id !== id)), AUTO_DISMISS_MS);
    }, []);

    // Snapshot baseline supply% on first data load
    useEffect(() => {
        if (!data || baselineSupplyRef.current.size > 0) return;
        const total = data.holderItems.reduce((s, h) => {
            try {
                return s + BigInt(h.balance);
            } catch {
                return s;
            }
        }, 0n);
        for (const item of data.holderItems) {
            try {
                const bal = BigInt(item.balance);
                const pct = total > 0n ? Number((bal * 10_000n) / total) / 100 : 0;
                baselineSupplyRef.current.set(item.address.toLowerCase(), pct);
            } catch {
                /* ignore */
            }
        }
    }, [data]);

    // Condition 1: HHI shift ≥15pts
    useEffect(() => {
        if (!data) return;
        if (prevHhiRef.current !== null) {
            const delta = data.hhi - prevHhiRef.current;
            if (Math.abs(delta) >= 15) {
                const dir = delta > 0 ? "spiked ▲" : "dropped ▼";
                push(
                    delta > 0 ? "warn" : "info",
                    `Concentration ${dir} ${Math.abs(delta).toFixed(0)}pts — HHI now ${data.hhi}`,
                    `hhi-shift`
                );
            }
        }
        prevHhiRef.current = data.hhi;
    }, [data, push]);

    // Condition 2: New cluster with combined supply ≥20%
    useEffect(() => {
        if (!data || clusters.length === 0) return;
        const total = data.holderItems.reduce((s, h) => {
            try {
                return s + BigInt(h.balance);
            } catch {
                return s;
            }
        }, 0n);

        for (const c of clusters) {
            const clusterBal = c.members.reduce((s, addr) => {
                const item = data.holderItems.find((h) => h.address === addr);
                if (!item) return s;
                try {
                    return s + BigInt(item.balance);
                } catch {
                    return s;
                }
            }, 0n);
            const pct = total > 0n ? Number((clusterBal * 10_000n) / total) / 100 : 0;

            if (!prevClusterIdsRef.current.has(c.id) && pct >= 20) {
                // Condition 2: brand-new cluster already at ≥20%
                push(
                    "warn",
                    `New cluster ${c.id} controls ${pct.toFixed(1)}% supply — ${c.explanation}`,
                    `cluster-${c.id}`
                );
            }

            // Condition 4 (M6): existing cluster crosses 20% or grows ≥5pts
            const prev = prevClusterPctRef.current.get(c.id);
            if (prev !== undefined && prevClusterIdsRef.current.has(c.id)) {
                const growth = pct - prev;
                if ((prev < 20 && pct >= 20) || growth >= 5) {
                    push(
                        "warn",
                        `Cluster ${c.id} supply grew to ${pct.toFixed(1)}% (+${growth.toFixed(1)}pts)`,
                        `cluster-growth-${c.id}`
                    );
                }
            }
            prevClusterPctRef.current.set(c.id, pct);
        }
        prevClusterIdsRef.current = new Set(clusters.map((c) => c.id));
    }, [clusters, data, push]);

    // Condition 3: Top-5 holder estimated cumulative sell ≥25% of their baseline position
    useEffect(() => {
        if (!data || events.length === 0) return;
        const latest = events[0];
        if (!latest || latest.type !== "sell") return;
        const addr = latest.address.toLowerCase();
        const rank = data.holderItems.findIndex((h) => h.address.toLowerCase() === addr) + 1;
        if (rank < 1 || rank > 5) return;

        const baseline = baselineSupplyRef.current.get(addr) ?? 0;
        if (baseline === 0) return;

        // Estimate the sell delta as a fraction of their current USD position
        const holderUsd = data.holderItems[rank - 1]?.balance_quote ?? 0;
        const sellFraction =
            latest.valueUsd && latest.valueUsd > 0 && holderUsd > 0 ? latest.valueUsd / holderUsd : 0.01; // unknown amount: conservative 1% nudge

        const prev = cumulativeSellRef.current.get(addr) ?? 0;
        const next = Math.min(1, prev + sellFraction);
        cumulativeSellRef.current.set(addr, next);

        const dropPct = next * 100;
        if (dropPct >= 25) {
            push(
                "danger",
                `Top-${rank} holder sold ~${dropPct.toFixed(0)}% of position — ${addr.slice(0, 8)}…`,
                `top5-sell-${addr}`
            );
            // Reset accumulator after alert so it can re-fire if selling continues
            cumulativeSellRef.current.set(addr, 0);
        }
    }, [events, data, push]);

    const dismiss = useCallback((id: string) => {
        setAlerts((prev) => prev.filter((a) => a.id !== id));
    }, []);

    return { alerts, dismiss };
}
