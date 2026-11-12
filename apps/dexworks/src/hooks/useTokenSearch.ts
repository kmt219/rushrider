/**
 * useTokenSearch — executes a one-shot token search over the GoldRush stream.
 *
 * Gap 9 fix: generation counter.  Each new search increments `generationRef`;
 * responses from earlier searches are silently dropped instead of overwriting
 * fresh results with stale ones.
 *
 * Gap 10 fix: reuses createHardenedClient (exponential back-off, keepAlive)
 * instead of a bare createClient that silently hangs on disconnect.  The
 * client is created once and reused across searches; it is only recreated
 * when apiKey or streamUrl changes.
 */
import { createHardenedClient } from "../lib/wsClient";
import { buildTokenSearchQuery } from "../queries";
import type { TokenSearchResult } from "../types";
import { useCallback, useRef, useState } from "react";

// Module-level cache — survives hook remounts and re-searches within the same session.
interface SearchCacheEntry {
    results: TokenSearchResult[];
    timestamp: number;
}
const MAX_SEARCH_CACHE = 100;
const searchCache = new Map<string, SearchCacheEntry>();
const SEARCH_CACHE_TTL = 30_000; // 30 seconds

export function useTokenSearch(apiKey: string, streamUrl: string) {
    const [results, setResults] = useState<TokenSearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Persisted hardened client — recreated only when credentials change.
    const clientRef = useRef<ReturnType<typeof createHardenedClient> | null>(null);
    const clientCredsRef = useRef<{ apiKey: string; streamUrl: string } | null>(null);

    // Generation counter for race-condition prevention.
    const generationRef = useRef(0);

    // Cleanup handle for the active subscription.
    const unsubscribeRef = useRef<(() => void) | null>(null);

    const getClient = useCallback(() => {
        if (
            !clientRef.current ||
            clientCredsRef.current?.apiKey !== apiKey ||
            clientCredsRef.current?.streamUrl !== streamUrl
        ) {
            clientRef.current?.dispose();
            clientRef.current = createHardenedClient({
                url: streamUrl,
                apiKey,
                label: "TokenSearch",
                onConnected: () => {},
                onClosed: () => {},
                onError: () => {},
            });
            clientCredsRef.current = { apiKey, streamUrl };
        }
        return clientRef.current;
    }, [apiKey, streamUrl]);

    const search = useCallback(
        (query: string) => {
            if (!query.trim()) {
                setResults([]);
                setError(null);
                return;
            }

            // Cancel any in-flight subscription before starting a new one.
            unsubscribeRef.current?.();
            unsubscribeRef.current = null;

            const gen = ++generationRef.current;

            // Cache hit — return instantly without a new subscription.
            const cacheHit = searchCache.get(query.toLowerCase());
            if (cacheHit && Date.now() - cacheHit.timestamp < SEARCH_CACHE_TTL) {
                setResults(cacheHit.results);
                setIsSearching(false);
                return;
            }

            setIsSearching(true);
            setError(null);

            const client = getClient();
            const { query: gqlQuery, variables } = buildTokenSearchQuery(query);

            const unsub = client.subscribe<{ searchToken: TokenSearchResult[] }>(
                { query: gqlQuery, variables },
                {
                    next: (data) => {
                        if (gen !== generationRef.current) return; // stale response
                        if (data.data?.searchToken) {
                            const incoming = data.data.searchToken;
                            // Write to cache so repeat searches are instant.
                            searchCache.set(query.toLowerCase(), { results: incoming, timestamp: Date.now() });
                            // Evict oldest entry when cache grows too large.
                            if (searchCache.size > MAX_SEARCH_CACHE) {
                                const firstKey = searchCache.keys().next().value;
                                if (firstKey !== undefined) searchCache.delete(firstKey);
                            }
                            setResults(incoming);
                        }
                        setIsSearching(false);
                    },
                    error: (err) => {
                        if (gen !== generationRef.current) return;
                        console.error("Token search error:", err);
                        setError("Search failed. Please try again.");
                        setIsSearching(false);
                    },
                    complete: () => {
                        if (gen !== generationRef.current) return;
                        setIsSearching(false);
                    },
                }
            );

            unsubscribeRef.current = unsub;
        },
        [getClient]
    );

    const clearResults = useCallback(() => {
        unsubscribeRef.current?.();
        unsubscribeRef.current = null;
        generationRef.current++; // invalidate any pending response
        setResults([]);
        setError(null);
        setIsSearching(false);
    }, []);

    return {
        search,
        results,
        isSearching,
        error,
        clearResults,
    };
}
