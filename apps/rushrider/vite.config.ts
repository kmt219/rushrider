import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");

    // Vite's proxy target must use http/https even for WebSocket connections.
    const rawStreamUrl = env.VITE_GOLDRUSH_STREAM_URL ?? "wss://streaming.goldrushdata.com/graphql";
    const streamUrlParsed = new URL(rawStreamUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:"));
    const streamProxyTarget = `${streamUrlParsed.protocol}//${streamUrlParsed.host}`;
    const streamProxyPath = streamUrlParsed.pathname;

    return {
        plugins: [react()],
        server: {
            proxy: {
                // WebSocket proxy: avoids Firefox mixed-content block (wss:// from http://localhost).
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
