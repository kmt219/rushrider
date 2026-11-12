import { HL_INFO_URL } from "../constants";
import { GOLDRUSH_CHAIN, IS_GOLDRUSH_ACTIVE, useGoldRushClient } from "../context/GoldRushContext";
import { buildChartOHLCVQuery } from "../queries";
import type { HIP3Market } from "../types";
import type { Client } from "graphql-ws";
import { Grid3X3 } from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";

type HeatmapTf = "1H" | "4H" | "24H" | "1W" | "1M";

const TF_OPTIONS: HeatmapTf[] = ["1H", "4H", "24H", "1W", "1M"];
const TOP_N = 14;
const COINS_PER_SECTOR = 5;

// GoldRush supports up to ONE_HOUR/ONE_DAY — 1W and 1M must use HL REST directly.
// Maps heatmap timeframe → buildChartOHLCVQuery tf param (null = not supported).
const GR_TF: Partial<Record<HeatmapTf, string>> = { "1H": "5m", "4H": "1h" };

// HL REST candleSnapshot params per timeframe
const HL_PARAMS: Partial<Record<HeatmapTf, { interval: string; lookbackMs: number }>> = {
    "1H": { interval: "5m", lookbackMs: 3_600_000 },
    "4H": { interval: "1h", lookbackMs: 14_400_000 },
    "1W": { interval: "1d", lookbackMs: 7 * 86_400_000 },
    "1M": { interval: "1d", lookbackMs: 30 * 86_400_000 },
};

interface SectorHeatmapProps {
    markets: HIP3Market[];
}

interface SectorBucket {
    weightedSum24h: number;
    totalVolume: number;
    count: number;
    topCoins: { coin: string; volume: number }[];
}

interface GRCandle {
    timestamp: string;
    open: number;
    close: number;
}

function getSectorKey(m: HIP3Market): string {
    if (m.marketClass === "hip-3") return "HIP-3";
    if (m.marketClass === "spot") return "Spot";
    if (m.marketClass === "pre-launch") return "Pre-launch";
    return m.category || "Other";
}

/** One-shot GoldRush subscription: subscribes, waits for first batch, unsubscribes.
 *  Returns null if GoldRush has no data or times out — caller falls back to HL REST. */
function fetchCoinChangeViaGoldRush(
    client: Client,
    coin: string,
    grTf: string,
    heatmapTf: HeatmapTf
): Promise<number | null> {
    return new Promise((resolve) => {
        let unsubscribe = () => {};
        const timer = setTimeout(() => {
            unsubscribe();
            resolve(null);
        }, 6_000);

        unsubscribe = client.subscribe<{ ohlcvCandlesForToken?: GRCandle[] }>(
            { query: buildChartOHLCVQuery(GOLDRUSH_CHAIN, coin, grTf) },
            {
                next: ({ data }) => {
                    clearTimeout(timer);
                    unsubscribe();
                    let candles = data?.ohlcvCandlesForToken ?? [];
                    if (candles.length === 0) {
                        resolve(null);
                        return;
                    }

                    // 4H: GoldRush returns 24h of hourly candles — trim to last 4h
                    if (heatmapTf === "4H") {
                        const cutoff = Date.now() - 14_400_000;
                        candles = candles.filter((c) => new Date(c.timestamp).getTime() >= cutoff);
                    }
                    if (candles.length === 0) {
                        resolve(null);
                        return;
                    }

                    const first = candles[0]!;
                    const last = candles[candles.length - 1]!;
                    resolve(first.open > 0 ? (last.close - first.open) / first.open : null);
                },
                error: () => {
                    clearTimeout(timer);
                    unsubscribe();
                    resolve(null);
                },
                complete: () => {
                    clearTimeout(timer);
                    resolve(null);
                },
            }
        );
    });
}

/** HL REST candleSnapshot fallback. */
async function fetchCoinChangeViaHL(coin: string, interval: string, startTime: number): Promise<number | null> {
    try {
        const res = await fetch(HL_INFO_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "candleSnapshot", req: { coin, interval, startTime } }),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { t: number; o: string; c: string }[];
        if (!Array.isArray(data) || data.length < 1) return null;
        const first = data[0]!;
        const last = data[data.length - 1]!;
        const firstOpen = parseFloat(first.o);
        const lastClose = parseFloat(last.c);
        return firstOpen > 0 ? (lastClose - firstOpen) / firstOpen : null;
    } catch {
        return null;
    }
}

/** GoldRush-primary fetch with HL REST fallback. */
async function fetchCoinChange(client: Client | null, coin: string, tf: HeatmapTf): Promise<number | null> {
    const hlParams = HL_PARAMS[tf];
    if (!hlParams) return null; // 24H handled separately

    const grTf = GR_TF[tf];

    // Try GoldRush first when active and timeframe is supported
    if (grTf && IS_GOLDRUSH_ACTIVE && client) {
        const grResult = await fetchCoinChangeViaGoldRush(client, coin, grTf, tf);
        if (grResult !== null) return grResult;
    }

    // Fall back to HL REST
    return fetchCoinChangeViaHL(coin, hlParams.interval, Date.now() - hlParams.lookbackMs);
}

