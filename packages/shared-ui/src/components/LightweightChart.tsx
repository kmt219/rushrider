import type { OHLCVCandle } from "../types";
import {
    createChart,
    ColorType,
    CrosshairMode,
    type IChartApi,
    type ISeriesApi,
    type UTCTimestamp,
} from "lightweight-charts";
import { memo, useEffect, useRef, useState } from "react";

/** Compact price formatter for the chart Y-axis — max ~12 chars wide */
function formatChartPrice(price: number): string {
    if (!isFinite(price) || price === 0) return "$0";
    const sign = price < 0 ? "-" : "";
    const abs = Math.abs(price);
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
    if (abs >= 1) return `${sign}$${abs.toFixed(2)}`;
    // 0.01–0.9999 range: toFixed(4) then trim trailing zeros to avoid "$0.0100".
    // Boundary is 0.01 (not 0.0095) to prevent toFixed(4) rounding 0.009999 up to "0.0100".
    if (abs >= 0.01) {
        const s = abs.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
        return `${sign}$${s}`;
    }
    // Compact notation: $0.0{5}24 — 3 sig digits max for narrow labels
    const exp = Math.floor(Math.log10(abs));
    const zeros = -exp - 1;
    const mantissa = abs / Math.pow(10, exp);
    const sig = parseFloat(mantissa.toPrecision(3)).toString().replace(".", "");
    return `${sign}$0.0{${zeros}}${sig}`;
}

function toTime(ts: string): UTCTimestamp {
    return Math.floor(new Date(ts).getTime() / 1000) as UTCTimestamp;
}

