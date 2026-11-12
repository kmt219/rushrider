/**
 * holderTags.ts — Behavioral tag classifier for holder nodes.
 * Pure function — no API calls, no React.
 *
 * Static tags (WHALE, CLUSTER) are derived from HolderNode alone.
 * Behavioral tags (FRESH, DIAMOND, FLIPPER) require transaction history
 * fetched by WalletFlyout and are computed via computeBehavioralTags().
 */
import type { HolderNode } from "../types";

export type HolderTag = "WHALE" | "FRESH" | "DIAMOND" | "FLIPPER" | "CLUSTER";

export function getHolderTags(node: HolderNode): HolderTag[] {
    const tags: HolderTag[] = [];
    if (node.supplyPct >= 5) tags.push("WHALE");
    if (node.clusterIds.length > 0) tags.push("CLUSTER");
    return tags;
}

/**
 * Derives FRESH / DIAMOND / FLIPPER tags from transactions_v3 data.
 * Called inside WalletFlyout once the tx list is fetched.
 *
 * Heuristics (page-limited to ≤25 txs — treat as conservative lower-bound):
 *   FRESH   — oldest visible tx is <30 days old AND total tx count is small
 *             (avoids tagging active wallets whose deep history is off-page)
 *   DIAMOND — has inbound swaps/transfers but zero outbound sell-type txs
 *             in the visible window (hasn't sold within this sample)
 *   FLIPPER — has both inbound and outbound swap activity in visible window
 */
export function computeBehavioralTags(
    txs: { decoded_type?: string; from_address?: string; to_address?: string; block_signed_at?: string }[],
    walletAddress: string
): HolderTag[] {
    if (txs.length === 0) return [];
    const addr = walletAddress.toLowerCase();
    const tags: HolderTag[] = [];
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

    // FRESH: oldest tx in the fetched page is <30 days old.
    // Also require that we see fewer than 10 txs total (if the page is full at 25,
    // the wallet almost certainly has older history we can't see — not actually fresh).
    const oldest = txs[txs.length - 1];
    const newest = txs[0];
    if (oldest?.block_signed_at && newest?.block_signed_at) {
        const oldestAgeMs = Date.now() - new Date(oldest.block_signed_at).getTime();
        // Only tag FRESH if the oldest visible tx is genuinely new, OR
        // if there are very few txs (wallet has limited history overall)
        if (oldestAgeMs < THIRTY_DAYS || txs.length < 5) {
            tags.push("FRESH");
        }
    }

    const isSwapOrTransfer = (type?: string) => {
        const t = type?.toLowerCase() ?? "";
        return t.includes("swap") || t.includes("transfer");
    };

    // Outbound: wallet initiated the tx and it's a swap/transfer (selling / moving tokens)
    const outboundSells = txs.filter(
        (tx) => tx.from_address?.toLowerCase() === addr && isSwapOrTransfer(tx.decoded_type)
    );
    // Inbound: wallet received tokens via swap/transfer (buying)
    const inboundBuys = txs.filter((tx) => tx.to_address?.toLowerCase() === addr && isSwapOrTransfer(tx.decoded_type));

    // DIAMOND: has inbound buys but zero outbound sells in the visible window
    if (outboundSells.length === 0 && inboundBuys.length > 0) tags.push("DIAMOND");

    // FLIPPER: active on both sides of the market in the visible window
    if (outboundSells.length > 0 && inboundBuys.length > 0) tags.push("FLIPPER");

    return tags;
}

export const TAG_COLORS: Record<HolderTag, string> = {
    WHALE: "var(--danger, #ef4444)",
    CLUSTER: "#a855f7",
    FRESH: "var(--fg-muted, #888)",
    DIAMOND: "var(--accent, #00d084)",
    FLIPPER: "var(--warning, #f59e0b)",
};
