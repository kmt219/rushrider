import { CATEGORY_TREATMENTS } from "./categories";
import { getWrappedNativeAddress } from "./chains";
import { isStablecoin } from "./stablecoins";
import type { Category, Transfer, Transaction, Treatment } from "./types";
import { isZeroAddress, normalizeAddress } from "./utils";

/** Known bridge contract addresses (lowercase) */
const BRIDGE_ADDRESSES = new Set([
    "0x3154cf16ccdb4c6d922629664174b904d80f2c35", // Across Bridge
    "0x5427fefa711eff984124bfbb1ab6fbf5e3da1820", // Synapse Bridge
    "0xd9d74a29307cc6fc8bf424ee4217f1a587fbc8dc", // Hop Bridge
    "0x99c9fc46f92e8a1c0dec1b1747d010903e884be1", // Optimism Gateway
    "0x4dbd4fc535ac27206064b68ffcf827b0a60bab3f", // Arbitrum Gateway
    "0x3ee18b2214aff97000d974cf647e7c347e8fa585", // Wormhole
]);

/** Classify a transaction based on its transfers */
export function classifyTransaction(
    tx: Transaction,
    walletAddress: string
): { category: Category; transfers: Transfer[] } {
    const wallet = normalizeAddress(walletAddress);
    const transfers = tx.transfers.map((t) => ({ ...t }));

    // Bucket each transfer
    for (const t of transfers) {
        const fromMe = normalizeAddress(t.from) === wallet;
        const toMe = normalizeAddress(t.to) === wallet;
        if (isZeroAddress(t.to)) {
            t.bucket = "BURNED";
        } else if (isZeroAddress(t.from)) {
            t.bucket = "MINTED";
        } else if (fromMe && toMe) {
            t.bucket = "SELF";
        } else if (fromMe) {
            t.bucket = "SENT";
        } else if (toMe) {
            t.bucket = "RECEIVED";
        } else {
            t.bucket = "SELF"; // internal, not involving wallet directly
        }
    }

    // Filter to only transfers involving the wallet
    const relevant = transfers.filter((t) => normalizeAddress(t.from) === wallet || normalizeAddress(t.to) === wallet);

    const sent = relevant.filter((t) => t.bucket === "SENT" || t.bucket === "BURNED");
    const received = relevant.filter((t) => t.bucket === "RECEIVED" || t.bucket === "MINTED");

    // Failed transaction
    if (!tx.successful) {
        const category: Category = "ERROR";
        applyTreatments(transfers, category);
        return { category, transfers };
    }

    // No transfers at all → just a gas fee
    if (sent.length === 0 && received.length === 0) {
        const selfTransfers = relevant.filter((t) => t.bucket === "SELF");
        if (selfTransfers.length > 0) {
            applyTreatments(transfers, "SELF");
            return { category: "SELF", transfers };
        }
        applyTreatments(transfers, "FEE");
        return { category: "FEE", transfers };
    }

    let category: Category = "UNKNOWN";

    // Check for bridge
    if (sent.length > 0) {
        const toBridge = sent.some((t) => BRIDGE_ADDRESSES.has(normalizeAddress(t.to)));
        if (toBridge) {
            category = "BRIDGE_OUT";
            applyTreatments(transfers, category);
            return { category, transfers };
        }
    }
    if (received.length > 0 && sent.length === 0) {
        const fromBridge = received.some((t) => BRIDGE_ADDRESSES.has(normalizeAddress(t.from)));
        if (fromBridge) {
            category = "BRIDGE_IN";
            applyTreatments(transfers, category);
            return { category, transfers };
        }
    }

    // Check for wrap/unwrap (native ↔ wrapped native)
    const wrappedNative = getWrappedNativeAddress(tx.chain);
    if (wrappedNative && sent.length === 1 && received.length === 1) {
        const s = sent[0]!;
        const r = received[0]!;
        const sAddr = normalizeAddress(s.token.contractAddress);
        const rAddr = normalizeAddress(r.token.contractAddress);
        const wAddr = normalizeAddress(wrappedNative);
        const nativeAddr = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
        if ((sAddr === nativeAddr && rAddr === wAddr) || (sAddr === wAddr && rAddr === nativeAddr)) {
            category = sAddr === nativeAddr ? "WRAP" : "UNWRAP";
            applyTreatments(transfers, category);
            return { category, transfers };
        }
    }

    // Pattern matching by (sent count, received count)
    if (sent.length === 0 && received.length === 1) {
        // Received something, sent nothing → airdrop or income
        const r = received[0]!;
        if (isZeroAddress(r.from)) {
            category = "INCOME"; // minted to wallet (staking reward, etc)
        } else {
            category = r.amount * r.rate < 1 ? "SPAM" : "AIRDROP";
        }
    } else if (sent.length === 0 && received.length > 1) {
        // Multiple receives, no sends → airdrop/claim
        category = "AIRDROP";
    } else if (sent.length === 1 && received.length === 0) {
        category = "TRANSFER_OUT";
    } else if (sent.length === 1 && received.length === 1) {
        const s = sent[0]!;
        const r = received[0]!;
        if (s.token.symbol === r.token.symbol) {
            category = "SELF";
        } else {
            category = "SWAP";
        }
    } else if (sent.length === 2 && received.length === 1) {
        category = "ADD_LIQUIDITY";
    } else if (sent.length === 1 && received.length === 2) {
        category = "REMOVE_LIQUIDITY";
    } else if (sent.length >= 1 && received.length >= 1) {
        // Multi-token exchange → treat as swap
        category = "SWAP";
    } else {
        category = "UNKNOWN";
    }

    // Check for stablecoin-only swaps (still taxable in US but worth noting)
    if (category === "SWAP") {
        const allStable = [...sent, ...received].every((t) => isStablecoin(tx.chain, t.token.contractAddress));
        if (allStable) {
            // Still a SWAP but the gains should be minimal
        }
    }

    applyTreatments(transfers, category);
    return { category, transfers };
}

function applyTreatments(transfers: Transfer[], category: Category): void {
    const treatments = CATEGORY_TREATMENTS[category];
    for (const t of transfers) {
        if (t.bucket === "SENT" || t.bucket === "BURNED") {
            t.treatment = treatments.sent;
        } else if (t.bucket === "RECEIVED" || t.bucket === "MINTED") {
            t.treatment = treatments.received;
        } else {
            t.treatment = "ignore" satisfies Treatment;
        }
    }
}
