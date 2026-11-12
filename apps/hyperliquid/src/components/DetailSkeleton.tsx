/** Skeleton placeholder shown in the detail column while markets are loading. */
export function DetailSkeleton() {
    const metricWidths = [50, 68, 62, 72, 70, 80, 58, 52, 65, 46, 42, 38, 36, 44, 38];
    const tabWidths = [52, 42, 60, 36, 40];
    const rowWidths: [number, number, number][] = [
        [72, 54, 46],
        [64, 48, 38],
        [80, 60, 42],
        [58, 44, 50],
        [76, 52, 36],
        [62, 46, 44],
        [68, 58, 40],
        [56, 42, 32],
    ];

    return (
        <div className="dv">
            {/* Metrics grid skeleton — 3 rows × 5 cells */}
            <div className="dv-metrics">
                {metricWidths.map((w, i) => (
                    <div key={i} className="dv-metric">
                        <div className="sk-bar sk-bar--label" style={{ width: 38, marginBottom: 6 }} />
                        <div className="sk-bar" style={{ width: w, animationDelay: `${(i * 0.055) % 0.55}s` }} />
                    </div>
                ))}
            </div>

            {/* Health dims sub-row skeleton */}
            <div className="dv-health-dims" style={{ gap: 12 }}>
                {[90, 80, 95].map((w, i) => (
                    <div key={i} className="dv-health-dim-pill" style={{ flex: 1 }}>
                        <div className="sk-bar sk-bar--label" style={{ width: w, animationDelay: `${i * 0.1}s` }} />
                    </div>
                ))}
            </div>

            {/* Main body */}
            <div className="dv-body">
                <div className="dv-main">
                    {/* Chart skeleton */}
                    <div className="dv-chart">
                        <div className="candle-chart-header">
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <div className="sk-bar" style={{ width: 72 }} />
                            </div>
                            <div style={{ display: "flex", gap: 4 }}>
                                {[0, 1, 2, 3].map((i) => (
                                    <div
                                        key={i}
                                        className="sk-bar"
                                        style={{ width: 22, animationDelay: `${i * 0.08}s` }}
                                    />
                                ))}
                            </div>
                        </div>
                        <div className="sk-chart-fill" />
                    </div>

                    {/* Data section skeleton */}
                    <div className="dv-data-section">
                        {/* Tab bar */}
                        <div className="detail-tabs">
                            {tabWidths.map((w, i) => (
                                <div
                                    key={i}
                                    className="sk-bar"
                                    style={{ width: w, margin: "8px 4px", animationDelay: `${i * 0.07}s` }}
                                />
                            ))}
                        </div>
                        {/* Data rows */}
                        <div className="dv-data-body">
                            {rowWidths.map(([w1, w2, w3], i) => (
                                <div key={i} className="sk-data-row" style={{ animationDelay: `${i * 0.06}s` }}>
                                    <div className="sk-bar" style={{ width: w1, animationDelay: `${i * 0.06}s` }} />
                                    <div
                                        className="sk-bar"
                                        style={{ width: w2, animationDelay: `${i * 0.06 + 0.1}s` }}
                                    />
                                    <div
                                        className="sk-bar"
                                        style={{ width: w3, animationDelay: `${i * 0.06 + 0.2}s` }}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
