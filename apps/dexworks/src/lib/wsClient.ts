/**
 * createHardenedClient — shared graphql-ws factory for all GoldRush streaming hooks.
 *
 * Provides:
 *  - Exponential backoff: 1 s → 2 s → 4 s → … capped at 15 s (max 10 retries)
 *  - Full error payload logging (handles Error, GraphQLError[], plain objects)
 *  - WebSocket close code + reason logged on every closure
 *  - Chain enum format validation (SCREAMING_SNAKE_CASE required by GoldRush Streaming)
 */
import { createClient } from "graphql-ws";

const MAX_RETRIES = 10;
const BASE_MS = 1_000;
const CAP_MS = 15_000;

function backoffMs(attempt: number): number {
    return Math.min(BASE_MS * Math.pow(2, attempt), CAP_MS);
}

/** GoldRush Streaming enums must be SCREAMING_SNAKE_CASE, e.g. MEGAETH_MAINNET */
export function validateChainEnum(chainName: string, label: string): void {
    if (!/^[A-Z0-9_]+$/.test(chainName)) {
        throw new TypeError(
            `[${label}] Invalid chain name "${chainName}": must be SCREAMING_SNAKE_CASE. ` +
                `Check VITE_CHAIN_NAME in your .env file. ` +
                `Example: MEGAETH_MAINNET`
        );
    }
}

/**
 * Serialize any thrown value to a readable string.
 *
 * graphql-ws subscription error callbacks receive GraphQLError[] (an array),
 * not an Error instance. JSON.stringify with Object.getOwnPropertyNames as the
 * replacer fails silently for arrays (returns "[]"), producing [object Object]
 * in log output. This function handles all three cases correctly.
 */
export function stringifyError(err: unknown): string {
    if (err instanceof Error) {
        // Standard JS errors: include name, message, and stack
        return `${err.name}: ${err.message}${err.stack ? `\n${err.stack}` : ""}`;
    }
    if (Array.isArray(err)) {
        // graphql-ws passes subscription errors as GraphQLError[]
        try {
            return JSON.stringify(err, null, 2);
        } catch {
            return String(err);
        }
    }
    if (err !== null && typeof err === "object") {
        // CloseEvent, plain objects, etc. — enumerate own properties explicitly
        try {
            const props = Object.getOwnPropertyNames(err);
            return props.length > 0 ? JSON.stringify(err, props, 2) : JSON.stringify(err, null, 2);
        } catch {
            return String(err);
        }
    }
    return String(err);
}

export interface HardenedClientOptions {
    url: string;
    apiKey: string;
    label: string;
    /** Called when the WS transitions to connected. Hook must guard with its own `cancelled` flag. */
    onConnected?: () => void;
    /** Called when the WS closes (including between retries). */
    onClosed?: () => void;
    /** Called on WS-level error. */
    onError?: (err: unknown) => void;
}

export function createHardenedClient({ url, apiKey, label, onConnected, onClosed, onError }: HardenedClientOptions) {
    return createClient({
        url,
        connectionParams: { GOLDRUSH_API_KEY: apiKey },
        keepAlive: 15_000,
        retryAttempts: MAX_RETRIES,
        shouldRetry: () => true,
        retryWait: async (attempt) => {
            const delay = backoffMs(attempt);
            console.warn(`[${label}] Reconnecting in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
            await new Promise<void>((resolve) => setTimeout(resolve, delay));
        },
        on: {
            connected: () => {
                console.log(`[${label}] WS connected`);
                onConnected?.();
            },
            closed: (event) => {
                // Browser CloseEvent has .code and .reason; Node.js env may differ
                const ev = event as Partial<CloseEvent>;
                console.warn(`[${label}] WS closed — code: ${ev?.code ?? "?"}, reason: "${ev?.reason || "(none)"}"`);
                onClosed?.();
            },
            error: (err: unknown) => {
                console.error(`[${label}] WS error —\n${stringifyError(err)}`);
                onError?.(err);
            },
        },
    });
}
