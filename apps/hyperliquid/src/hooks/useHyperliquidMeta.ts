import { CRYPTO_CATEGORY_MAP, TRADFI_CATEGORY_MAP } from "../constants";
import { infoPost } from "../lib/infoClient";
import type { HIP3Market, MarketClass } from "../types";
import { baseCoin } from "../utils/format";
import { useEffect, useRef, useState } from "react";

// Main-dex coins that are TradFi instruments (not crypto).
// HL uses "k"-prefixed names for synthetic stock/index perpetuals (e.g. kNVDA, kTSLA).
// Both plain and k-prefixed variants are included to cover name changes over time.
// Coins confirmed as real-world TradFi instruments on the live HL exchange.
// NOTE: SPX on HL is the $SPX meme token (oracle ~$0.26), NOT the S&P 500 index.
// kPEPE/kSHIB/kBONK/kFLOKI/kLUNC/kNEIRO are 1000x meme-coin contracts, not stocks.
// Synthetic stocks (kNVDA, kTSLA, etc.) and FX pairs are kept here for forward-compat
// in case HL re-lists them; they will be no-ops while delisted (isDelisted filter skips them).
const TRADFI_COINS = new Set([
    // Gold & precious metals
    "PAXG",
    "GOLD",
    "SILVER",
    "XAUT",
    "PLATINUM",
    "PALLADIUM",
    // Energy / commodities
    "CL",
    "WTI",
    "BRENTOIL",
    "BRENT",
    "NATGAS",
    "COPPER",
    "ALUMINIUM",
    "URANIUM",
    "CORN",
    "WHEAT",
    "TTF",
    "XLE",
    // Stocks — US (xyz dex active)
    "NVDA",
    "kNVDA",
    "TSLA",
    "kTSLA",
    "AMZN",
    "kAMZN",
    "AAPL",
    "kAAPL",
    "MSFT",
    "kMSFT",
    "GOOGL",
    "kGOOGL",
    "META",
    "kMETA",
    "NFLX",
    "kNFLX",
    "COIN",
    "kCOIN",
    "MSTR",
    "kMSTR",
    "MU",
    "kMU",
    "ORCL",
    "AMD",
    "INTC",
    "PLTR",
    "SNDK",
    "COST",
    "LLY",
    "BX",
    "RIVN",
    "DKNG",
    "HIMS",
    "GME",
    "CRCL",
    "CRWV",
    "HOOD",
    // Stocks — non-US (xyz dex)
    "TSM",
    "SKHX",
    "BABA",
    "SMSN",
    "HYUNDAI",
    "SOFTBANK",
    "KIOXIA",
    // ETFs
    "EWY",
    "EWJ",
    "URNM",
    "XLE",
    "SPY",
    "kSPY",
    "QQQ",
    "kQQQ",
    // Indices — xyz, flx, km names
    "SP500",
    "USA500",
    "XYZ100",
    "kSPX",
    "NQ",
    "kNQ",
    "NDX",
    "kNDX",
    "KR200",
    "JP225",
    "USAR",
    "VIX",
    "DXY",
    "USA100", // flx
    "US500", // km — S&P 500 equivalent
    "USBOND", // km — US Treasury bond
    "SMALL2000", // km — Russell 2000
    "USTECH", // km — Nasdaq equivalent
    "SEMI", // km — semiconductor sector ETF
    "GLDMINE", // km — gold miners ETF
    "USENERGY", // km — energy sector
    // Energy / oil (flx, km names)
    "OIL", // flx generic oil contract
    "USOIL", // km WTI oil equivalent
    // Non-US stocks — km
    "TENCENT",
    "XIAOMI",
    "BMNR",
    "RTX",
    // FX
    "EURUSD",
    "GBPUSD",
    "USDJPY",
    "EUR",
    "JPY",
    // Pre-IPO / reserved
    "SPXIPO",
    "LITE",
    // vntl synthetic thematic products — TradFi-like indices
    "SPACEX",
    "OPENAI",
    "ANTHROPIC",
    "MAG7", // Magnificent 7 tech stocks index
    "SEMIS", // Semiconductor index
    "ROBOT", // Robotics index
    "INFOTECH", // Information technology index
    "NUCLEAR", // Nuclear energy index
    "DEFENSE", // Defense sector index
    "ENERGY", // Energy sector index
    "BIOTECH", // Biotech sector index
]);

// ── Raw API types ─────────────────────────────────────────────

// HIP-4 outcome/prediction markets.
// outcomeMeta → { outcomes: HlOutcome[], questions: [] }
// Coin names are #{outcomeId}{sideIndex} — e.g. outcome 2, side 0 → "#20".
interface HlOutcome {
    outcome: number; // numeric ID, e.g. 2
    name: string; // e.g. "Recurring"
    description: string; // "class:priceBinary|underlying:BTC|expiry:...|targetPrice:79980|period:1d"
    sideSpecs: { name: string }[]; // [{name:"Yes"},{name:"No"}]
}

