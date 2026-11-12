import { getChainCaps } from "../lib/chainCaps";
import { goldrushFetch } from "../lib/goldrushClient";
import { useEffect, useState } from "react";

export interface SpotPriceData {
    quoteRate: number | null;
    high24h: number | null;
    low24h: number | null;
    pctChange24h: number | null;
    volume24hUsd: number | null;
    lastTradedAt: string | null;
}

interface SpotPriceItem {
    quote_rate: number;
    quote_rate_usd: number;
    high_24h: number;
    low_24h: number;
    percent_change_24h: number;
    volume_24h_usd: number;
    last_traded_at: string;
}

interface SpotPriceResponse {
    items: SpotPriceItem[];
}

const cache = new Map<string, { data: SpotPriceData; fetchedAt: number }>();
const unsupportedPairs = new Set<string>();
const CACHE_TTL_MS = 60_000;

export function useSpotPrice(chainName: string, pairAddress: string | null | undefined) {
    const [data, setData] = useState<SpotPriceData | null>(null);

    useEffect(() => {
        if (!pairAddress) {
            setData(null);
            return;
        }

        const key = `${chainName}:${pairAddress.toLowerCase()}`;
        if (unsupportedPairs.has(key)) return;

        const cached = cache.get(key);
        if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
            setData(cached.data);
            return;
        }

        const restChain = chainName.replace(/_/g, "-").toLowerCase();
        if (!getChainCaps(restChain).restApi) return;
        const addr = pairAddress.toLowerCase();

        goldrushFetch<SpotPriceResponse>(`${restChain}/pricing/spot_prices/${restChain}/pools/${addr}/`)
            .then((resp) => {
                const item = resp.items?.[0];
                const result: SpotPriceData = item
                    ? {
                          quoteRate: item.quote_rate_usd ?? item.quote_rate ?? null,
                          high24h: item.high_24h ?? null,
                          low24h: item.low_24h ?? null,
                          pctChange24h: item.percent_change_24h ?? null,
                          volume24hUsd: item.volume_24h_usd ?? null,
                          lastTradedAt: item.last_traded_at ?? null,
                      }
                    : {
                          quoteRate: null,
                          high24h: null,
                          low24h: null,
                          pctChange24h: null,
                          volume24hUsd: null,
                          lastTradedAt: null,
                      };
                cache.set(key, { data: result, fetchedAt: Date.now() });
                setData(result);
            })
            .catch((err: { status?: number }) => {
                if (err?.status === 404 || err?.status === 501) unsupportedPairs.add(key);
            });
    }, [chainName, pairAddress]);

    return data;
}
