import { useHolderConcentration } from "../hooks/useHolderConcentration";
import { useSpotPrice } from "../hooks/useSpotPrice";
import { useTxSummary } from "../hooks/useTxSummary";
import type { NewPairData, Pair, PairMetrics } from "../types";
import { formatUSD, getExplorerUrl, shortenAddress } from "../utils";
import { PriceDisplay } from "./PriceDisplay";
import { copyToClipboard } from "@goldrush-demos/shared-ui";
import { Check, Copy, ExternalLink, ShieldCheck, X } from "lucide-react";
import { useState } from "react";

interface PairDetailDrawerProps {
    pair: Pair | null;
    newPairData: NewPairData | null;
    chainName: string;
    onClose: () => void;
    onOpenSafety?: () => void;
    metrics?: PairMetrics | null;
}

function AddressRow({
    label,
    address,
    chainName,
    type = "address",
}: {
    label: string;
    address?: string | null;
    chainName: string;
    type?: "address" | "tx";
}) {
    const [copied, setCopied] = useState(false);
    if (!address) return null;
    const explorerUrl = getExplorerUrl(chainName, address, type);

    async function handleCopy() {
        const ok = await copyToClipboard(address!);
        if (ok) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        }
    }

    return (
        <div className="drawer-row">
            <span className="drawer-row-label">{label}</span>
            <span className="drawer-row-value">
                <span className="drawer-address" title={address}>
                    {shortenAddress(address)}
                </span>
                <button className="copy-btn" onClick={handleCopy} title={copied ? "Copied!" : "Copy"}>
                    {copied ? <Check size={10} /> : <Copy size={10} />}
                </button>
                {explorerUrl && (
                    <a
                        href={explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="explorer-link"
                        title="View on block explorer"
                    >
                        <ExternalLink size={10} />
                    </a>
                )}
            </span>
        </div>
    );
}

