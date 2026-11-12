import { createClient, Client } from "graphql-ws";
import { useEffect, useRef } from "react";

let sharedClient: Client | null = null;
let clientRefCount = 0;

export function preWarmSharedClient(apiKey: string, streamUrl: string): void {
    if (!sharedClient && apiKey && streamUrl) {
        console.log("[SharedClient] Pre-warming WS connection before React renders");
        sharedClient = createClient({
            url: streamUrl,
            connectionParams: { GOLDRUSH_API_KEY: apiKey },
            keepAlive: 15_000,
            retryAttempts: Infinity,
            shouldRetry: () => true,
            on: {
                connected: () => console.log("[SharedClient] ✓ Pre-warm connected"),
                closed: () => {},
                error: () => {},
                connecting: () => console.log("[SharedClient] Pre-warming..."),
            },
        });
    }
}

export function useSharedStreamClient(apiKey: string, streamUrl: string): Client | null {
    const clientRef = useRef<Client | null>(null);

    useEffect(() => {
        // Track whether this effect invocation successfully registered a ref-count
        // increment, so the cleanup only decrements if creation actually succeeded.
        let registered = false;

        // Create shared client on first use
        if (!sharedClient && apiKey && streamUrl) {
            console.log("[SharedClient] Creating shared GraphQL WebSocket client");
            console.log("[SharedClient] URL:", streamUrl);
            console.log("[SharedClient] API Key:", apiKey ? `${apiKey.slice(0, 10)}...` : "missing");

            try {
                sharedClient = createClient({
                    url: streamUrl,
                    connectionParams: {
                        GOLDRUSH_API_KEY: apiKey,
                    },
                    keepAlive: 15_000,
                    retryAttempts: Infinity,
                    shouldRetry: (err) => {
                        console.warn("[SharedClient] Connection error, retrying:", err);
                        return true;
                    },
                    on: {
                        connected: () => console.log("[SharedClient] ✓ Shared stream connected"),
                        closed: (event) => console.log("[SharedClient] Shared stream closed:", event),
                        error: (err) => console.error("[SharedClient] ✗ Shared stream error:", err),
                        connecting: () => console.log("[SharedClient] Connecting..."),
                    },
                });
            } catch (err) {
                console.error("[SharedClient] Failed to create client:", err);
                sharedClient = null;
            }
        }

        if (sharedClient) {
            clientRef.current = sharedClient;
            clientRefCount++;
            registered = true;
        }

        return () => {
            if (!registered) return;
            clientRefCount--;
            // Dispose shared client when last hook unmounts
            if (clientRefCount === 0 && sharedClient) {
                console.log("[SharedClient] Disposing shared GraphQL WebSocket client");
                sharedClient.dispose();
                sharedClient = null;
            }
        };
    }, [apiKey, streamUrl]);

    return clientRef.current;
}