// { type: "allMids" } → flat object mapping coin → mid price string
// Used to get current prices for #NN coins that don't appear in metaAndAssetCtxs.

// { type: "candleSnapshot", req: { coin, interval, startTime, endTime } } → HlCandle[]
interface HlCandle {
    t: number; // open time ms
    o: string; // open price
    c: string; // close price
    v: string; // volume in contracts
}

interface HlDexInfo {
    name: string;
    fullName?: string;
    /** Quote currency used by this builder-dex (e.g. "USDH" for flx, "USDC" for xyz). */
    quoteToken?: string;
    // HIP-3 dexes expose per-asset OI caps as [coinKey, capUSD] pairs
    assetToStreamingOiCap?: [string, string][];
}

interface HlAsset {
    name: string;
    szDecimals: number;
    maxLeverage: number;
    onlyIsolated?: boolean;
    isDelisted?: boolean;
    marginMode?: string;
}

interface HlAssetCtx {
    funding: string;
    openInterest: string;
    prevDayPx: string;
    dayNtlVlm: string;
    premium: string;
    markPx: string;
    midPx: string | null;
    oraclePx: string;
    impactPxs: [string, string] | null; // [bidImpactPx, askImpactPx] for $5M notional
    dayBaseVlm: string;
}

interface HlToken {
    name: string;
    szDecimals: number;
    weiDecimals: number;
    index: number;
    tokenId: string;
    isCanonical: boolean;
    fullName: string | null;
    evmContract?: string | null;
}

interface HlSpotPair {
    name: string; // e.g. "PURR/USDC" or "@173/USDC" for non-canonical
    tokens: [number, number]; // [baseTokenIndex, quoteTokenIndex] into HlToken[]
    index: number;
    isCanonical: boolean;
}

interface HlSpotCtx {
    dayNtlVlm: string;
    markPx: string;
    midPx: string | null;
    prevDayPx: string;
    circulatingSupply: string;
}

// ── Helpers ───────────────────────────────────────────────────

async function hlPost<T>(body: { type: string; [key: string]: unknown }): Promise<T> {
    // Routes GoldRush-supported types (metaAndAssetCtxs, spotMetaAndAssetCtxs,
    // outcomeMeta) to the no-rate-limit GoldRush host; everything else stays on
    // public Hyperliquid. See lib/infoClient.ts.
    return infoPost<T>(body);
}

function zeroBase(
    override: Pick<
        HIP3Market,
        "coin" | "name" | "builder" | "category" | "quoteToken" | "marketClass" | "leverage" | "settlement"
    > &
        Partial<HIP3Market>
): HIP3Market {
    return {
        type: "perp",
        makerFee: -0.0002,
        takerFee: 0.0005,
        markPx: 0,
        indexPx: 0,
        change24h: 0,
        change24hAbs: 0,
        volume24h: 0,
        makerVolume24h: 0,
        takerVolume24h: 0,
        openInterest: 0,
        oiCap: 0,
        oiUtilization: 0,
        isAtCap: false,
        fundingRate: 0,
        fundingHistory: [],
        makerTakerRatio: 0,
        liqCount24h: 0,
        liquidationVolume24h: 0,
        backstopLiqRate: 0,
        lastLiquidation: null,
        tradeCount24h: 0,
        lastTradeTime: new Date().toISOString(),
        uniqueTraders24h: 0,
        builderRevenue24h: 0,
        avgBuilderFeeRate: 0,
        orderFlowImbalance: 0,
        cancelToFillRatio: 0,
        bookImbalance: 0.5,
        bidDepth: 0,
        askDepth: 0,
        spreadBps: 0,
        topBidPx: 0,
        topAskPx: 0,
        topBidSz: 0,
        topAskSz: 0,
        netCapitalFlow24h: 0,
        premiumBps: 0,
        predictedFundingRate: 0,
        oiDeltaRefresh: 0,
        longShortRatio: 0.5,
        change1h: 0,
        ...override,
    };
}

