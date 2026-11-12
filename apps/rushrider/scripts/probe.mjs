// Quick probe of the GoldRush streaming endpoint.
// Usage: node scripts/probe.mjs
import { createClient } from "graphql-ws";
import { readFileSync } from "node:fs";
import WebSocket from "ws";

const env = Object.fromEntries(
    readFileSync(new URL("../.env", import.meta.url), "utf8")
        .split(/\r?\n/)
        .filter((l) => l.includes("="))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);

const url = env.VITE_GOLDRUSH_STREAM_URL || "wss://streaming.goldrushdata.com/graphql";
console.log("endpoint:", url);

const client = createClient({
    url,
    webSocketImpl: WebSocket,
    connectionParams: { GOLDRUSH_API_KEY: env.VITE_GOLDRUSH_API_KEY },
    retryAttempts: 0,
    on: {
        connected: () => console.log("WS connected"),
        closed: (e) => console.log("WS closed", e?.code, e?.reason),
        error: (e) => console.log("WS error", String(e)),
    },
});

function run(label, query, variables) {
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            console.log(`[${label}] TIMEOUT (12s)`);
            unsub();
            resolve();
        }, 12_000);
        const unsub = client.subscribe(
            { query, variables },
            {
                next: (d) => {
                    clearTimeout(timer);
                    console.log(`[${label}] next:`, JSON.stringify(d).slice(0, 800));
                    unsub();
                    resolve();
                },
                error: (e) => {
                    clearTimeout(timer);
                    const msgs = Array.isArray(e)
                        ? e.map((g) => g?.message ?? JSON.stringify(g)).join(" | ")
                        : (e?.message ?? String(e));
                    console.log(`[${label}] error:`, msgs);
                    resolve();
                },
                complete: () => {
                    clearTimeout(timer);
                    console.log(`[${label}] complete`);
                    resolve();
                },
            }
        );
    });
}

await run(
    "searchToken",
    `query($q:String!){ searchToken(query:$q){ pair_address chain_name base_token{ contract_ticker_symbol } } }`,
    { q: "WETH" }
);

client.dispose();
process.exit(0);
