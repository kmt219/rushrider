/**
 * useETHPrice — polls CoinGecko's free public API for a live ETH/USD price,
 * with Binance as a fallback when CoinGecko is unavailable.
 *
 * No API key required.  Refreshes every 60 seconds.  On error the last known
 * good price is preserved so callers never fall back to a stale hard-coded value.
 *
 * Used to convert native-ETH transaction values to USD in whale-activity detection.
 */
import { useEffect, useRef, useState } from "react";

const POLL_MS = 60_000;
const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd";
const BINANCE_URL = "https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT";

export function useETHPrice(): number {
    // Start at 0 so callers can distinguish "not yet fetched" from a real price.
    const [price, setPrice] = useState<number>(0);
    const lastGoodRef = useRef<number>(0);

    useEffect(() => {
        let active = true;

        async function fetchFromCoinGecko(): Promise<number | null> {
            const res = await fetch(COINGECKO_URL);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = (await res.json()) as { ethereum?: { usd?: number } };
            const p = json?.ethereum?.usd;
            return typeof p === "number" && p > 0 ? p : null;
        }

        async function fetchFromBinance(): Promise<number | null> {
            const res = await fetch(BINANCE_URL);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = (await res.json()) as { price?: string };
            const p = json?.price ? parseFloat(json.price) : NaN;
            return isFinite(p) && p > 0 ? p : null;
        }

        async function poll() {
            let p: number | null = null;
            let source = "coingecko";

            try {
                p = await fetchFromCoinGecko();
            } catch (err) {
                console.warn("[ETHPrice] CoinGecko failed, trying Binance:", err);
                source = "binance";
                try {
                    p = await fetchFromBinance();
                } catch (binanceErr) {
                    console.warn("[ETHPrice] Binance also failed:", binanceErr);
                }
            }

            if (!active) return;

            if (typeof p === "number" && p > 0) {
                lastGoodRef.current = p;
                setPrice(p);
                console.log(`[ETHPrice] ✅ $${p.toFixed(2)} (source: ${source})`);
            } else {
                console.warn("[ETHPrice] All sources failed, keeping last value");
                if (lastGoodRef.current > 0) setPrice(lastGoodRef.current);
            }
        }

        poll();
        const timer = setInterval(poll, POLL_MS);
        return () => {
            active = false;
            clearInterval(timer);
        };
    }, []);

    return price;
}
