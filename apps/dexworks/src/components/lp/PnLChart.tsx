import { useEffect, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface DataPoint {
    block_number: number;
    timestamp: number;
    price: string;
    position_value_usd: string;
    hodl_value_usd: string;
    il_usd: string;
    fees_usd_cumulative?: string;
    net_pnl_usd?: string;
}

interface ChartRow {
    timestamp: number;
    fees: number;
    il: number;
    netPnl: number;
}

interface CustomTooltipProps {
    active?: boolean;
    payload?: Array<{ name: string; value: number; color: string }>;
    label?: number;
}

function ChartTooltip({ active, payload, label }: CustomTooltipProps) {
    if (!active || !payload?.length) return null;
    const date = label
        ? new Date(label * 1000).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
          })
        : "";
    return (
        <div className="lp-chart-tooltip">
            <div className="lp-chart-tooltip-date">{date}</div>
            {payload.map((entry) => (
                <div key={entry.name} className="lp-chart-tooltip-row" style={{ color: entry.color }}>
                    <span>{entry.name}</span>
                    <span>
                        {entry.value >= 0 ? "+" : ""}${Math.abs(entry.value).toFixed(2)}
                    </span>
                </div>
            ))}
        </div>
    );
}

const IS_MOCK = import.meta.env.VITE_LP_MOCK === "true";

const pnlCache = new Map<string, { rows: ChartRow[]; ts: number }>();
const PNL_TTL_MS = 5 * 60 * 1000;

interface Props {
    pool: string;
    tokenId: string;
}

export function PnLChart({ pool, tokenId }: Props) {
    const [data, setData] = useState<ChartRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(false);

        const load = async () => {
            if (IS_MOCK) {
                const rows: ChartRow[] = Array.from({ length: 20 }, (_, i) => {
                    const fees = i * 1.5;
                    const il = -(i < 10 ? i * 0.8 : (20 - i) * 0.8);
                    return {
                        timestamp: Date.now() / 1000 - (20 - i) * 86400,
                        fees,
                        il,
                        netPnl: il + fees,
                    };
                });
                if (!cancelled) {
                    setData(rows);
                    setLoading(false);
                }
                return;
            }

            const key = `${pool}:${tokenId}`;
            const cached = pnlCache.get(key);
            if (cached && Date.now() - cached.ts < PNL_TTL_MS) {
                if (!cancelled) {
                    setData(cached.rows);
                    setLoading(false);
                }
                return;
            }

            try {
                const res = await fetch(`/api/lp/il-over-time?pool=${pool}&token_id=${tokenId}&samples=20`);
                const json = (await res.json()) as { data_points?: DataPoint[] };
                const rows: ChartRow[] = (json.data_points ?? []).map((d) => ({
                    timestamp: d.timestamp,
                    fees: parseFloat(d.fees_usd_cumulative ?? "0"),
                    il: parseFloat(d.il_usd),
                    netPnl: parseFloat(d.net_pnl_usd ?? d.il_usd),
                }));
                pnlCache.set(key, { rows, ts: Date.now() });
                if (!cancelled) {
                    setData(rows);
                    setLoading(false);
                }
            } catch {
                if (!cancelled) {
                    setError(true);
                    setLoading(false);
                }
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, [pool, tokenId]);

    if (loading) {
        return (
            <div className="lp-pnl-chart">
                <div className="lp-pnl-skeleton">
                    {[38, 65, 52, 82, 60, 75, 45, 88, 55, 70].map((h, i) => (
                        <div
                            key={i}
                            className="lp-pnl-skeleton-bar"
                            style={{ height: `${h}%`, animationDelay: `${i * 0.08}s` }}
                        />
                    ))}
                </div>
            </div>
        );
    }

    if (error || data.length < 2) {
        return <div className="lp-pnl-empty">P&amp;L history available after position accumulates 2+ data points</div>;
    }

    const allZero = data.every((d) => Math.abs(d.fees) < 0.01 && Math.abs(d.il) < 0.01 && Math.abs(d.netPnl) < 0.01);
    if (allZero) {
        return <div className="lp-pnl-empty">No fee or P&amp;L activity recorded yet</div>;
    }

    return (
        <div className="lp-pnl-chart">
            <div className="lp-pnl-legend">
                <span style={{ color: "var(--gain)" }}>▪ Fees</span>
                <span style={{ color: "var(--loss)" }}>— IL</span>
                <span style={{ color: "var(--fg)" }}>— Net P&amp;L</span>
            </div>
            <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 20, left: 36 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                    <XAxis
                        dataKey="timestamp"
                        tickFormatter={(t: number) =>
                            new Date(t * 1000).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                            })
                        }
                        tick={{
                            fill: "var(--fg-muted)",
                            fontSize: 9,
                            fontFamily: "var(--font-mono)",
                        }}
                        tickLine={false}
                        axisLine={{ stroke: "var(--border)" }}
                        minTickGap={40}
                    />
                    <YAxis
                        tickFormatter={(v: number) => `$${v < 0 ? "-" : ""}${Math.abs(v).toFixed(0)}`}
                        tick={{
                            fill: "var(--fg-muted)",
                            fontSize: 9,
                            fontFamily: "var(--font-mono)",
                        }}
                        tickLine={false}
                        axisLine={false}
                        width={36}
                    />
                    <Tooltip
                        content={<ChartTooltip />}
                        cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                        wrapperStyle={{ outline: "none" }}
                    />
                    <Area
                        type="monotone"
                        dataKey="fees"
                        name="Fees"
                        stroke="var(--gain)"
                        fill="var(--gain)"
                        fillOpacity={0.12}
                        strokeWidth={1.5}
                        dot={false}
                        activeDot={{ r: 3, fill: "var(--gain)", strokeWidth: 0 }}
                    />
                    <Line
                        type="monotone"
                        dataKey="il"
                        name="IL"
                        stroke="var(--loss)"
                        strokeWidth={1.5}
                        dot={false}
                        activeDot={{ r: 3, fill: "var(--loss)", strokeWidth: 0 }}
                    />
                    <Line
                        type="monotone"
                        dataKey="netPnl"
                        name="Net P&L"
                        stroke="var(--fg)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 3, fill: "var(--fg)", strokeWidth: 0 }}
                    />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}
