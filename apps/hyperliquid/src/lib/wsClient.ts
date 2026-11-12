/**
 * createHardenedClient — shared graphql-ws factory for GoldRush streaming hooks.
 *
 * Provides:
 *  - Exponential backoff: 1s → 2s → 4s → … capped at 15s (max 10 retries)
 *  - Full error payload logging
 *  - WebSocket close code + reason logged on every closure
 */
import { createClient, type Client } from "graphql-ws";

const MAX_RETRIES = 10;
const BASE_MS = 1_000;
const CAP_MS = 15_000;

function backoffMs(attempt: number): number {
    return Math.min(BASE_MS * Math.pow(2, attempt), CAP_MS);
}

export function stringifyError(err: unknown): string {
    if (err instanceof Error) return `${err.name}: ${err.message}`;
    if (Array.isArray(err)) {
        try {
            return JSON.stringify(err, null, 2);
        } catch {
            return String(err);
        }
    }
    if (err !== null && typeof err === "object") {
        try {
            return JSON.stringify(err, Object.getOwnPropertyNames(err), 2);
        } catch {
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            return String(err);
        }
    }
    return String(err);
}

export interface HardenedClientOptions {
    url: string;
    apiKey: string;
    label: string;
    /** When false (default), the WebSocket opens immediately on client creation.
     *  Set to true only for hooks that create their own per-subscription client. */
    lazy?: boolean;
    onConnected?: () => void;
    onClosed?: () => void;
    onError?: (err: unknown) => void;
}

export function createHardenedClient({
    url,
    apiKey,
    label,
    lazy = false,
    onConnected,
    onClosed,
    onError,
}: HardenedClientOptions): Client {
    return createClient({
        url,
        connectionParams: { GOLDRUSH_API_KEY: apiKey },
        lazy,
        keepAlive: 15_000,
        retryAttempts: MAX_RETRIES,
        shouldRetry: () => true,
        retryWait: async (attempt) => {
            const delay = backoffMs(attempt);
            // eslint-disable-next-line no-console
            console.warn(`[${label}] Reconnecting in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
            await new Promise<void>((resolve) => setTimeout(resolve, delay));
        },
        on: {
            connected: () => {
                // eslint-disable-next-line no-console
                console.log(`[${label}] WS connected`);
                onConnected?.();
            },
            closed: (event) => {
                const ev = event as Partial<CloseEvent>;
                // eslint-disable-next-line no-console
                console.warn(`[${label}] WS closed — code: ${ev?.code ?? "?"}, reason: "${ev?.reason || "(none)"}"`);
                onClosed?.();
            },
            error: (err: unknown) => {
                // eslint-disable-next-line no-console
                console.error(`[${label}] WS error —\n${stringifyError(err)}`);
                onError?.(err);
            },
        },
    });
}