interface HoveredCandle {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export const LightweightChart = memo(function LightweightChart({
    candles,
    showVolume = true,
}: {
    candles: OHLCVCandle[];
    showVolume?: boolean;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const prevLenRef = useRef(0);
    const prevFirstTimeRef = useRef(0);

    const [hovered, setHovered] = useState<HoveredCandle | null>(null);
    // Stable ref so the crosshair subscription doesn't hold a stale setter
    const setHoveredRef = useRef(setHovered);
    setHoveredRef.current = setHovered;

    // Create chart once on mount
    useEffect(() => {
        const el = containerRef.current;
        if (!el || chartRef.current) return;

        const chart = createChart(el, {
            layout: {
                background: { type: ColorType.Solid, color: "transparent" },
                textColor: "#e5e7eb",
            },
            grid: {
                vertLines: { color: "rgba(100, 116, 139, 0.25)" },
                horzLines: { color: "rgba(100, 116, 139, 0.25)" },
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: true,
                borderColor: "rgba(100, 116, 139, 0.25)",
                rightOffset: 5,
                fixLeftEdge: true,
                fixRightEdge: true,
            },
            rightPriceScale: {
                borderColor: "rgba(100, 116, 139, 0.25)",
            },
            crosshair: {
                mode: CrosshairMode.Normal,
            },
            localization: {
                priceFormatter: formatChartPrice,
            },
            // Fallbacks guard against 0 dimensions when mounted before layout completes;
            // ResizeObserver corrects to the real size on the next animation frame.
            width: el.clientWidth || 400,
            height: el.clientHeight || 300,
        });

        const candleSeries = chart.addCandlestickSeries({
            upColor: "#00d084",
            downColor: "#e74c3c",
            wickUpColor: "#00d084",
            wickDownColor: "#e74c3c",
            borderVisible: false,
            priceFormat: {
                type: "custom",
                minMove: 0.0000001,
                formatter: formatChartPrice,
            },
        });

        chartRef.current = chart;
        candleSeriesRef.current = candleSeries;

        if (showVolume) {
            const volSeries = chart.addHistogramSeries({
                priceFormat: { type: "volume" },
                priceScaleId: "volume",
            });
            chart.priceScale("volume").applyOptions({
                scaleMargins: { top: 0.8, bottom: 0 },
                visible: false,
            });
            volSeries.applyOptions({
                lastValueVisible: false,
                priceLineVisible: false,
            });
            volumeSeriesRef.current = volSeries;
        }

        // OHLCV hover legend — subscribe to crosshair moves
        chart.subscribeCrosshairMove((param) => {
            if (!param.time || !candleSeriesRef.current) {
                setHoveredRef.current(null);
                return;
            }
            const c = param.seriesData.get(candleSeriesRef.current) as
                | { open: number; high: number; low: number; close: number }
                | undefined;
            if (!c) {
                setHoveredRef.current(null);
                return;
            }
            const volSeries = volumeSeriesRef.current;
            const v = volSeries ? (param.seriesData.get(volSeries) as { value?: number } | undefined) : undefined;
            setHoveredRef.current({
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
                volume: v?.value ?? 0,
            });
        });

        // Responsive resize
        const ro = new ResizeObserver(() => {
            if (chartRef.current && containerRef.current) {
                chartRef.current.applyOptions({
                    width: containerRef.current.clientWidth,
                    height: containerRef.current.clientHeight,
                });
            }
        });
        ro.observe(el);

        return () => {
            ro.disconnect();
            chart.remove();
            chartRef.current = null;
            candleSeriesRef.current = null;
            volumeSeriesRef.current = null;
        };
    }, [showVolume]);

    // Push data when candles change — clear chart on empty to avoid stale visuals
    useEffect(() => {
        if (!candleSeriesRef.current) return;

        if (candles.length === 0) {
            candleSeriesRef.current.setData([]);
            if (volumeSeriesRef.current) volumeSeriesRef.current.setData([]);
            prevLenRef.current = 0;
            prevFirstTimeRef.current = 0;
            return;
        }

        // Deduplicate by timestamp (last wins) and sort ascending — lightweight-charts
        // throws if data is out of order or if update() receives an older timestamp.
        const byTime = new Map<number, OHLCVCandle>();
        for (const c of candles) {
            byTime.set(toTime(c.timestamp), c);
        }
        const sorted = Array.from(byTime.entries()).sort((a, b) => a[0] - b[0]);

        const candleData = sorted.map(([t, c]) => ({
            time: t as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
        }));

        const volumeData = sorted.map(([t, c]) => ({
            time: t as UTCTimestamp,
            value: c.volume_usd ?? c.volume ?? 0,
            color: c.close >= c.open ? "rgba(0, 208, 132, 0.3)" : "rgba(231, 76, 60, 0.3)",
        }));

        const firstTime = sorted[0]?.[0] ?? 0;

        // Try incremental update only when same dataset (same length AND same first timestamp).
        // The firstTime guard catches pair switches that skip the empty-candles phase.
        if (sorted.length === prevLenRef.current && sorted.length > 0 && firstTime === prevFirstTimeRef.current) {
            try {
                const lastCandle = candleData[candleData.length - 1];
                if (lastCandle) candleSeriesRef.current.update(lastCandle);
                if (volumeSeriesRef.current) {
                    const lastVol = volumeData[volumeData.length - 1];
                    if (lastVol) volumeSeriesRef.current.update(lastVol);
                }
            } catch {
                candleSeriesRef.current.setData(candleData);
                if (volumeSeriesRef.current) {
                    volumeSeriesRef.current.setData(volumeData);
                }
                prevFirstTimeRef.current = firstTime;
            }
        } else {
            candleSeriesRef.current.setData(candleData);
            if (volumeSeriesRef.current) {
                volumeSeriesRef.current.setData(volumeData);
            }
            chartRef.current?.timeScale().fitContent();
            prevFirstTimeRef.current = firstTime;
        }

        prevLenRef.current = sorted.length;
    }, [candles]);

    const isGreen = !hovered || hovered.close >= hovered.open;

    return (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
            {/* OHLCV hover legend */}
            <div
                style={{
                    display: "flex",
                    gap: "12px",
                    padding: "2px 8px",
                    fontSize: "11px",
                    fontFamily: "monospace",
                    color: isGreen ? "#00d084" : "#e74c3c",
                    minHeight: "20px",
                    flexShrink: 0,
                    alignItems: "center",
                }}
            >
                {hovered ? (
                    <>
                        <span>O&nbsp;{formatChartPrice(hovered.open)}</span>
                        <span>H&nbsp;{formatChartPrice(hovered.high)}</span>
                        <span>L&nbsp;{formatChartPrice(hovered.low)}</span>
                        <span>C&nbsp;{formatChartPrice(hovered.close)}</span>
                        {showVolume && hovered.volume > 0 && (
                            <span style={{ color: "rgba(229,231,235,0.5)" }}>
                                V&nbsp;{formatChartPrice(hovered.volume)}
                            </span>
                        )}
                    </>
                ) : (
                    <span style={{ color: "rgba(229,231,235,0.25)" }}>OHLCV</span>
                )}
            </div>
            <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />
        </div>
    );
});
