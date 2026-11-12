import { neon } from "@neondatabase/serverless";

// Map of known pool addresses (lowercase) to token metadata for demo display.
// Add pools here as new pipelines are configured on GoldRush Platform.
export const KNOWN_POOLS: Record<
    string,
    {
        token0: { symbol: string; decimals: number };
        token1: { symbol: string; decimals: number };
        tickSpacing: number;
        feeTier: string;
    }
> = {
    "0xd0b53d9277642d899df5c87a3966a349a798f224": {
        token0: { symbol: "WETH", decimals: 18 },
        token1: { symbol: "USDC", decimals: 6 },
        tickSpacing: 10,
        feeTier: "0.05%",
    },
    "0x4c36388be6f416a29c8d8eee81c771ce6be14b0": {
        token0: { symbol: "cbETH", decimals: 18 },
        token1: { symbol: "WETH", decimals: 18 },
        tickSpacing: 10,
        feeTier: "0.05%",
    },
};

export function getDb() {
    const url = process.env.POSTGRES_URL;
    if (!url) throw new Error("POSTGRES_URL not set");
    return neon(url);
}

// ── Input validators ──────────────────────────────────────────────────────────

export function validateAddress(addr: string | null, name: string): string {
    if (!addr || !/^0x[0-9a-fA-F]{40}$/i.test(addr)) {
        const err = new Error(`Invalid ${name}: expected 0x + 40 hex chars`);
        (err as NodeJS.ErrnoException).code = "400";
        throw err;
    }
    return addr.toLowerCase();
}

export function validateBlockHeight(s: string | null): number {
    if (!s) return 2_147_483_647;
    const n = parseInt(s, 10);
    if (!Number.isFinite(n) || n < 0) {
        const err = new Error("Invalid block height");
        (err as NodeJS.ErrnoException).code = "400";
        throw err;
    }
    return n;
}

// ── Type-safe DB helpers ──────────────────────────────────────────────────────

export function requireString(val: unknown, field: string): string {
    if (val === null || val === undefined || typeof val !== "string") {
        throw new Error(`DB field "${field}" is null or missing`);
    }
    return val;
}

export function requireNumber(val: unknown, field: string): number {
    const n = Number(val);
    if (!Number.isFinite(n)) throw new Error(`DB field "${field}" is not numeric: ${String(val)}`);
    return n;
}
