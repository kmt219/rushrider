/**
 * streamStatus — tiny singleton that surfaces GraphQL stream errors to the UI.
 * Data calls swallow per-attempt errors (parallel fallback races make most of
 * them noise), but auth/credit failures should be visible, not a silent
 * "no data" state.
 */
type Listener = (message: string) => void;

let lastError: string | null = null;
const listeners = new Set<Listener>();

/** Extract a human-readable reason from a graphql-ws error payload. */
export function describeStreamError(err: unknown): string {
    if (Array.isArray(err)) {
        const first = err[0] as { message?: string; extensions?: { code?: string } } | undefined;
        const code = first?.extensions?.code;
        const msg = first?.message ?? "Unknown stream error";
        return code ? `${code}: ${msg}` : msg;
    }
    if (err instanceof Error) {
        return err.message;
    }
    return String(err);
}

export function reportStreamError(err: unknown): void {
    const message = describeStreamError(err);
    lastError = message;
    for (const l of listeners) {
        l(message);
    }
}

export function getLastStreamError(): string | null {
    return lastError;
}

export function onStreamError(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
