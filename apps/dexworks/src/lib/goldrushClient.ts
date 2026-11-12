/**
 * goldrushClient — typed fetch wrapper for the GoldRush Foundational API v1.
 *
 * Auth: Basic auth with the API key as username and an empty password.
 * All calls go directly to api.covalenthq.com — no server-side proxy needed.
 *
 * In-flight deduplication: if the same URL is requested concurrently, only one
 * network request is made; all callers share the same Promise.
 *
 * In-memory cache: successful responses are cached by URL for `cacheTtlMs`
 * (default 2 min). Pass cacheTtlMs=0 to bypass.
 */

const BASE = "https://api.covalenthq.com/v1";

const credentials = btoa(`${import.meta.env.VITE_GOLDRUSH_API_KEY}:`);

export interface GoldRushError {
    /** HTTP status code, or 0 for an API-level error (json.error === true). */
    status: number;
    message: string;
}

const _cache = new Map<string, { data: unknown; expiresAt: number }>();
const _inflight = new Map<string, Promise<unknown>>();

const DEFAULT_TTL_MS = 2 * 60 * 1000; // 2 min

/**
 * Fetches a GoldRush Foundational API endpoint and returns the typed `data` payload.
 *
 * @param path        Path under /v1/, e.g. "megaeth-mainnet/block_v2/latest/"
 * @param params      Optional query string parameters.
 * @param cacheTtlMs  In-memory cache TTL in ms (default 2 min). Pass 0 to skip cache.
 * @throws {GoldRushError} on HTTP errors or API-level errors (json.error === true).
 */
export async function goldrushFetch<T>(
    path: string,
    params?: Record<string, string>,
    cacheTtlMs = DEFAULT_TTL_MS
): Promise<T> {
    const url = new URL(`${BASE}/${path}`);
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            url.searchParams.set(k, v);
        }
    }
    const key = url.toString();

    // Cache hit
    if (cacheTtlMs > 0) {
        const hit = _cache.get(key);
        if (hit && Date.now() < hit.expiresAt) return hit.data as T;
    }

    // In-flight deduplication — if same URL is already being fetched, reuse the Promise
    const existing = _inflight.get(key);
    if (existing) return existing as Promise<T>;

    const promise = (async () => {
        const res = await fetch(key, {
            headers: { Authorization: `Basic ${credentials}` },
        });

        if (!res.ok) {
            throw { status: res.status, message: res.statusText } satisfies GoldRushError;
        }

        const json = (await res.json()) as { data: T; error: boolean; error_message: string | null };

        if (json.error) {
            throw { status: 0, message: json.error_message ?? "API error" } satisfies GoldRushError;
        }

        if (cacheTtlMs > 0) {
            _cache.set(key, { data: json.data, expiresAt: Date.now() + cacheTtlMs });
        }
        return json.data;
    })();

    _inflight.set(key, promise);
    // Use then/catch instead of .finally() — .finally() propagates the rejection to
    // its own returned promise, which is unhandled and logs a noisy console error.
    promise.then(
        () => _inflight.delete(key),
        () => _inflight.delete(key)
    );

    return promise;
}
