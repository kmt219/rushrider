/**
 * createHardenedClient — graphql-ws factory shared by all RUSH RIDER data calls.
 * Same hardening as the dexworks client: exponential backoff (1s → 15s cap,
 * 10 retries), full error payload logging, close code logging.
 */
import { createClient } from "graphql-ws";

const MAX_RETRIES = 10;
const BASE_MS = 1_000;
const CAP_MS = 15_000;

function backoffMs(attempt: number): number {
    return Math.min(BASE_MS * Math.pow(2, attempt), CAP_MS);
}

/** Serialize any thrown value (Error, GraphQLError[], CloseEvent, …) to a readable string. */
export function stringifyError(err: unknown): string {
    if (err instanceof Error) {
        return `${err.name}: ${err.message}`;
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

export function createHardenedClient(url: string, apiKey: string, label: string) {
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
            closed: (event) => {
                const ev = event as Partial<CloseEvent>;
                console.warn(`[${label}] WS closed — code: ${ev?.code ?? "?"}, reason: "${ev?.reason ?? "(none)"}"`);
            },
            error: (err: unknown) => {
                console.error(`[${label}] WS error —\n${stringifyError(err)}`);
            },
        },
    });
}

export type StreamClient = ReturnType<typeof createHardenedClient>;
