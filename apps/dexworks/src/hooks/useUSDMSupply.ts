/**
 * useUSDMSupply — fetches USDM totalSupply via eth_call through /api/rpc.
 *
 * Routes through the server-side /api/rpc proxy to avoid CORS issues and
 * GoldRush indexing dependency. Uses the standard ERC-20 totalSupply()
 * selector (0x18160ddd) with 18 decimal places.
 *
 * KPI safety: last known good supply is always returned on failure — the
 * displayed value never resets to zero due to a transient network error.
 */
import { useEffect, useRef, useState } from "react";

const SS_KEY_USDM = "usdm-supply-cache";
const SS_TTL_USDM = 2 * 60 * 1000; // 2 min

const POLL_MS = 60_000;

function getCachedUSDMSupply(): number {
    try {
        const raw = sessionStorage.getItem(SS_KEY_USDM);
        if (raw) {
            const { value, ts } = JSON.parse(raw) as { value: number; ts: number };
            if (typeof value === "number" && value > 0 && Date.now() - ts < SS_TTL_USDM) return value;
        }
    } catch {
        /* ignore */
    }
    return 0;
}

export type SupplyStatus = "idle" | "loading" | "ok" | "error";

export function useUSDMSupply(chainName: string) {
    // Seed from sessionStorage so the KPI shows instantly on page refresh
    const [supply, setSupply] = useState<number>(getCachedUSDMSupply);
    const [status, setStatus] = useState<SupplyStatus>(() => (getCachedUSDMSupply() > 0 ? "ok" : "idle"));

    // Never overwritten with 0 — survives transient network failures
    const lastGoodRef = useRef<number>(0);

    useEffect(() => {
        // Skip USDM polling for non-MegaETH chains
        if (chainName !== "MEGAETH_MAINNET") return;

        let active = true;

        const usdmAddress = import.meta.env.VITE_USDM_ADDRESS as string | undefined;

        async function poll() {
            if (!usdmAddress) {
                setStatus("error");
                return;
            }
            setStatus("loading");
            try {
                const res = await fetch("/api/mainnet-rpc", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        method: "eth_call",
                        params: [{ to: usdmAddress, data: "0x18160ddd" }, "latest"],
                        id: 1,
                    }),
                });

                if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);

                const json = await res.json();

                if (json.error) {
                    console.error(`[USDM] ❌ eth_call error: ${json.error.message ?? JSON.stringify(json.error)}`);
                    if (!active) return;
                    setSupply(lastGoodRef.current);
                    setStatus("error");
                    return;
                }

                const hex: string = json.result;
                const raw = BigInt(hex);
                const computed = Number(raw / 10n ** 18n);

                if (!active) return;

                lastGoodRef.current = computed;
                setSupply(computed);
                setStatus("ok");
                try {
                    sessionStorage.setItem(SS_KEY_USDM, JSON.stringify({ value: computed, ts: Date.now() }));
                } catch {
                    /* storage full */
                }
                console.log(`[USDM] ✅ totalSupply: ${computed.toLocaleString()} USDM`);
            } catch (err) {
                if (!active) return;
                const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
                console.error(`[USDM] ❌ fetch failed: ${msg}`);

                // Graceful fallback — show last known good value, never blank the KPI
                setSupply(lastGoodRef.current);
                setStatus("error");
            }
        }

        poll();
        const timer = setInterval(poll, POLL_MS);

        return () => {
            active = false;
            clearInterval(timer);
        };
    }, [chainName]);

    return { supply, status };
}
