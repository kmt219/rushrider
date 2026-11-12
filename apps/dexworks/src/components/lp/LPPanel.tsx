import type { Position } from "./LPDashboard";
import { LPInputBar } from "./LPInputBar";
import { PoolSummaryBar } from "./PoolSummaryBar";
import "./lp.css";
import { useCallback, useEffect, useState, lazy, Suspense } from "react";

// Heavy sub-components -- lazy-loaded exactly as in LPDashboard.tsx
const PositionCard = lazy(() => import("./PositionCard").then((m) => ({ default: m.PositionCard })));
const LiquidityDepthChart = lazy(() =>
    import("./LiquidityDepthChart").then((m) => ({ default: m.LiquidityDepthChart }))
);

// Local redeclaration -- PoolInfo is not exported from LPDashboard.tsx
interface PoolInfo {
    address: string;
    current_tick: number;
    sqrt_price_x96: string;
    current_price_token1_per_token0: string;
    block_number: number;
    block_signed_at?: string;
    token0_symbol?: string;
    token1_symbol?: string;
}

interface Props {
    /** Pool contract address pre-filled from the selected DexWorks pair */
    defaultPool: string;
    /** GQL chain name, e.g. "base_mainnet" */
    chainName: string;
}

const IS_MOCK = import.meta.env.VITE_LP_MOCK === "true";

export function LPPanel({ defaultPool, chainName }: Props) {
    const [pool, setPool] = useState(defaultPool);
    const [wallet] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [poolInfo, setPoolInfo] = useState<PoolInfo | null>(null);
    const [positions, setPositions] = useState<Position[]>([]);

    // Reset pre-fill when the selected pair changes in the parent
    useEffect(() => {
        setPool(defaultPool);
        setPoolInfo(null);
        setPositions([]);
        setError(null);
    }, [defaultPool]);

    const fetchPositions = useCallback(
        async (p: string, w: string) => {
            setLoading(true);
            setError(null);
            try {
                let data: { pool: PoolInfo; positions: Position[] };
                if (IS_MOCK) {
                    const { MOCK_POSITIONS_RESPONSE } = await import("../../../api/lp/_fixtures");
                    data = MOCK_POSITIONS_RESPONSE as unknown as typeof data;
                } else {
                    const chain = chainName.replace(/_/g, "-");
                    const qs = new URLSearchParams({ pool: p, wallet: w, chain });
                    const res = await fetch(`/api/lp/positions?${qs}`);
                    const text = await res.text();
                    try {
                        data = JSON.parse(text) as typeof data;
                    } catch {
                        throw new Error(
                            res.status === 404
                                ? "Edge Functions not found -- run vercel dev"
                                : `Server error (${res.status})`
                        );
                    }
                    if (!res.ok) throw new Error((data as { error?: string }).error ?? "Request failed");
                }
                setPoolInfo(data.pool);
                setPositions(data.positions ?? []);
            } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
            } finally {
                setLoading(false);
            }
        },
        [chainName]
    );

    const handleAnalyze = useCallback(
        (p: string, w: string, _block: string) => {
            setPool(p);
            void fetchPositions(p, w);
        },
        [fetchPositions]
    );

    const showNoResults = !loading && !error && poolInfo !== null && positions.length === 0;
    const chainSlug = chainName.replace(/_mainnet$/, "").replace(/-mainnet$/, "");

    return (
        <div className="lp-panel">
            {defaultPool && (
                <div className="lp-panel-pool-notice">
                    <span>POOL</span>
                    <span className="lp-panel-pool-address" title={defaultPool}>
                        {defaultPool.slice(0, 10)}&hellip;{defaultPool.slice(-8)}
                    </span>
                    <span>(from selected pair)</span>
                </div>
            )}

            <LPInputBar pool={pool} wallet={wallet} block="" loading={loading} onAnalyze={handleAnalyze} />

            {error && (
                <div className="lp-error">
                    <span className="lp-error-text">{error}</span>
                    <div className="lp-error-actions">
                        <button onClick={() => void fetchPositions(pool, wallet)}>&#8634; retry</button>
                        <button onClick={() => setError(null)}>&#x2715;</button>
                    </div>
                </div>
            )}

            {IS_MOCK && (
                <div className="lp-mock-banner">
                    MOCK MODE -- fixture data. Remove <code>VITE_LP_MOCK=true</code> for live data.
                </div>
            )}

            {poolInfo && <PoolSummaryBar pool={poolInfo} />}

            {poolInfo && pool && (
                <Suspense fallback={null}>
                    <LiquidityDepthChart
                        pool={pool}
                        positions={positions.map((pos) => ({
                            price_lower: parseFloat(pos.price_lower),
                            price_upper: parseFloat(pos.price_upper),
                        }))}
                    />
                </Suspense>
            )}

            {showNoResults && (
                <div className="lp-empty">
                    <p className="lp-empty-headline">NO POSITIONS FOUND</p>
                    <p className="lp-empty-sub">
                        No LP positions for this wallet in this pool
                        {poolInfo ? ` at block ${poolInfo.block_number.toLocaleString()}` : ""}
                    </p>
                </div>
            )}

            {positions.map((pos) => (
                <Suspense key={pos.token_id} fallback={null}>
                    <PositionCard position={pos} pool={pool} chainName={chainSlug} />
                </Suspense>
            ))}
        </div>
    );
}
