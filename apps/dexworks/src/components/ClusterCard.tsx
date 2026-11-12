import type { Cluster, HolderNode } from "../types";

interface ClusterCardProps {
    cluster: Cluster;
    nodes: HolderNode[];
    onMemberClick?: (address: string) => void;
    /** Optional: passed through for explorer links on funder address */
    chainName?: string;
}

const REASON_LABELS: Record<Cluster["reason"], string> = {
    shared_funder: "SHARED FUNDER",
    temporal_correlation: "TEMPORAL",
    direct_transfer: "DIRECT TX",
};

export function ClusterCard({ cluster, nodes, onMemberClick, chainName }: ClusterCardProps) {
    const memberNodes = nodes.filter((n) => cluster.members.includes(n.address));
    const combinedPct = memberNodes.reduce((s, n) => s + n.supplyPct, 0);
    const pctColor =
        combinedPct >= 20 ? "var(--danger,#ef4444)" : combinedPct >= 10 ? "var(--warning,#f59e0b)" : "var(--fg)";

    const MAX_SHOWN = 4;
    const shown = cluster.members.slice(0, MAX_SHOWN);
    const overflow = cluster.members.length - MAX_SHOWN;

    return (
        <div className="cluster-card" style={{ borderLeftColor: cluster.color }}>
            <div className="cluster-card-header">
                <span className="cluster-card-id" style={{ color: cluster.color }}>
                    {cluster.id}
                </span>
                <span
                    className="cluster-card-reason"
                    style={{ color: cluster.color, borderColor: `${cluster.color}60` }}
                >
                    {REASON_LABELS[cluster.reason]}
                </span>
                <span className="cluster-card-confidence">{Math.round(cluster.confidence * 100)}% confidence</span>
            </div>
            <div className="cluster-card-explain">{cluster.explanation}</div>
            {cluster.fundingAddress && (
                <div className="cluster-card-funder">
                    <span className="cluster-card-funder-label">FUNDER</span>
                    <button
                        className="cluster-card-member"
                        title={cluster.fundingAddress}
                        onClick={() => onMemberClick?.(cluster.fundingAddress!)}
                    >
                        {cluster.fundingAddress.slice(0, 6)}…{cluster.fundingAddress.slice(-4)}
                    </button>
                    {chainName && (
                        <a
                            className="cluster-card-funder-link"
                            href={`https://etherscan.io/address/${cluster.fundingAddress}`}
                            target="_blank"
                            rel="noreferrer"
                            title="View funder on explorer"
                        >
                            ↗
                        </a>
                    )}
                </div>
            )}
            <div className="cluster-card-members">
                {shown.map((addr) => (
                    <button
                        key={addr}
                        className="cluster-card-member"
                        onClick={() => onMemberClick?.(addr)}
                        title={addr}
                    >
                        {addr.slice(0, 6)}…{addr.slice(-4)}
                    </button>
                ))}
                {overflow > 0 && <span className="cluster-card-overflow">+{overflow} more</span>}
            </div>
            {combinedPct > 0 && (
                <div className="cluster-card-combined" style={{ color: pctColor }}>
                    {combinedPct.toFixed(2)}% combined supply
                </div>
            )}
        </div>
    );
}
