/**
 * useCompareStreams — subscribes to updatePairs for all compare pair addresses
 * and groups live price updates by token pair (Kumbaya vs Prism).
 */
import { COMPARE_PAIRS, ALL_COMPARE_ADDRESSES } from "../config/comparePairs";
import type { UpdatePairData } from "../types";
import { useUpdatePairsStream } from "./useUpdatePairsStream";
import { useCallback, useRef, useState } from "react";

export interface ComparePriceData {
    label: string;
    baseToken: string;
    quoteToken: string;
    kumbayaAddress: string;
    prismAddress: string;
    kumbayaPrice: number | null;
    prismPrice: number | null;
    kumbayaLiquidity: number | null;
    prismLiquidity: number | null;
    kumbayaMarketCap: number | null;
    prismMarketCap: number | null;
    spreadPct: number | null;
}

function computeSpread(a: number | null, b: number | null): number | null {
    if (a == null || b == null || a === 0 || b === 0) return null;
    const mid = (a + b) / 2;
    if (mid === 0) return null;
    return ((a - b) / mid) * 100;
}

export function useCompareStreams(apiKey: string, streamUrl: string, chainName = "MEGAETH_MAINNET") {
    const pricesRef = useRef<Map<string, UpdatePairData>>(new Map());
    const [prices, setPrices] = useState<Map<string, UpdatePairData>>(new Map());

    const handleUpdate = useCallback((updates: UpdatePairData[]) => {
        let changed = false;
        for (const u of updates) {
            const addr = u.pair_address.toLowerCase();
            if (ALL_COMPARE_ADDRESSES.some((a) => a.toLowerCase() === addr)) {
                pricesRef.current.set(addr, u);
                changed = true;
            }
        }
        if (changed) {
            setPrices(new Map(pricesRef.current));
        }
    }, []);

    const { status } = useUpdatePairsStream(apiKey, streamUrl, ALL_COMPARE_ADDRESSES, handleUpdate, chainName);

    const comparePrices: ComparePriceData[] = COMPARE_PAIRS.map((pair) => {
        const kData = prices.get(pair.kumbaya.toLowerCase());
        const pData = prices.get(pair.prism.toLowerCase());
        const kPrice = kData?.quote_rate_usd ?? null;
        const pPrice = pData?.quote_rate_usd ?? null;
        return {
            label: pair.label,
            baseToken: pair.baseToken,
            quoteToken: pair.quoteToken,
            kumbayaAddress: pair.kumbaya,
            prismAddress: pair.prism,
            kumbayaPrice: kPrice,
            prismPrice: pPrice,
            kumbayaLiquidity: kData?.liquidity ?? null,
            prismLiquidity: pData?.liquidity ?? null,
            kumbayaMarketCap: kData?.market_cap ?? null,
            prismMarketCap: pData?.market_cap ?? null,
            spreadPct: computeSpread(kPrice, pPrice),
        };
    });

    return { comparePrices, status };
}
