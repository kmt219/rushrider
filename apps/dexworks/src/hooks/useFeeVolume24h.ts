import { useEffect, useRef, useState } from "react";

const POLL_MS = 5 * 60 * 1000;

const SS_KEY_FEE = "fee-volume-cache";
const SS_TTL_FEE = POLL_MS; // cache valid for one poll cycle

const DEFILLAMA_URL = "/api/defillama-fees";

function getCachedFeeVolume(): number {
    try {
        const raw = sessionStorage.getItem(SS_KEY_FEE);
        if (raw) {
            const { value, ts } = JSON.parse(raw) as { value: number; ts: number };
            if (typeof value === "number" && value > 0 && Date.now() - ts < SS_TTL_FEE) return value;
        }
    } catch {
        /* ignore */
    }
    return 0;
}

export type FeeVolumeStatus = "loading" | "ok" | "unavailable" | "error";

// apiKey and chainName kept for backwards-compatibility but unused (DeFiLlama is chain-agnostic)
export function useFeeVolume24h(_apiKey: string, _chainName: string) {
    // Seed from sessionStorage so the KPI shows instantly on page refresh
    const [feeVolume, setFeeVolume] = useState(getCachedFeeVolume);
    const [status, setStatus] = useState<FeeVolumeStatus>(() => (getCachedFeeVolume() > 0 ? "ok" : "loading"));
    const lastGoodRef = useRef(0);

    useEffect(() => {
        async function fetchFees() {
            try {
                const res = await fetch(DEFILLAMA_URL);
                if (!res.ok) throw new Error(`DeFiLlama HTTP ${res.status}`);
                const json = await res.json();
                const total: number = json.total24h ?? 0;

                if (total > 0) {
                    lastGoodRef.current = total;
                    setFeeVolume(total);
                    setStatus("ok");
                    try {
                        sessionStorage.setItem(SS_KEY_FEE, JSON.stringify({ value: total, ts: Date.now() }));
                    } catch {
                        /* storage full */
                    }
                    console.log(`[FeeVol24h] ✅ $${total.toLocaleString()} 24h fees (DeFiLlama/Kumbaya)`);
                } else {
                    setFeeVolume(lastGoodRef.current);
                    setStatus("unavailable");
                }
            } catch (err) {
                console.error("[FeeVol24h]", err);
                setFeeVolume(lastGoodRef.current);
                setStatus("error");
            }
        }

        fetchFees();
        const t = setInterval(fetchFees, POLL_MS);
        return () => clearInterval(t);
    }, []);

    return { feeVolume, status };
}
