/**
 * WalletFlyout — slide-in panel showing wallet portfolio + recent txs.
 * Renders as absolute overlay inside .holder-map-canvas (position: relative).
 */
import { goldrushFetch } from "../lib/goldrushClient";
import type { Cluster, HolderNode } from "../types";
import { getExplorerUrl, formatUSD, getTimeAgo } from "../utils";
import { computeBehavioralTags, getHolderTags, TAG_COLORS } from "../utils/holderTags";
import type { HolderTag } from "../utils/holderTags";
import { useEffect, useMemo, useState, useCallback } from "react";

interface WalletFlyoutProps {
    address: string;
    chainName: string;
    holderNode?: HolderNode;
    clusters?: Cluster[];
    onClose: () => void;
}

interface BalanceItem {
    contract_ticker_symbol?: string;
    balance_quote?: number;
    logo_url?: string;
}

interface TxItem {
    tx_hash?: string;
    block_signed_at?: string;
    decoded_type?: string;
    to_address?: string;
    from_address?: string;
    value?: string;
}

interface ActivityChain {
    name?: string;
    chain_name?: string;
    label?: string;
}

interface BalancesResp {
    items?: BalanceItem[];
}
interface TxResp {
    items?: TxItem[];
}
interface ActivityResp {
    items?: ActivityChain[];
}

const CACHE_TTL = 5 * 60_000;