function perpFromApi(
    asset: HlAsset,
    ctx: HlAssetCtx,
    marketClass: MarketClass,
    builder: string,
    category: string,
    isPreLaunch = false,
    quoteToken = "USDC"
): HIP3Market {
    const markPx = parseFloat(ctx.markPx) || 0;
    const prevDayPx = parseFloat(ctx.prevDayPx) || 0;

    const oraclePx = parseFloat(ctx.oraclePx) || markPx;

    // Spread in bps from impactPxs ($5M notional bid/ask fill prices)
    let spreadBps = 0;
    if (ctx.impactPxs && ctx.impactPxs[0] && ctx.impactPxs[1]) {
        const bid = parseFloat(ctx.impactPxs[0]);
        const ask = parseFloat(ctx.impactPxs[1]);
        const mid = (bid + ask) / 2;
        if (mid > 0) spreadBps = ((ask - bid) / mid) * 10000;
    }

    // ORDER FLOW from impactPxs depth asymmetry:
    // bidImpactPx < oracle (slippage selling) — smaller = deeper bids = buying pressure
    // askImpactPx > oracle (slippage buying) — smaller = deeper asks = selling pressure
    // Result: +1 = strong bid depth (buying pressure), -1 = strong ask depth (selling pressure)
    let orderFlowImbalance = 0;
    if (ctx.impactPxs && ctx.impactPxs[0] && ctx.impactPxs[1] && oraclePx > 0) {
        const bidImpact = parseFloat(ctx.impactPxs[0]);
        const askImpact = parseFloat(ctx.impactPxs[1]);
        const bidSlip = (oraclePx - bidImpact) / oraclePx;
        const askSlip = (askImpact - oraclePx) / oraclePx;
        const total = bidSlip + askSlip;
        if (total > 0) orderFlowImbalance = (askSlip - bidSlip) / total;
    }

    // BASIS: (markPx - oraclePx) / oraclePx in bps — positive = longs paying premium
    const premiumBps = oraclePx > 0 ? ((markPx - oraclePx) / oraclePx) * 10000 : 0;

    // Predicted 8h funding = basis component only (same as HL's displayed prediction)
    const predictedFundingRate = oraclePx > 0 ? Math.max(-0.05, Math.min(0.05, (markPx - oraclePx) / oraclePx)) : 0;

    // Long/short ratio: estimated from order book depth asymmetry (orderFlowImbalance).
    // Positive imbalance = deeper bids relative to asks = buying pressure = longs dominating.
    // Falls back to premium direction when imbalance is unavailable (impactPxs absent).
    const ofiSignal = orderFlowImbalance !== 0 ? orderFlowImbalance : premiumBps / 5000;
    const longShortRatio = 0.5 + Math.max(-0.4, Math.min(0.4, ofiSignal * 0.4));

    return zeroBase({
        coin: asset.name,
        name: asset.name,
        builder,
        category: isPreLaunch ? "Pre-launch" : category,
        quoteToken,
        marketClass: isPreLaunch ? "pre-launch" : marketClass,
        leverage: `${asset.maxLeverage}x`,
        settlement: "xyz",
        type: "perp",
        markPx,
        indexPx: oraclePx,
        change24h: prevDayPx > 0 ? (markPx - prevDayPx) / prevDayPx : 0,
        change24hAbs: markPx - prevDayPx,
        volume24h: parseFloat(ctx.dayNtlVlm) || 0,
        openInterest: (parseFloat(ctx.openInterest) || 0) * markPx,
        fundingRate: parseFloat(ctx.funding) || 0,
        spreadBps,
        orderFlowImbalance,
        premiumBps,
        predictedFundingRate,
        longShortRatio,
        oiDeltaRefresh: 0, // populated by post-loop below
    });
}

/** Resolve the base coin ticker for a spot pair.
 *  Canonical pairs have readable names like "PURR/USDC".
 *  Non-canonical pairs use numeric IDs like "@173/USDC" — resolve via tokens array. */
function resolveSpotCoin(pair: HlSpotPair, tokens: HlToken[]): string {
    const rawBase = pair.name.split("/")[0] ?? pair.name;
    if (!rawBase.startsWith("@")) return rawBase;
    const baseToken = tokens[pair.tokens[0]];
    return baseToken?.name ?? rawBase;
}

// HL uses "USDT0" for bridged Tether, displayed as "USDT" in the official UI.
// Maps token names that should display as a canonical pill label.
const TOKEN_NAME_TO_PILL: Record<string, string> = {
    USDC: "USDC",
    USDH: "USDH",
    USDT: "USDT",
    USDT0: "USDT", // bridged USDT on HL
};
const PILL_LABELS = new Set(["USDC", "USDH", "USDT"]);

// Build a map of token index → pill label for all USD quote tokens in the spot universe.
// HL spot pairs are almost all "@N" format (non-canonical) — pair.name cannot be split.
// Use the tokens array directly: all USD stablecoins have readable names like "USDC",
// "USDH", "USDT0" etc. — map them to their pill label via TOKEN_NAME_TO_PILL.
function buildTokenSymbolMap(tokens: HlToken[]): Map<number, string> {
    const map = new Map<number, string>();
    for (const t of tokens) {
        const pill = TOKEN_NAME_TO_PILL[t.name];
        if (pill) map.set(t.index, pill);
    }
    return map;
}

