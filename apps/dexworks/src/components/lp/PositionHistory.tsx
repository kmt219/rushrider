import { useEffect, useState } from "react";

interface Event {
    type: "Mint" | "Burn" | "Collect";
    block_number: number | string;
    timestamp: number;
    amount0: string | number;
    amount1: string | number;
    tx_hash: string;
}

interface Props {
    pool: string;
    tokenId: string;
    chainName: string;
    token0Symbol?: string;
    token1Symbol?: string;
}

const TYPE_CLASS: Record<string, string> = {
    Mint: "lp-evt--mint",
    Burn: "lp-evt--burn",
    Collect: "lp-evt--collect",
};

const IS_MOCK = import.meta.env.VITE_LP_MOCK === "true";

const MOCK_EVENTS: Event[] = [
    {
        type: "Mint",
        block_number: 23500000,
        timestamp: Date.now() / 1000 - 30 * 86400,
        amount0: "0.350000",
        amount1: "420.00",
        tx_hash: "0xabc123def456abc123def456abc123def456abc123def456abc123def456abc123",
    },
    {
        type: "Collect",
        block_number: 23700000,
        timestamp: Date.now() / 1000 - 10 * 86400,
        amount0: "0.002341",
        amount1: "6.19",
        tx_hash: "0xdef456abc123def456abc123def456abc123def456abc123def456abc123def456",
    },
];

export function PositionHistory({ pool, tokenId, chainName, token0Symbol = "TOKEN0", token1Symbol = "TOKEN1" }: Props) {
    const [events, setEvents] = useState<Event[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);

        const load = async () => {
            if (IS_MOCK) {
                if (!cancelled) {
                    setEvents(MOCK_EVENTS);
                    setLoading(false);
                }
                return;
            }
            try {
                const res = await fetch(`/api/lp/position-history?pool=${pool}&token_id=${tokenId}`);
                const json = (await res.json()) as { events?: Event[] };
                if (!cancelled) {
                    setEvents(json.events ?? []);
                    setLoading(false);
                }
            } catch {
                if (!cancelled) setLoading(false);
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, [pool, tokenId]);

    const explorerBase = chainName === "base" ? "https://basescan.org/tx/" : "https://etherscan.io/tx/";

    if (loading) return <div className="lp-history-loading">LOADING HISTORY…</div>;

    return (
        <div className="lp-position-history">
            <div className="lp-history-label">POSITION HISTORY</div>
            {events.length === 0 && <div className="lp-history-loading">NO EVENTS FOUND</div>}
            {events.map((evt, i) => {
                const date = evt.timestamp
                    ? new Date(evt.timestamp * 1000).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                      })
                    : null;
                return (
                    <div key={i} className="lp-evt-row">
                        <span className={`lp-evt-type ${TYPE_CLASS[evt.type] ?? ""}`}>{evt.type}</span>
                        {date && <span className="lp-evt-date">{date}</span>}
                        <span className="lp-evt-amounts">
                            {Number(evt.amount0).toFixed(4)} {token0Symbol} + {Number(evt.amount1).toFixed(2)}{" "}
                            {token1Symbol}
                        </span>
                        <a
                            href={`${explorerBase}${evt.tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="lp-evt-tx"
                            title="View on block explorer"
                        >
                            ↗
                        </a>
                    </div>
                );
            })}
        </div>
    );
}
