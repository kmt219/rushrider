import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "http";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
    // loadEnv with prefix "" loads all env vars (including non-VITE_ ones used
    // server-side in this config file, such as VITE_MEGAETH_RPC_URL).
    const env = loadEnv(mode, process.cwd(), "");

    // Parse the stream URL so we can split target (scheme://host) from path for the WS proxy.
    // Vite's proxy target must use http/https even for WebSocket connections.
    const rawStreamUrl = env.VITE_GOLDRUSH_STREAM_URL ?? "wss://streaming.goldrushdata.com/graphql";
    const streamUrlParsed = new URL(rawStreamUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:"));
    const streamProxyTarget = `${streamUrlParsed.protocol}//${streamUrlParsed.host}`;
    const streamProxyPath = streamUrlParsed.pathname; // typically "/graphql"

    return {
        plugins: [
            react(),
            {
                // Dev proxy for /api/gems-cache — delegates to the actual Edge Function
                // handler (api/gems-cache.ts) via Vite's ssrLoadModule so all KV logic
                // lives in one place: the backend, not this config file.
                // KV_REST_API_URL / KV_REST_API_TOKEN are injected into process.env from
                // the local .env file so dev and production use identical KV behaviour.
                name: "gems-cache",
                configureServer(server) {
                    if (env.KV_REST_API_URL) process.env.KV_REST_API_URL = env.KV_REST_API_URL;
                    if (env.KV_REST_API_TOKEN) process.env.KV_REST_API_TOKEN = env.KV_REST_API_TOKEN;

                    server.middlewares.use("/api/gems-cache", async (req: IncomingMessage, res: ServerResponse) => {
                        try {
                            const chunks: Buffer[] = [];
                            await new Promise<void>((resolve) => {
                                req.on("data", (chunk: Buffer) => chunks.push(chunk));
                                req.on("end", resolve);
                            });
                            const body = chunks.length > 0 ? Buffer.concat(chunks).toString() : undefined;
                            const url = new URL(req.url ?? "/", "http://localhost:5173");
                            const webReq = new Request(url.toString(), {
                                method: req.method ?? "GET",
                                body: body || undefined,
                            });
                            // Load and execute the actual Edge Function handler via Vite's
                            // SSR module transform — TypeScript is compiled on the fly, no
                            // duplication of KV logic needed here.
                            const mod = await server.ssrLoadModule("/api/gems-cache.ts");
                            const handler = mod.default as (r: Request) => Promise<Response>;
                            const response = await handler(webReq);
                            res.statusCode = response.status;
                            response.headers.forEach((v, k) => res.setHeader(k, v));
                            res.end(await response.text());
                        } catch (err) {
                            const msg = err instanceof Error ? err.message : String(err);
                            res.statusCode = 500;
                            res.setHeader("Content-Type", "application/json");
                            res.end(JSON.stringify({ ok: false, error: msg }));
                        }
                    });
                },
            },
            {
                // Dev proxy for /api/lp/* — single catch-all middleware with explicit URL
                // matching so we never depend on connect's prefix-stripping behaviour.
                // Calls next() for any path that isn't an LP endpoint so Vite's own
                // middleware can continue handling the request normally.
                name: "lp-api",
                configureServer(server) {
                    if (env.POSTGRES_URL) process.env.POSTGRES_URL = env.POSTGRES_URL;
                    if (env.BASE_RPC_URL) process.env.BASE_RPC_URL = env.BASE_RPC_URL;

                    const LP_ENDPOINTS = new Set(["positions", "il-over-time", "position-history", "liquidity-depth"]);

                    // Mounted without a path so connect never strips the URL — we parse
                    // req.url ourselves and call next() for non-LP requests.
                    server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
                        // req.url is always the full path+query for a no-prefix mount
                        const rawUrl = req.url ?? "";
                        // match /api/lp/<endpoint> with optional query string
                        const match = /^\/api\/lp\/([^/?]+)/.exec(rawUrl);
                        const ep = match?.[1];
                        if (!ep || !LP_ENDPOINTS.has(ep)) {
                            next();
                            return;
                        }
                        try {
                            const fullUrl = `http://localhost:5173${rawUrl}`;
                            const mod = await server.ssrLoadModule(`/api/lp/${ep}.ts`);
                            const handler = mod.default as (r: Request) => Promise<Response>;
                            const webReq = new Request(fullUrl, { method: req.method ?? "GET" });
                            const response = await handler(webReq);
                            res.statusCode = response.status;
                            response.headers.forEach((v, k) => res.setHeader(k, v));
                            res.end(await response.text());
                        } catch (err) {
                            const msg = err instanceof Error ? err.message : String(err);
                            console.error(`[lp-api] ${ep}:`, msg);
                            res.statusCode = 500;
                            res.setHeader("Content-Type", "application/json");
                            res.end(JSON.stringify({ error: msg }));
                        }
                    });
                },
            },
            {
                // Local dev mirror of the api/covalent-proxy.ts Vercel Edge Function.
                // Routes /api/covalent-proxy?path=<path>&<params> → Covalent REST API
                // with the API key injected server-side.  Follows redirects (fixes
                // the block/{n}/transactions_v3 → block_hash/ CORS redirect issue).
                name: "covalent-proxy",
                configureServer(server) {
                    server.middlewares.use("/api/covalent-proxy", (req: IncomingMessage, res: ServerResponse) => {
                        const apiKey = env.VITE_GOLDRUSH_API_KEY ?? "";
                        const reqUrl = new URL(req.url ?? "/", "http://localhost");
                        const path = reqUrl.searchParams.get("path") ?? "";

                        if (!path) {
                            res.statusCode = 400;
                            res.setHeader("Content-Type", "application/json");
                            res.end(
                                JSON.stringify({ status: 400, error_message: "Missing required query param: path" })
                            );
                            return;
                        }

                        const upstream = new URL(`https://api.covalenthq.com/v1/${path}`);
                        for (const [k, v] of reqUrl.searchParams.entries()) {
                            if (k !== "path") upstream.searchParams.set(k, v);
                        }
                        upstream.searchParams.set("key", apiKey);

                        fetch(upstream.toString(), {
                            headers: { Accept: "application/json" },
                            redirect: "follow",
                        })
                            .then(async (r) => {
                                const body = await r.text();
                                res.statusCode = r.status;
                                res.setHeader("Content-Type", "application/json");
                                res.setHeader("Access-Control-Allow-Origin", "*");
                                res.end(body);
                            })
                            .catch((err: unknown) => {
                                const msg = err instanceof Error ? err.message : String(err);
                                res.statusCode = 502;
                                res.setHeader("Content-Type", "application/json");
                                res.end(JSON.stringify({ status: 502, error_message: msg }));
                            });
                    });
                },
            },
        ],
        server: {
            proxy: {
                // Proxy /api/rpc to the MegaETH RPC during local development.
                // This mirrors the Vercel Edge Function at apps/dexworks/api/rpc.ts
                // and avoids CORS errors from direct browser → RPC calls.
                // Override the target via VITE_MEGAETH_RPC_URL in .env (see .env.example).
                "/api/rpc": {
                    target: env.VITE_MEGAETH_RPC_URL ?? "https://carrot.megaeth.com",
                    changeOrigin: true,
                    rewrite: () => "/",
                },
                "/api/mainnet-rpc": {
                    target: env.VITE_MEGAETH_MAINNET_RPC_URL ?? "https://mainnet.megaeth.com",
                    changeOrigin: true,
                    rewrite: () => "/rpc",
                },
                "/api/defillama-fees": {
                    target: "https://api.llama.fi",
                    changeOrigin: true,
                    rewrite: () => "/summary/fees/kumbaya?dataType=dailyFees",
                },
                // WebSocket proxy: avoids Firefox mixed-content block (wss:// from http://localhost).
                // In dev the browser connects to ws://localhost:5173/api/ws and Vite forwards
                // to the real GoldRush streaming endpoint over TLS.
                "/api/ws": {
                    target: streamProxyTarget,
                    ws: true,
                    changeOrigin: true,
                    rewrite: () => streamProxyPath,
                },
            },
        },
    };
});