function shortAddr(addr: string) {
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function Skeleton() {
    return (
        <div className="flyout-skeleton">
            <div className="flyout-skeleton-row" />
            <div className="flyout-skeleton-row" />
            <div className="flyout-skeleton-row" />
        </div>
    );
}

export function WalletFlyout({ address, chainName, holderNode, clusters = [], onClose }: WalletFlyoutProps) {
    const restChain = chainName.replace(/_/g, "-").toLowerCase();
    const [balances, setBalances] = useState<BalanceItem[] | null>(null);
    const [txs, setTxs] = useState<TxItem[] | null>(null);
    const [activity, setActivity] = useState<ActivityChain[] | null>(null);
    const [showAllBalances, setShowAllBalances] = useState(false);

    useEffect(() => {
        setBalances(null);
        setTxs(null);
        setActivity(null);
        const addr = address.toLowerCase();
        goldrushFetch<BalancesResp>(`${restChain}/address/${addr}/balances_v2/`, {}, CACHE_TTL)
            .then((r) => setBalances(r?.items ?? []))
            .catch(() => setBalances([]));
        // Fetch 25 txs so behavioral tag heuristics have a meaningful sample size.
        goldrushFetch<TxResp>(`${restChain}/address/${addr}/transactions_v3/`, { "page-size": "25" }, CACHE_TTL)
            .then((r) => setTxs(r?.items ?? []))
            .catch(() => setTxs([]));
        // Cross-chain activity — chain-agnostic endpoint.
        goldrushFetch<ActivityResp>(`address/${addr}/activity/`, {}, CACHE_TTL)
            .then((r) => setActivity(r?.items ?? []))
            .catch(() => setActivity([]));
    }, [address, restChain]);

    // Behavioral tags derived from fetched tx history (FRESH / DIAMOND / FLIPPER).
    const behavioralTags = useMemo<HolderTag[]>(() => (txs ? computeBehavioralTags(txs, address) : []), [txs, address]);

    // Wallet age: derived from oldest visible tx (note: page-limited to 25 txs)
    const walletAge = useMemo(() => {
        if (!txs || txs.length === 0) return null;
        const oldest = txs[txs.length - 1];
        if (!oldest?.block_signed_at) return null;
        const ageMs = Date.now() - new Date(oldest.block_signed_at).getTime();
        const days = Math.floor(ageMs / (1000 * 60 * 60 * 24));
        if (days < 1) return "< 1d (visible history)";
        if (days < 30) return `${days}d (visible history)`;
        if (days < 365) return `~${Math.floor(days / 30)}mo (visible history)`;
        return `~${(days / 365).toFixed(1)}yr (visible history)`;
    }, [txs]);

    const memberClusters = clusters.filter((c) => c.members.includes(address));
    const staticTags = holderNode ? getHolderTags(holderNode) : [];
    // Merge static + behavioral tags, deduplicate.
    const tags = Array.from(new Set([...staticTags, ...behavioralTags]));
    const valuedBalances = (balances ?? [])
        .filter((b) => (b.balance_quote ?? 0) > 0)
        .sort((a, b) => (b.balance_quote ?? 0) - (a.balance_quote ?? 0));
    const allDisplayBalances = valuedBalances.length > 0 ? valuedBalances : (balances ?? []);
    const displayBalances = showAllBalances ? allDisplayBalances : allDisplayBalances.slice(0, 5);
    const hasUsdValues = valuedBalances.length > 0;
    const toggleBalances = useCallback(() => setShowAllBalances((v) => !v), []);

    return (
        <div className="wallet-flyout">
            <div className="flyout-header">
                <span className="flyout-addr" title={address}>
                    {shortAddr(address)}
                </span>
                <a
                    className="flyout-explorer-link"
                    href={getExplorerUrl(chainName, address) ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    title="Open in explorer"
                >
                    ↗
                </a>
                <button className="flyout-close" onClick={onClose} aria-label="Close">
                    ✕
                </button>
            </div>

            <div className="flyout-body">
                {/* Identity */}
                {holderNode && (
                    <div className="flyout-section">
                        <div className="flyout-section-label">IDENTITY</div>
                        <div className="flyout-identity-row">
                            <span className={`flyout-tier flyout-tier--${holderNode.riskTier}`}>
                                {holderNode.riskTier.toUpperCase()}
                            </span>
                            <span className="flyout-rank">RANK #{holderNode.rank}</span>
                            <span className="flyout-supply">{holderNode.supplyPct.toFixed(4)}% supply</span>
                        </div>
                        {tags.length > 0 && (
                            <div className="flyout-tags">
                                {tags.map((tag) => (
                                    <span
                                        key={tag}
                                        className="ht-tag"
                                        style={{ color: TAG_COLORS[tag], borderColor: TAG_COLORS[tag] }}
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}
                        {walletAge && (
                            <div className="flyout-wallet-age">
                                <span className="flyout-wallet-age-label">AGE</span>
                                <span className="flyout-wallet-age-value">{walletAge}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Cluster membership */}
                {memberClusters.length > 0 && (
                    <div className="flyout-section">
                        <div className="flyout-section-label">CLUSTER MEMBERSHIP</div>
                        {memberClusters.map((c) => (
                            <div key={c.id} className="flyout-cluster-badge" style={{ borderLeftColor: c.color }}>
                                <span style={{ color: c.color }}>{c.id}</span> — {c.explanation}
                            </div>
                        ))}
                    </div>
                )}

                {/* Portfolio */}
                <div className="flyout-section">
                    <div className="flyout-section-label">
                        PORTFOLIO{balances !== null ? ` (${balances.length} tokens)` : ""}
                    </div>
                    {balances === null ? (
                        <Skeleton />
                    ) : balances.length === 0 ? (
                        <div className="flyout-empty">No token balances found</div>
                    ) : (
                        displayBalances.map((b, i) => (
                            <div key={i} className="flyout-portfolio-row">
                                <span>{b.contract_ticker_symbol ?? "—"}</span>
                                <span>{hasUsdValues ? formatUSD(b.balance_quote ?? 0) : "—"}</span>
                            </div>
                        ))
                    )}
                    {balances !== null && allDisplayBalances.length > 5 && (
                        <button className="flyout-more flyout-more--btn" onClick={toggleBalances}>
                            {showAllBalances ? "SHOW LESS" : `+${allDisplayBalances.length - 5} MORE TOKENS`}
                        </button>
                    )}
                </div>

                {/* Recent activity */}
                <div className="flyout-section">
                    <div className="flyout-section-label">RECENT TXS</div>
                    {txs === null ? (
                        <Skeleton />
                    ) : txs.length === 0 ? (
                        <div className="flyout-empty">No transactions found</div>
                    ) : (
                        txs.slice(0, 8).map((tx, i) => {
                            const txUrl = tx.tx_hash ? getExplorerUrl(chainName, tx.tx_hash, "tx") : null;
                            return (
                                <div key={i} className="flyout-tx-row">
                                    <span className="flyout-tx-type">
                                        {tx.decoded_type?.toUpperCase().slice(0, 6) ?? "TX"}
                                    </span>
                                    <span className="flyout-tx-time">
                                        {tx.block_signed_at ? getTimeAgo(new Date(tx.block_signed_at).getTime()) : "—"}
                                    </span>
                                    {tx.to_address && tx.to_address !== address && (
                                        <span className="flyout-tx-to">→ {shortAddr(tx.to_address)}</span>
                                    )}
                                    {txUrl && (
                                        <a
                                            href={txUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flyout-tx-hash-link"
                                            title={tx.tx_hash ?? "View transaction"}
                                        >
                                            ↗
                                        </a>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Cross-chain activity */}
                <div className="flyout-section flyout-section--last">
                    <div className="flyout-section-label">CROSS-CHAIN ACTIVITY</div>
                    {activity === null ? (
                        <Skeleton />
                    ) : activity.length === 0 ? (
                        <div className="flyout-empty">No cross-chain activity found</div>
                    ) : (
                        <div className="flyout-chain-list">
                            {activity.slice(0, 8).map((item, i) => {
                                const label = item.label ?? item.chain_name ?? item.name ?? `Chain ${i + 1}`;
                                return (
                                    <span key={i} className="flyout-chain-badge">
                                        {label}
                                    </span>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
