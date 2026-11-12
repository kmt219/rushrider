import type { Cluster, HolderNode } from "../types";
import { shortenAddress } from "../utils";
import { getHolderTags, TAG_COLORS } from "../utils/holderTags";
import { useState } from "react";

interface HolderTableProps {
    nodes: HolderNode[];
    clusters?: Cluster[];
    onWalletClick?: (address: string) => void;
}

type SortKey = "rank" | "pct" | "tier";
type SortDir = "asc" | "desc";

const TIER_ORDER = { whale: 0, large: 1, medium: 2, small: 3 };

/** Table toggle view for the holder bubble map — searchable, sortable, with tags. */
export function HolderTable({ nodes, clusters = [], onWalletClick }: HolderTableProps) {
    const [query, setQuery] = useState("");
    const [sortKey, setSortKey] = useState<SortKey>("rank");
    const [sortDir, setSortDir] = useState<SortDir>("asc");

    // Build addr → cluster color for tag rendering
    const addrClusterColor = new Map<string, string>();
    for (const c of clusters) {
        for (const addr of c.members) {
            if (!addrClusterColor.has(addr)) addrClusterColor.set(addr, c.color);
        }
    }

    const filtered = nodes.filter(
        (n) => !query || n.address.includes(query.toLowerCase()) || n.label.toLowerCase().includes(query.toLowerCase())
    );

    const sorted = [...filtered].sort((a, b) => {
        let cmp = 0;
        if (sortKey === "rank") cmp = a.rank - b.rank;
        else if (sortKey === "pct") cmp = b.supplyPct - a.supplyPct;
        else if (sortKey === "tier") cmp = TIER_ORDER[a.riskTier] - TIER_ORDER[b.riskTier];
        return sortDir === "asc" ? cmp : -cmp;
    });

    const handleSort = (key: SortKey) => {
        if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        else {
            setSortKey(key);
            setSortDir("asc");
        }
    };

    const arrow = (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "");

    if (nodes.length === 0) {
        return <div className="holder-table-empty">No holder data available.</div>;
    }

    return (
        <div className="holder-table-wrap">
            <div className="ht-search-wrap">
                <input
                    className="ht-search"
                    placeholder="FILTER ADDRESS…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    spellCheck={false}
                />
            </div>
            <table className="holder-table">
                <thead>
                    <tr>
                        <th className="ht-col-sortable" onClick={() => handleSort("rank")}>
                            #{arrow("rank")}
                        </th>
                        <th>ADDRESS</th>
                        <th
                            className="ht-col-sortable"
                            style={{ textAlign: "right" }}
                            onClick={() => handleSort("pct")}
                        >
                            SUPPLY %{arrow("pct")}
                        </th>
                        <th
                            className="ht-col-sortable"
                            style={{ textAlign: "right" }}
                            onClick={() => handleSort("tier")}
                        >
                            RISK{arrow("tier")}
                        </th>
                        <th>TAGS</th>
                    </tr>
                </thead>
                <tbody>
                    {sorted.map((n) => {
                        const tags = getHolderTags(n);
                        const clusterColor = addrClusterColor.get(n.address);
                        return (
                            <tr key={n.address} className="holder-table-row" onClick={() => onWalletClick?.(n.address)}>
                                <td className="ht-rank">{n.rank}</td>
                                <td className="ht-addr">
                                    <span className="holder-tier-dot" style={{ background: clusterColor ?? n.color }} />
                                    {shortenAddress(n.address)}
                                </td>
                                <td className="ht-pct">{n.supplyPct.toFixed(3)}%</td>
                                <td className={`ht-risk ht-risk--${n.riskTier}`}>{n.riskTier.toUpperCase()}</td>
                                <td className="ht-tags-cell">
                                    {tags.map((tag) => (
                                        <span
                                            key={tag}
                                            className="ht-tag"
                                            style={{ color: TAG_COLORS[tag], borderColor: TAG_COLORS[tag] }}
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
