import { IS_GOLDRUSH_ACTIVE, useGoldRushClient } from "../context/GoldRushContext";
import { useNodeStreamContext } from "../context/NodeStreamContext";
import { nodeStore } from "../stream/stateStore";
import type { HIP3Market } from "../types";
import { useGoldRushFunding } from "./useGoldRushFunding";
import { useGoldRushPairPrices, buildHip3PairAddress } from "./useGoldRushPairPrices";
import { useGoldRushPrices } from "./useGoldRushPrices";
import { useGoldRushStream } from "./useGoldRushStream";
import { useGoldRushTraders } from "./useGoldRushTraders";
import { useHyperliquidMeta } from "./useHyperliquidMeta";
import { useMarketStats } from "./useMarketStats";
import { IS_NODE_STREAM_ACTIVE } from "./useNodeStream";
import { useMemo } from "react";

// ── Overlay nodeStore data onto HL-meta base markets ──────────
function useNodeMarkets(baseMarkets: HIP3Market[], blockTick: number): HIP3Market[] {
    void blockTick;
    return baseMarkets.map((base) => nodeStore.buildMarketSnapshot(base.coin, base));
}

// ── Overlay GoldRush OHLCV prices onto HL-meta base markets ───
function useGoldRushMarkets(baseMarkets: HIP3Market[]): { markets: HIP3Market[]; loading: boolean; blockTick: number } {
    const stream = useGoldRushStream();
    const coins = useMemo(() => baseMarkets.map((m) => m.coin), [baseMarkets]);
    const grPrices = useGoldRushPrices(coins);

    // Populate fundingMap and tradersMap continuously via streaming subscriptions.
    // stores is a stable ref object — mutations do not trigger re-renders directly.
    const { stores } = useGoldRushClient();
    useGoldRushFunding(); // populates stores.fundingMap continuously
    useGoldRushTraders(); // populates stores.tradersMap continuously

    // Compute HIP-3 pair addresses for per-pair OHLCV price subscriptions
    const hip3Pairs = useMemo(
        () =>
            baseMarkets
                .filter((m) => m.marketClass === "hip-3")
                .map((m) => ({
                    coin: m.coin,
                    pairAddress: buildHip3PairAddress(m.coin, m.quoteToken ?? "USDC"),
                })),
        [baseMarkets]
    );

    const grPairPrices = useGoldRushPairPrices(hip3Pairs);

    // NOTE: stores.fundingMap and stores.tradersMap are stable mutable refs — using them
    // as useMemo deps does not trigger re-runs when the maps are mutated. This is acceptable
    // because the memo re-runs on grPrices/grPairPrices updates (every candle tick), which
    // provides sufficient refresh cadence for funding rate and unique trader data.
    const markets = useMemo(
        () =>
            baseMarkets.map((m) => {
                const gp = grPrices.get(m.coin);
                const pairAddress = buildHip3PairAddress(m.coin, m.quoteToken ?? "USDC");
                const pp = m.marketClass === "hip-3" ? grPairPrices.get(pairAddress) : undefined;
                const priceSource = pp ?? gp;

                // Live funding from walletTxs (overrides REST meta if within last 9h)
                const liveFunding = stores.fundingMap.get(m.coin);
                const fundingRate =
                    liveFunding && Date.now() - liveFunding.time < 9 * 60 * 60 * 1000
                        ? liveFunding.rate
                        : m.fundingRate;

                // Unique traders from rolling 24h window (grows over session)
                const uniqueTraders24h = IS_GOLDRUSH_ACTIVE
                    ? (stores.tradersMap.get(m.coin)?.size ?? m.uniqueTraders24h)
                    : m.uniqueTraders24h;

                // Liquidation count + builder revenue from nodeStore (populated by useGoldRushTraders)
                const coinState = nodeStore.get(m.coin);
                const liqCount24h = coinState?.liqCount24h.count() ?? m.liqCount24h;
                const builderRevenue24h = coinState?.builderRevenue24h.sum() ?? m.builderRevenue24h;
                const volume24hForRate = m.volume24h || 1; // avoid divide-by-zero
                const avgBuilderFeeRate =
                    builderRevenue24h > 0 ? builderRevenue24h / volume24hForRate : m.avgBuilderFeeRate;

                // For HIP-3: prefer pair-price change1h, fall back to coin-price change1h
                // (coin-price may have the REST-fallback value when pair subscription has < 2 candles)
                // Preserve hlMeta-computed change1h when GoldRush has no subscription for the coin
                // (e.g. HIP-4 prediction markets — priceSource is undefined, ?? 0 would erase it)
                const change1h =
                    m.marketClass === "hip-3"
                        ? pp?.change1h || gp?.change1h || 0
                        : (priceSource?.change1h ?? m.change1h);

                return {
                    ...m,
                    // Use || (not ??) so that markPx=0 from GoldRush REST-fallback entries
                    // doesn't override the correct price from HL meta.
                    markPx: priceSource?.markPx || m.markPx,
                    indexPx: priceSource?.markPx || m.indexPx,
                    change24h: m.change24h !== 0 ? m.change24h : (priceSource?.change24h ?? 0),
                    change1h,
                    volume24h: m.volume24h > 0 ? m.volume24h : (priceSource?.volume24h ?? 0),
                    fundingRate,
                    uniqueTraders24h,
                    liqCount24h,
                    builderRevenue24h,
                    avgBuilderFeeRate,
                };
            }),
        [baseMarkets, grPrices, grPairPrices, stores.fundingMap, stores.tradersMap]
    );

    return { markets, loading: stream.status === "connecting", blockTick: stream.blockTick };
}