function spotFromApi(
    pair: HlSpotPair,
    ctx: HlSpotCtx,
    tokens: HlToken[],
    tokenSymbolMap: Map<number, string>
): HIP3Market {
    const coin = resolveSpotCoin(pair, tokens);
    // Resolve quote token: use pre-built index map (most reliable), fall back to USDC
    const quoteSymbol = tokenSymbolMap.get(pair.tokens[1]) ?? "USDC";
    const quoteAsset = PILL_LABELS.has(quoteSymbol) ? quoteSymbol : "USDC";
    // For non-USDC quoted pairs (HYPE/USDT, XAUT/USDT, etc.) append the quote to the
    // coin identifier so they are unique in the markets array and dedup map.
    // USDC is the default so we omit it to keep coin names clean (e.g. "HYPE" not "HYPE/USDC").
    const uniqueCoin = quoteAsset !== "USDC" ? `${coin}/${quoteAsset}` : coin;
    // Semantic category for the display badge — quote currency stored separately in quoteAsset
    const category = CRYPTO_CATEGORY_MAP[coin] ?? "Spot";
    const markPx = parseFloat(ctx.markPx) || 0;
    const prevDayPx = parseFloat(ctx.prevDayPx) || 0;
    return zeroBase({
        coin: uniqueCoin,
        name: coin, // display name is always the base token symbol
        builder: "Hyperliquid",
        category,
        quoteToken: quoteAsset,
        marketClass: "spot",
        leverage: "1x",
        settlement: "xyz",
        type: "spot",
        makerFee: -0.0001,
        takerFee: 0.00025,
        markPx,
        indexPx: markPx,
        change24h: prevDayPx > 0 ? (markPx - prevDayPx) / prevDayPx : 0,
        // When prevDayPx is 0 (API has no 24h history for this token), treat absolute
        // change as 0 too — otherwise we'd display the full current price as a "change".
        change24hAbs: prevDayPx > 0 ? markPx - prevDayPx : 0,
        volume24h: parseFloat(ctx.dayNtlVlm) || 0,
    });
}

// ── Hook ──────────────────────────────────────────────────────

export interface HyperliquidMetaResult {
    /** Flat list of ALL markets — used by useMarkets() for price overlays */
    markets: HIP3Market[];
    /** Pre-classified sub-arrays for direct tab routing in App.tsx */
    perpMarkets: HIP3Market[]; // marketClass === "perp"
    spotMarkets: HIP3Market[]; // marketClass === "spot"
    tradfiMarkets: HIP3Market[]; // marketClass === "tradfi"
    hip3Markets: HIP3Market[]; // marketClass === "hip-3"
    hip4Markets: HIP3Market[]; // marketClass === "hip-4" (outcome/prediction markets)
    preLaunchMarkets: HIP3Market[]; // marketClass === "pre-launch"
    loading: boolean;
    error: string | null;
}

// 60s in all modes: OI delta (oiDeltaRefresh) computes current − previous OI, so the
// first meaningful delta appears after one full refresh cycle. 300s was too long for GoldRush
// mode — users would see "—" in the OI Δ column for 5 minutes.
const REFRESH_MS = 60_000;
const LS_OI_KEY = "hl_prev_oi_v1";
const EMPTY: HyperliquidMetaResult = {
    markets: [],
    perpMarkets: [],
    spotMarkets: [],
    tradfiMarkets: [],
    hip3Markets: [],
    hip4Markets: [],
    preLaunchMarkets: [],
    loading: true,
    error: null,
};

// 5-minute cache for HIP-4 candle data — candleSnapshot calls are expensive and
// hourly candles don't change meaningfully within a 60s refresh cycle.
const HIP4_CANDLE_TTL = 5 * 60 * 1000;