export function SectorHeatmap({ markets }: SectorHeatmapProps) {
    const { client } = useGoldRushClient();
    const [tf, setTf] = useState<HeatmapTf>("24H");
    const [periodChanges, setPeriodChanges] = useState<Map<string, number>>(new Map());
    const [loading, setLoading] = useState(false);
    const fetchIdRef = useRef(0);

    const { buckets, topSectorNames } = useMemo(() => {
        const live = markets.filter((m) => m.markPx > 0 && m.volume24h > 0);
        const map = new Map<string, SectorBucket>();

        for (const m of live) {
            const key = getSectorKey(m);
            const prev = map.get(key) ?? { weightedSum24h: 0, totalVolume: 0, count: 0, topCoins: [] };
            prev.weightedSum24h += m.change24h * m.volume24h;
            prev.totalVolume += m.volume24h;
            prev.count += 1;
            prev.topCoins.push({ coin: m.coin, volume: m.volume24h });
            map.set(key, prev);
        }

        for (const b of map.values()) {
            b.topCoins.sort((a, c) => c.volume - a.volume);
            b.topCoins = b.topCoins.slice(0, COINS_PER_SECTOR);
        }

        const topSectors = [...map.entries()]
            .sort((a, b) => b[1].totalVolume - a[1].totalVolume)
            .slice(0, TOP_N)
            .map(([name]) => name);

        return { buckets: map, topSectorNames: topSectors };
    }, [markets]);

    const bucketsRef = useRef(buckets);
    bucketsRef.current = buckets;
    const topSectorNamesRef = useRef(topSectorNames);
    topSectorNamesRef.current = topSectorNames;
    const clientRef = useRef(client);
    clientRef.current = client;

    useEffect(() => {
        if (tf === "24H") {
            setPeriodChanges(new Map());
            setLoading(false);
            return;
        }

        const fetchId = ++fetchIdRef.current;
        setLoading(true);
        setPeriodChanges(new Map());

        const currentBuckets = bucketsRef.current;
        const currentTopSectors = topSectorNamesRef.current;
        const uniqueCoins = new Set<string>();
        for (const sector of currentTopSectors) {
            for (const { coin } of currentBuckets.get(sector)?.topCoins ?? []) {
                uniqueCoins.add(coin);
            }
        }

        const currentClient = clientRef.current;

        async function run() {
            const results = await Promise.all(
                [...uniqueCoins].map(async (coin) => ({
                    coin,
                    change: await fetchCoinChange(currentClient, coin, tf),
                }))
            );

            if (fetchIdRef.current !== fetchId) return;

            const coinChange = new Map<string, number>();
            for (const { coin, change } of results) {
                if (change !== null) coinChange.set(coin, change);
            }

            const newChanges = new Map<string, number>();
            for (const sector of topSectorNamesRef.current) {
                const bucket = bucketsRef.current.get(sector);
                if (!bucket) continue;
                let wSum = 0;
                let wVol = 0;
                for (const { coin, volume } of bucket.topCoins) {
                    const ch = coinChange.get(coin);
                    if (ch !== undefined) {
                        wSum += ch * volume;
                        wVol += volume;
                    }
                }
                if (wVol > 0) newChanges.set(sector, wSum / wVol);
            }

            if (fetchIdRef.current !== fetchId) return;
            setPeriodChanges(newChanges);
            setLoading(false);
        }

        void run();
    }, [tf]);

    const showValues = !loading || tf === "24H";

    const display = useMemo(() => {
        const items = topSectorNames
            .map((name) => {
                const b = buckets.get(name)!;
                const change24h = b.totalVolume > 0 ? b.weightedSum24h / b.totalVolume : 0;
                const change = tf === "24H" ? change24h : (periodChanges.get(name) ?? change24h); // fallback to 24H while loading
                return { name, change, volume: b.totalVolume };
            })
            .sort((a, b) => b.change - a.change);

        const maxAbs = Math.max(...items.map((s) => Math.abs(s.change)), 0.001);

        return items.map((s) => {
            const intensity = showValues ? Math.min(Math.abs(s.change) / maxAbs, 1) : 0;
            const alpha = 0.12 + intensity * 0.58;
            const color = s.change >= 0 ? `rgba(22, 199, 132, ${alpha})` : `rgba(234, 57, 67, ${alpha})`;
            return { ...s, color };
        });
    }, [topSectorNames, buckets, periodChanges, tf, showValues]);

    return (
        <div className="sidebar-panel">
            <div className="sidebar-panel-header">
                <Grid3X3 size={11} />
                <span>Sector Heatmap</span>
                <div className="heatmap-tf-selector">
                    {TF_OPTIONS.map((t) => (
                        <button
                            key={t}
                            className={`heatmap-tf-btn${tf === t ? " heatmap-tf-btn--active" : ""}`}
                            onClick={() => setTf(t)}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            </div>
            <div className="heatmap-grid">
                {display.length === 0
                    ? Array.from({ length: TOP_N }, (_, i) => (
                          <div key={i} className="heatmap-cell heatmap-cell--skeleton">
                              <span className="heatmap-cell-name">&nbsp;</span>
                              <span className="heatmap-cell-change">&nbsp;</span>
                          </div>
                      ))
                    : display.map((s) => (
                          <div key={s.name} className="heatmap-cell" style={{ background: s.color }}>
                              <span className="heatmap-cell-name">{s.name}</span>
                              <span
                                  className={`heatmap-cell-change ${s.change >= 0 ? "val-positive" : "val-negative"}`}
                              >
                                  {showValues ? (
                                      `${s.change >= 0 ? "+" : ""}${(s.change * 100).toFixed(1)}%`
                                  ) : (
                                      <span className="heatmap-val-loading" />
                                  )}
                              </span>
                          </div>
                      ))}
            </div>
        </div>
    );
}
