import { useState } from "react";

interface Props {
    pool: {
        address: string;
        current_tick: number;
        current_price_token1_per_token0: string;
        block_number: number;
        block_signed_at?: string;
        token0_symbol?: string;
        token1_symbol?: string;
        fee_tier?: string;
    };
}

export function PoolSummaryBar({ pool }: Props) {
    const [copied, setCopied] = useState(false);

    const ts = pool.block_signed_at
        ? new Date(pool.block_signed_at).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              timeZoneName: "short",
          })
        : null;

    const pair = pool.token0_symbol && pool.token1_symbol ? `${pool.token0_symbol} / ${pool.token1_symbol}` : null;

    const price = parseFloat(pool.current_price_token1_per_token0);
    const priceStr =
        price >= 1000 ? price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : price.toPrecision(5);

    const shortAddr = `${pool.address.slice(0, 8)}…${pool.address.slice(-6)}`;

    const handleCopy = () => {
        navigator.clipboard.writeText(pool.address).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className="lp-pool-summary" title={`Tick: ${pool.current_tick} · Block: ${pool.block_number}`}>
            {pair && (
                <span className="lp-pool-pair">
                    {pair}
                    {pool.fee_tier && <span className="lp-pool-fee-badge">FEE {pool.fee_tier}</span>}
                </span>
            )}
            <span className="lp-pool-sep">·</span>
            <button
                className={`lp-pool-address-btn${copied ? " lp-pool-address-btn--copied" : ""}`}
                title={copied ? "Copied!" : `Copy address: ${pool.address}`}
                onClick={handleCopy}
            >
                {copied ? "✓ copied" : shortAddr}
                {!copied && <span className="lp-pool-copy-icon">⎘</span>}
            </button>
            <span className="lp-pool-sep">·</span>
            <span className="lp-pool-price-value">${priceStr}</span>
            {ts && (
                <>
                    <span className="lp-pool-sep">·</span>
                    <span className="lp-pool-ts">Snapshot · {ts}</span>
                </>
            )}
        </div>
    );
}