// ── Public hook ────────────────────────────────────────────────
export function useMarkets() {
    const stream = useNodeStreamContext();
    const hlMeta = useHyperliquidMeta(); // always running — provides the live market list
    const nodeMarkets = useNodeMarkets(hlMeta.markets, stream.blockTick);
    const goldRush = useGoldRushMarkets(hlMeta.markets);
    // REST-only enrichment: order flow (recentTrades) + spread/book (l2Book)
    const statsOverlay = useMarketStats(hlMeta.markets);

    // Helper: split a flat markets array into the 5 typed sub-arrays.
    // Used to enrich sub-arrays with the same price overlay applied to the flat array,
    // so that sorting by volume24h is consistent across ALL tab and per-tab views.
    function splitByClass(flat: HIP3Market[]) {
        return {
            perpMarkets: flat.filter((m) => m.marketClass === "perp"),
            spotMarkets: flat.filter((m) => m.marketClass === "spot"),
            tradfiMarkets: flat.filter((m) => m.marketClass === "tradfi"),
            // Include builder-dex tradfi markets (marketClass="tradfi", builder≠"Hyperliquid")
            // because they were dual-pushed into hip3Markets in useHyperliquidMeta.
            hip3Markets: flat.filter(
                (m) => m.marketClass === "hip-3" || (m.marketClass === "tradfi" && m.builder !== "Hyperliquid")
            ),
            hip4Markets: flat.filter((m) => m.marketClass === "hip-4"),
            preLaunchMarkets: flat.filter((m) => m.marketClass === "pre-launch"),
        };
    }

    if (IS_NODE_STREAM_ACTIVE) {
        return {
            markets: nodeMarkets,
            // Node stream does not enrich per-coin so use hlMeta sub-arrays directly
            perpMarkets: hlMeta.perpMarkets,
            spotMarkets: hlMeta.spotMarkets,
            tradfiMarkets: hlMeta.tradfiMarkets,
            hip3Markets: hlMeta.hip3Markets,
            hip4Markets: hlMeta.hip4Markets,
            preLaunchMarkets: hlMeta.preLaunchMarkets,
            loading: hlMeta.loading || stream.status === "connecting",
            error: stream.status === "error" ? "Node stream error" : null,
            blockNumber: stream.blockNumber,
        };
    }

    if (IS_GOLDRUSH_ACTIVE) {
        const grMarkets =
            statsOverlay.size > 0
                ? goldRush.markets.map((m) => {
                      const overlay = statsOverlay.get(m.coin);
                      return overlay ? { ...m, ...overlay } : m;
                  })
                : goldRush.markets;
        // Derive enriched sub-arrays from the same grMarkets so that volume24h and
        // price values are consistent between ALL tab and per-tab sorted views.
        return {
            markets: grMarkets,
            ...splitByClass(grMarkets),
            loading: hlMeta.loading || goldRush.loading,
            error: hlMeta.error,
            blockNumber: goldRush.blockTick,
        };
    }

    // Default: HL REST API data enriched with live order flow + spread
    const markets =
        statsOverlay.size > 0
            ? hlMeta.markets.map((m) => {
                  const overlay = statsOverlay.get(m.coin);
                  return overlay ? { ...m, ...overlay } : m;
              })
            : hlMeta.markets;

    return {
        markets,
        // Use hlMeta sub-arrays when there is no overlay (same source as markets);
        // use splitByClass when statsOverlay enriched markets to keep them in sync.
        ...(statsOverlay.size > 0
            ? splitByClass(markets)
            : {
                  perpMarkets: hlMeta.perpMarkets,
                  spotMarkets: hlMeta.spotMarkets,
                  tradfiMarkets: hlMeta.tradfiMarkets,
                  hip3Markets: hlMeta.hip3Markets,
                  hip4Markets: hlMeta.hip4Markets,
                  preLaunchMarkets: hlMeta.preLaunchMarkets,
              }),
        loading: hlMeta.loading,
        error: hlMeta.error,
        blockNumber: 0,
    };
}