export function useHyperliquidMeta(): HyperliquidMetaResult {
    const [state, setState] = useState<HyperliquidMetaResult>(EMPTY);
    const prevOIRef = useRef<Map<string, number>>(new Map());
    const hip4CacheRef = useRef<{ ts: number; markets: HIP3Market[] }>({ ts: 0, markets: [] });

    useEffect(() => {
        // Restore previous OI from localStorage so the first-load delta is meaningful
        // immediately (no need to wait a full 60s cycle for the second refresh).
        try {
            const stored = localStorage.getItem(LS_OI_KEY);
            if (stored) {
                prevOIRef.current = new Map(Object.entries(JSON.parse(stored) as Record<string, number>));
            }
        } catch {
            /* ignore — quota exceeded or corrupt JSON */
        }

        let cancelled = false;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;

        async function fetchAll() {
            try {
                const [perpRes, spotRes, dexRes, atCapRes, outcomeMetaRes] = await Promise.all([
                    hlPost<[{ universe: HlAsset[] }, HlAssetCtx[]]>({ type: "metaAndAssetCtxs" }),
                    hlPost<[{ tokens: HlToken[]; universe: HlSpotPair[] }, HlSpotCtx[]]>({
                        type: "spotMetaAndAssetCtxs",
                    }),
                    hlPost<(null | HlDexInfo)[]>({ type: "perpDexs" }),
                    hlPost<string[]>({ type: "perpsAtOpenInterestCap" }),
                    hlPost<{ outcomes: HlOutcome[]; questions: unknown[] }>({ type: "outcomeMeta" }).catch(() => ({
                        outcomes: [],
                        questions: [],
                    })),
                ]);

                // Only the Yes side (sideIndex 0) is shown per outcome — the No side is
                // the complement (price = 1 - yesPx) and HL doesn't list it separately.
                const outcomeSideCoins: { coin: string; outcome: HlOutcome }[] = outcomeMetaRes.outcomes.map(
                    (outcome) => ({
                        coin: `#${outcome.outcome}0`,
                        outcome,
                    })
                );

                // Kick off allMids for current prices (cheap single call vs N candleSnapshots)
                const allMidsPromise = hlPost<Record<string, string>>({ type: "allMids" }).catch(
                    () => ({}) as Record<string, string>
                );

                // Kick off OHLCV fetches only when the cache is stale (>5 min).
                // candleSnapshot is rate-limit-sensitive; hourly candles don't change
                // meaningfully on a 60s refresh cycle so caching is safe.
                const nowMs = Date.now();
                const hip4CacheStale = nowMs - hip4CacheRef.current.ts > HIP4_CANDLE_TTL;
                const hip4Promise = hip4CacheStale
                    ? Promise.allSettled(
                          outcomeSideCoins.map(({ coin }) =>
                              hlPost<HlCandle[]>({
                                  type: "candleSnapshot",
                                  req: {
                                      coin,
                                      interval: "1h",
                                      startTime: nowMs - 25 * 60 * 60 * 1000,
                                      endTime: nowMs,
                                  },
                              }).then((candles) => ({ coin, candles }))
                          )
                      )
                    : null;

                const liveDexes = dexRes.filter((d): d is HlDexInfo => d !== null);

                // Kick off HIP-3 fetches immediately (in parallel with perp/spot processing below).
                const hip3Promise = Promise.allSettled(
                    liveDexes.map((dexInfo) =>
                        hlPost<[{ universe: HlAsset[] }, HlAssetCtx[]]>({
                            type: "metaAndAssetCtxs",
                            dex: dexInfo.name,
                        }).then(([meta, ctxs]) => ({ dex: dexInfo.name, dexInfo, meta, ctxs }))
                    )
                );

                // Map of coinKey → OI cap USD for HIP-3 markets
                const oiCapMap = new Map<string, number>();
                for (const dex of liveDexes) {
                    if (!dex.assetToStreamingOiCap) continue;
                    for (const [coinKey, capStr] of dex.assetToStreamingOiCap) {
                        oiCapMap.set(coinKey, parseFloat(capStr));
                    }
                }

                // Set of main-dex coins currently at their OI cap
                const atCapSet = new Set(atCapRes);

                if (cancelled) return;

                // Build the flat markets array AND the 5 typed sub-arrays simultaneously.
                // Sub-arrays are populated AT PUSH TIME so their content is guaranteed to
                // match exactly what was pushed — no end-of-loop filter pass that could
                // silently miss markets with an unexpected marketClass value.
                const markets: HIP3Market[] = [];
                const perpMarkets: HIP3Market[] = [];
                const spotMarkets: HIP3Market[] = [];
                const tradfiMarkets: HIP3Market[] = [];
                const hip3Markets: HIP3Market[] = [];
                const hip4Markets: HIP3Market[] = [];
                const preLaunchMarkets: HIP3Market[] = [];

                // ── Step 1: Main dex perps ─────────────────────────────────────────────
                const [perpMeta, perpCtxs] = perpRes;
                for (let i = 0; i < perpMeta.universe.length; i++) {
                    const asset = perpMeta.universe[i]!;
                    const ctx = perpCtxs[i]!;
                    if (asset.isDelisted) continue;
                    // HL's metaAndAssetCtxs returns builder-dex scoped coins prefixed with
                    // their dex name (e.g. "xyz:AMZN", "km:BTC"). These are NOT main-dex
                    // markets — they are handled exclusively in step 4. Skipping them here
                    // prevents misclassification as "perp" (TRADFI_COINS only stores plain
                    // names like "AMZN", not "xyz:AMZN") and eliminates cross-tab pollution.
                    if (asset.name.includes(":")) continue;
                    const isTradfi = TRADFI_COINS.has(asset.name);
                    const tradfiCat = TRADFI_CATEGORY_MAP[asset.name] ?? "Commodities";
                    const cryptoCat = CRYPTO_CATEGORY_MAP[asset.name] ?? "Crypto";
                    // Pre-launch: markets listed before the token has officially launched.
                    // HL historically used onlyIsolated: true; newer pre-launch perps
                    // additionally or exclusively use marginMode: "strictIsolated".
                    const isPreLaunch = asset.onlyIsolated === true || asset.marginMode === "strictIsolated";
                    const m = perpFromApi(
                        asset,
                        ctx,
                        isTradfi ? "tradfi" : "perp",
                        "Hyperliquid",
                        isTradfi ? tradfiCat : cryptoCat,
                        isPreLaunch
                    );
                    if (atCapSet.has(asset.name)) {
                        m.isAtCap = true;
                        m.oiCap = m.openInterest;
                        m.oiUtilization = 1.0;
                    }
                    markets.push(m);
                    // Route to sub-array based on final marketClass (set by perpFromApi)
                    if (m.marketClass === "pre-launch") preLaunchMarkets.push(m);
                    else if (m.marketClass === "tradfi") tradfiMarkets.push(m);
                    else if (m.marketClass === "perp") perpMarkets.push(m);
                    // any other class is a no-op (should not happen for main-dex perps)
                }

                // ── Step 2: Spot markets ───────────────────────────────────────────────
                const [spotMeta, spotCtxs] = spotRes;
                const spotTokens = spotMeta.tokens;
                // Build token-index → pill label map from the tokens array.
                // HL uses "USDT0" for bridged Tether; TOKEN_NAME_TO_PILL maps it to "USDT".
                const tokenSymbolMap = buildTokenSymbolMap(spotTokens);
                const spotByName = new Map<string, HIP3Market>();
                for (let i = 0; i < spotMeta.universe.length; i++) {
                    const pair = spotMeta.universe[i]!;
                    const ctx = spotCtxs[i]!;
                    const m = spotFromApi(pair, ctx, spotTokens, tokenSymbolMap);
                    // Only skip pairs where the coin name couldn't be resolved (still "@N").
                    // Do NOT filter on markPx/volume: HL returns 0 for both on non-canonical
                    // pairs (HYPE/USDT, XAUT/USDT) in spotMetaAndAssetCtxs even when the
                    // pair is actively traded — these must reach activeCats for the USDT pill.
                    if (m.coin.startsWith("@")) continue; // skip unresolved numeric IDs
                    const existing = spotByName.get(m.coin);
                    if (!existing || m.volume24h > existing.volume24h) {
                        spotByName.set(m.coin, m);
                    }
                }
                for (const m of spotByName.values()) {
                    markets.push(m);
                    spotMarkets.push(m); // all spot dedups go directly to spotMarkets
                }

                // ── Step 4: HIP-3 builder dex perps ───────────────────────────────────
                // ALL builder-dex markets go to HIP-3 regardless of TradFi status.
                // Official HL shows xyz, flx, vntl, km, cash, hyna, para all in HIP-3.
                // TRADFI tab is exclusively main-dex instruments (step 1 above).
                // hip3Promise was started immediately after dexNames was available (above),
                // so perp/spot processing above overlapped with these network requests.
                const hip3Results = await hip3Promise;

                if (cancelled) return;

                // Deduplicate within builder dexes: if the same prefixed coin appears
                // across multiple dex responses (HL returns the full universe for each),
                // keep the entry with the highest OI.
                // Key by the full prefixed coin (e.g. "hyna:BTC") so builder-dex BTC and
                // main-dex BTC are treated as distinct markets — matching official HL behaviour.
                const hip3ByKey = new Map<string, HIP3Market>();

                for (const result of hip3Results) {
                    if (result.status !== "fulfilled") continue;
                    const { dex, dexInfo, meta, ctxs } = result.value;
                    for (let i = 0; i < meta.universe.length; i++) {
                        const asset = meta.universe[i]!;
                        const ctx = ctxs[i]!;
                        if (asset.isDelisted) continue;
                        if (!(parseFloat(ctx.markPx) > 0)) continue;

                        // All builder-dex markets are hip-3; category = dex name so
                        // HIP-3 tab can show per-dex builder pills (xyz, flx, vntl, etc.)
                        // quoteToken comes from the dex info returned by perpDexs (e.g. USDH for flx)
                        const dexQuoteToken = dexInfo.quoteToken ?? "USDC";
                        const market = perpFromApi(asset, ctx, "hip-3", dex, dex, false, dexQuoteToken);
                        // Ensure coin has the dex prefix for uniqueness
                        if (!asset.name.includes(":")) {
                            market.coin = `${dex}:${asset.name}`;
                        }
                        const cap = oiCapMap.get(asset.name);
                        if (cap && cap > 0) {
                            market.oiCap = cap;
                            market.oiUtilization = market.openInterest / cap;
                            market.isAtCap = market.oiUtilization >= 0.99;
                        }

                        // Dedup key = full prefixed coin ("hyna:BTC") so builder-dex and
                        // main-dex versions of the same coin coexist as separate entries.
                        const existing = hip3ByKey.get(market.coin);
                        if (
                            !existing ||
                            market.openInterest > existing.openInterest ||
                            (market.openInterest === existing.openInterest && market.volume24h > existing.volume24h)
                        ) {
                            hip3ByKey.set(market.coin, market);
                        }
                    }
                }
                for (const m of hip3ByKey.values()) {
                    // Strip the dex prefix (e.g. "xyz:NVDA" → "NVDA") to check the sector maps.
                    const rawCoin = baseCoin(m.coin);
                    const isTradfi = TRADFI_COINS.has(rawCoin);

                    markets.push(m);

                    if (isTradfi) {
                        // Re-classify as tradfi so it appears in the TRADFI tab.
                        // Keep m.builder = dex so the builder pill still shows in HIP-3 tab.
                        m.category = TRADFI_CATEGORY_MAP[rawCoin] ?? "Commodities";
                        m.marketClass = "tradfi";
                        tradfiMarkets.push(m); // TRADFI tab
                        hip3Markets.push(m); // HIP-3 tab (builder pill remains)
                    } else {
                        hip3Markets.push(m); // HIP-3 only
                    }
                }

                // ── Step 5: HIP-4 outcome/prediction markets ──────────────────────────
                // allMids gives us the current price cheaply.
                // candleSnapshot gives volume/24h-change, but is expensive and cached for 5 min.
                const allMids = await allMidsPromise;

                if (hip4Promise !== null) {
                    // Cache is stale — fetch fresh candles and rebuild hip4 markets.
                    const hip4CandleResults = await hip4Promise;
                    const freshHip4: HIP3Market[] = [];

                    for (let i = 0; i < outcomeSideCoins.length; i++) {
                        const sideInfo = outcomeSideCoins[i]!;
                        const { coin, outcome } = sideInfo;

                        // Use allMids for the live price (always available)
                        const midStr = allMids[coin];
                        const markPx = midStr ? parseFloat(midStr) : 0;
                        if (markPx <= 0) continue;

                        const candleResult = hip4CandleResults[i];
                        const candles =
                            candleResult?.status === "fulfilled" ? candleResult.value.candles : ([] as HlCandle[]);

                        // Derive volume and 24h change from candles (best-effort; 0 if no candle data)
                        const firstOpen = candles.length > 0 ? parseFloat(candles[0]!.o) : markPx;
                        const volume24h = candles.reduce((sum, c) => sum + parseFloat(c.v) * parseFloat(c.c), 0);
                        const prevCandle = candles.length >= 2 ? candles[candles.length - 2]! : null;
                        const prevClose = prevCandle ? parseFloat(prevCandle.c) : 0;
                        const change1h = prevClose > 0 ? (markPx - prevClose) / prevClose : 0;

                        // Parse description into a human-readable label
                        // e.g. "class:priceBinary|underlying:BTC|expiry:20260505-0600|targetPrice:79980|period:1d"
                        const descMap = Object.fromEntries(
                            outcome.description.split("|").map((p) => {
                                const idx = p.indexOf(":");
                                return idx >= 0 ? [p.slice(0, idx), p.slice(idx + 1)] : [p, ""];
                            })
                        );

                        let category = "Outcome";
                        if (descMap["class"] === "priceBinary") {
                            category = descMap["period"] ? `Crypto (${descMap["period"]})` : "Crypto";
                        }

                        // Build a human-readable name matching the HL dashboard format:
                        // "BTC above 79980 on May 5 at 6:00 AM?" from description fields
                        let humanName = outcome.name; // fallback to API name
                        if (descMap["class"] === "priceBinary" && descMap["underlying"] && descMap["targetPrice"]) {
                            const underlying = descMap["underlying"];
                            const targetPrice = Number(descMap["targetPrice"]).toLocaleString();
                            // expiry format: "20260505-0600" → YYYYMMDD-HHMM (UTC)
                            const expiry = descMap["expiry"] ?? "";
                            let dateLabel = "";
                            const expiryMatch = expiry.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/);
                            if (expiryMatch) {
                                const [, , mm, dd, hh, min] = expiryMatch;
                                const expiryDate = new Date(
                                    Date.UTC(
                                        parseInt(expiryMatch[1]!),
                                        parseInt(mm!) - 1,
                                        parseInt(dd!),
                                        parseInt(hh!),
                                        parseInt(min!)
                                    )
                                );
                                const monthName = expiryDate.toLocaleString("en-US", {
                                    month: "short",
                                    timeZone: "UTC",
                                });
                                const dayNum = expiryDate.getUTCDate();
                                const hourUTC = expiryDate.getUTCHours();
                                const minUTC = expiryDate.getUTCMinutes();
                                const ampm = hourUTC < 12 ? "AM" : "PM";
                                const hour12 = hourUTC % 12 || 12;
                                const minStr = minUTC === 0 ? "" : `:${String(minUTC).padStart(2, "0")}`;
                                dateLabel = ` on ${monthName} ${dayNum} at ${hour12}${minStr} ${ampm}`;
                            }
                            humanName = `${underlying} above ${targetPrice}${dateLabel}?`;
                        }

                        freshHip4.push(
                            zeroBase({
                                coin,
                                name: humanName,
                                builder: "Hyperliquid",
                                category,
                                quoteToken: "USDC",
                                marketClass: "hip-4",
                                leverage: "1x",
                                settlement: "cash",
                                markPx,
                                indexPx: markPx,
                                change24h: firstOpen > 0 ? (markPx - firstOpen) / firstOpen : 0,
                                change24hAbs: markPx - firstOpen,
                                volume24h,
                                change1h,
                                // OI: sum of all contract volume × current price (USD notional).
                                // For short-dated binary markets, cumulative volume ≈ OI because
                                // most positions are held to expiry rather than closed early.
                                openInterest: candles.reduce((sum, c) => sum + parseFloat(c.v), 0) * markPx,
                            })
                        );
                    }

                    hip4CacheRef.current = { ts: nowMs, markets: freshHip4 };
                } else {
                    // Cache is still fresh — update prices from allMids without refetching candles
                    hip4CacheRef.current.markets = hip4CacheRef.current.markets.map((m) => {
                        const midStr = allMids[m.coin];
                        if (!midStr) return m;
                        const markPx = parseFloat(midStr);
                        return { ...m, markPx, indexPx: markPx };
                    });
                }

                // Use cached hip4 markets (either just-fetched or still-fresh).
                for (const m of hip4CacheRef.current.markets) {
                    markets.push(m);
                    hip4Markets.push(m);
                }

                // Compute OI delta since last refresh and update prevOIRef.
                const marketsWithDelta = markets.map((m) => {
                    const prev = prevOIRef.current.get(m.coin) ?? m.openInterest;
                    return { ...m, oiDeltaRefresh: m.openInterest - prev };
                });
                prevOIRef.current = new Map(marketsWithDelta.map((m) => [m.coin, m.openInterest]));
                try {
                    localStorage.setItem(LS_OI_KEY, JSON.stringify(Object.fromEntries(prevOIRef.current)));
                } catch {
                    /* quota exceeded, ignore */
                }

                // Rebuild sub-arrays from the spread objects in marketsWithDelta so that
                // consumers reading from perpMarkets / spotMarkets / tradfiMarkets /
                // hip3Markets / preLaunchMarkets receive objects with oiDeltaRefresh set
                // correctly (not the pre-spread originals which always had oiDeltaRefresh: 0).
                // Membership logic mirrors the push-loop above exactly:
                //   • perpMarkets    — marketClass === "perp"
                //   • spotMarkets    — marketClass === "spot"
                //   • preLaunchMarkets — marketClass === "pre-launch"
                //   • tradfiMarkets  — marketClass === "tradfi"
                //   • hip3Markets    — marketClass === "hip-3", OR marketClass === "tradfi"
                //                      AND builder !== "Hyperliquid" (builder-dex tradfi markets
                //                      appear in BOTH tradfiMarkets and hip3Markets)
                const newPerpMarkets: HIP3Market[] = [];
                const newSpotMarkets: HIP3Market[] = [];
                const newTradfiMarkets: HIP3Market[] = [];
                const newHip3Markets: HIP3Market[] = [];
                const newHip4Markets: HIP3Market[] = [];
                const newPreLaunchMarkets: HIP3Market[] = [];

                for (const m of marketsWithDelta) {
                    if (m.marketClass === "pre-launch") {
                        newPreLaunchMarkets.push(m);
                    } else if (m.marketClass === "spot") {
                        newSpotMarkets.push(m);
                    } else if (m.marketClass === "perp") {
                        newPerpMarkets.push(m);
                    } else if (m.marketClass === "tradfi") {
                        newTradfiMarkets.push(m);
                        // Builder-dex tradfi markets (builder !== "Hyperliquid") also appear
                        // in the HIP-3 tab so the builder pill remains visible there.
                        if (m.builder !== "Hyperliquid") {
                            newHip3Markets.push(m);
                        }
                    } else if (m.marketClass === "hip-3") {
                        newHip3Markets.push(m);
                    } else if (m.marketClass === "hip-4") {
                        newHip4Markets.push(m);
                    }
                }

                if (!cancelled)
                    setState({
                        markets: marketsWithDelta,
                        perpMarkets: newPerpMarkets,
                        spotMarkets: newSpotMarkets,
                        tradfiMarkets: newTradfiMarkets,
                        hip3Markets: newHip3Markets,
                        hip4Markets: newHip4Markets,
                        preLaunchMarkets: newPreLaunchMarkets,
                        loading: false,
                        error: null,
                    });
            } catch (e) {
                if (!cancelled) {
                    setState((prev) => ({ ...prev, loading: false, error: String(e) }));
                    // Retry quickly after failure (rate-limit or transient error) rather than
                    // waiting the full 60s interval. Guard against concurrent retries.
                    if (retryTimer === null) {
                        retryTimer = setTimeout(() => {
                            retryTimer = null;
                            if (!cancelled) void fetchAll();
                        }, 8_000);
                    }
                }
            }
        }

        void fetchAll();
        const id = setInterval(() => void fetchAll(), REFRESH_MS);
        return () => {
            cancelled = true;
            clearInterval(id);
            if (retryTimer !== null) clearTimeout(retryTimer);
        };
    }, []);

    return state;
}