function formatDate(isoStr: string | null): string {
    if (!isoStr) return "—";
    return new Date(isoStr).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatVolume(v: number): string {
    if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
    return formatUSD(v);
}

export function PairDetailDrawer({ pair, newPairData, chainName, onClose, onOpenSafety }: PairDetailDrawerProps) {
    const spotPrice = useSpotPrice(chainName, pair?.pairAddress);
    const txSummary = useTxSummary(chainName, pair?.pairAddress);
    const tokenAddress = newPairData?.base_token?.contract_address ?? null;
    const concentration = useHolderConcentration(chainName, tokenAddress);

    if (!pair) return null;

    return (
        <>
            <div className="pair-detail-backdrop" onClick={onClose} />
            <div className="pair-detail-drawer open">
                <div className="drawer-header">
                    <span className="drawer-title">PAIR DETAILS</span>
                    <button className="drawer-close" onClick={onClose} title="Close">
                        <X size={14} />
                    </button>
                </div>

                <div className="drawer-body">
                    <>
                        <div className="drawer-section">
                            <div className="drawer-section-title">PAIR</div>
                            <div className="drawer-row">
                                <span className="drawer-row-label">SYMBOL</span>
                                <span className="drawer-row-value drawer-pair-symbol">
                                    {pair.token0}/{pair.token1}
                                </span>
                            </div>
                            <AddressRow label="ADDRESS" address={pair.pairAddress} chainName={chainName} />
                            {newPairData?.deployer_address && (
                                <AddressRow
                                    label="DEPLOYER"
                                    address={newPairData.deployer_address}
                                    chainName={chainName}
                                />
                            )}
                            {newPairData?.tx_hash && (
                                <AddressRow
                                    label="CREATE TX"
                                    address={newPairData.tx_hash}
                                    chainName={chainName}
                                    type="tx"
                                />
                            )}
                            <div className="drawer-row">
                                <span className="drawer-row-label">DEX</span>
                                <span className="drawer-row-value">{pair.dex}</span>
                            </div>
                            {newPairData?.protocol_version && (
                                <div className="drawer-row">
                                    <span className="drawer-row-label">VERSION</span>
                                    <span className="drawer-row-value">{newPairData.protocol_version}</span>
                                </div>
                            )}
                            {newPairData?.block_signed_at && (
                                <div className="drawer-row">
                                    <span className="drawer-row-label">CREATED</span>
                                    <span className="drawer-row-value">
                                        {new Date(newPairData.block_signed_at).toLocaleString()}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* PRICE STATS from spot price endpoint */}
                        <div className="drawer-section">
                            <div className="drawer-section-title">PRICE STATS</div>
                            <div className="drawer-row">
                                <span className="drawer-row-label">PRICE</span>
                                <span className="drawer-row-value">
                                    {spotPrice?.quoteRate != null ? (
                                        <PriceDisplay value={spotPrice.quoteRate} />
                                    ) : pair.quote_rate_usd != null ? (
                                        <PriceDisplay value={pair.quote_rate_usd} />
                                    ) : (
                                        "—"
                                    )}
                                </span>
                            </div>
                            {spotPrice?.pctChange24h != null && (
                                <div className="drawer-row">
                                    <span className="drawer-row-label">24H CHG</span>
                                    <span
                                        className="drawer-row-value"
                                        style={{
                                            color:
                                                spotPrice.pctChange24h >= 0
                                                    ? "var(--gain, #22c55e)"
                                                    : "var(--loss, #ef4444)",
                                        }}
                                    >
                                        {spotPrice.pctChange24h >= 0 ? "+" : ""}
                                        {spotPrice.pctChange24h.toFixed(2)}%
                                    </span>
                                </div>
                            )}
                            {spotPrice?.high24h != null && (
                                <div className="drawer-row">
                                    <span className="drawer-row-label">24H HIGH</span>
                                    <span className="drawer-row-value">
                                        <PriceDisplay value={spotPrice.high24h} />
                                    </span>
                                </div>
                            )}
                            {spotPrice?.low24h != null && (
                                <div className="drawer-row">
                                    <span className="drawer-row-label">24H LOW</span>
                                    <span className="drawer-row-value">
                                        <PriceDisplay value={spotPrice.low24h} />
                                    </span>
                                </div>
                            )}
                            {spotPrice?.volume24hUsd != null && (
                                <div className="drawer-row">
                                    <span className="drawer-row-label">24H VOL</span>
                                    <span className="drawer-row-value">{formatVolume(spotPrice.volume24hUsd)}</span>
                                </div>
                            )}
                            {spotPrice == null && (
                                <div className="drawer-row">
                                    <span className="drawer-row-label">STATUS</span>
                                    <span className="drawer-row-value" style={{ color: "var(--fg-muted)" }}>
                                        LOADING…
                                    </span>
                                </div>
                            )}
                        </div>

                        {newPairData?.base_token && (
                            <div className="drawer-section">
                                <div className="drawer-section-title">BASE TOKEN</div>
                                <div className="drawer-row">
                                    <span className="drawer-row-label">SYMBOL</span>
                                    <span className="drawer-row-value">
                                        {newPairData.base_token.contract_ticker_symbol}
                                    </span>
                                </div>
                                <div className="drawer-row">
                                    <span className="drawer-row-label">NAME</span>
                                    <span className="drawer-row-value">{newPairData.base_token.contract_name}</span>
                                </div>
                                <AddressRow
                                    label="ADDRESS"
                                    address={newPairData.base_token.contract_address}
                                    chainName={chainName}
                                />
                            </div>
                        )}

                        {newPairData?.quote_token && (
                            <div className="drawer-section">
                                <div className="drawer-section-title">QUOTE TOKEN</div>
                                <div className="drawer-row">
                                    <span className="drawer-row-label">SYMBOL</span>
                                    <span className="drawer-row-value">
                                        {newPairData.quote_token.contract_ticker_symbol}
                                    </span>
                                </div>
                                <div className="drawer-row">
                                    <span className="drawer-row-label">NAME</span>
                                    <span className="drawer-row-value">{newPairData.quote_token.contract_name}</span>
                                </div>
                                <AddressRow
                                    label="ADDRESS"
                                    address={newPairData.quote_token.contract_address}
                                    chainName={chainName}
                                />
                            </div>
                        )}

                        <div className="drawer-section">
                            <div className="drawer-section-title">METRICS</div>
                            <div className="drawer-row">
                                <span className="drawer-row-label">LIQUIDITY</span>
                                <span className="drawer-row-value">
                                    {pair.liquidity != null ? formatUSD(pair.liquidity) : "—"}
                                </span>
                            </div>
                            <div className="drawer-row">
                                <span className="drawer-row-label">MARKET CAP</span>
                                <span className="drawer-row-value">
                                    {pair.market_cap != null ? formatUSD(pair.market_cap) : "—"}
                                </span>
                            </div>
                            <div className="drawer-row">
                                <span className="drawer-row-label">SESSION TXS</span>
                                <span className="drawer-row-value">{pair.txCount.toLocaleString()}</span>
                            </div>
                            {txSummary != null && (
                                <>
                                    <div className="drawer-row">
                                        <span className="drawer-row-label">LIFETIME TXS</span>
                                        <span
                                            className="drawer-row-value"
                                            style={{
                                                color:
                                                    txSummary.totalCount > 10_000
                                                        ? "var(--accent, #00d084)"
                                                        : undefined,
                                            }}
                                        >
                                            {txSummary.totalCount.toLocaleString()}
                                        </span>
                                    </div>
                                    {txSummary.earliestTx && (
                                        <div className="drawer-row">
                                            <span className="drawer-row-label">FIRST TX</span>
                                            <span className="drawer-row-value">{formatDate(txSummary.earliestTx)}</span>
                                        </div>
                                    )}
                                    {txSummary.latestTx && (
                                        <div className="drawer-row">
                                            <span className="drawer-row-label">LATEST TX</span>
                                            <span className="drawer-row-value">{formatDate(txSummary.latestTx)}</span>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                        {/* Safety Score entry point */}
                        {newPairData && onOpenSafety && (
                            <div className="drawer-section">
                                <button className="drawer-safety-btn" onClick={onOpenSafety}>
                                    <ShieldCheck size={14} />
                                    <span>VIEW SAFETY SCORE</span>
                                </button>
                            </div>
                        )}
                    </>
                </div>
            </div>
        </>
    );
}
