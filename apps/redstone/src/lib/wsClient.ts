/**
 * createHardenedClient — graphql-ws factory for GoldRush streaming.
 *
 * Provides:
 *  - Exponential backoff: 1 s -> 2 s -> 4 s -> ... capped at 15 s (max 10 retries)
 *  - Full error payload logging (handles Error, GraphQLError[], plain objects)
 *  - WebSocket close code + reason logged on every closure
 */
import { createClient } from "graphql-ws";

const MAX_RETRIES = 10;
const BASE_MS = 1_000;
const CAP_MS = 15_000;

function backoffMs(attempt: number): number {
    return Math.min(BASE_MS * Math.pow(2, attempt), CAP_MS);
}

/**
 * Serialize any thrown value to a readable string.
 *
 * graphql-ws subscription error callbacks receive GraphQLError[] (an array),
 * not an Error instance. This function handles all three cases correctly.
 */
export function stringifyError(err: unknown): string {
    if (err instanceof Error) {
        return `${err.name}: ${err.message}${err.stack ? `\n${err.stack}` : ""}`;
    }
    if (Array.isArray(err)) {
        try {
            return JSON.stringify(err, null, 2);
        } catch {
            return String(err);
        }
    }
    if (err !== null && typeof err === "object") {
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
    onConnected?: () => void;
    onClosed?: () => void;
    onError?: (err: unknown) => void;
}

export function createHardenedClient({ url, apiKey, label, onConnected, onClosed, onError }: HardenedClientOptions) {
    return createClient({
        url,
        connectionParams: { GOLDRUSH_API_KEY: apiKey },
        keepAlive: 30_000,
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
