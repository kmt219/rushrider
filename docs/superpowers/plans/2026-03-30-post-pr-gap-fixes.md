# Post-PR Gap Fixes — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the technical and product gaps found across PRs #175 (LightweightChart), #176 (gem tabs), and #177 (safety scores) without touching their core logic.

**Architecture:** Three independent fix groups — chart polish, safety API hardening, gem tab code quality. Each group is a separate commit and could be a separate PR if preferred.

**Tech Stack:** React 19, TypeScript, lightweight-charts 4.1.1, pnpm monorepo

---

## Gap Summary by PR

### PR #175 — LightweightChart (chart polish)
| # | Gap | Severity |
|---|-----|----------|
| A1 | `formatChartPrice` emits trailing zeros (`$0.0100`, `$0.1000`) for prices in 0.01-0.99 range | Important |
| A2 | No OHLC hover legend — functional regression from old SVG chart | Important |
| A3 | Duplicate `.chart-container` CSS rules (styles defined twice in style.css) | Minor |
| A4 | Chart height is fixed at 400px — no mobile responsive breakpoint | Minor |
| A5 | `prevLenRef` fragile: if pair switch skips the empty-candles phase, incremental `update()` fires on wrong pair | Minor |

### PR #176 — Gem tabs (6 issues)
| # | Gap | Severity |
|---|-----|----------|
| B1 | `pctChange` return type declared `number\|null` but always returns `number`; callers use dead `!` non-null assertions | Important |
| B2 | `_unsupportedHolders` catch-all swallows any error (network blip → token permanently suppressed) — should only suppress 404 | Important |
| B3 | `spikeVal`/`pctChange` each computed 3× per pair (filter + sort + map) — runs every 2 s on the full pair list | Suggestion |
| B4 | Magic numbers (`5`, `1`, `-Infinity`, `3`) buried in nested functions — hard to tune | Suggestion |
| **B5** | **`selectedTimeframe === "4h"` silently falls to the `else` (24h) branch** — `use1h` is boolean so 4h uses wrong 24h data, showing completely wrong rankings | **Critical** |
| **B6** | **`sessionPct` still guards `if (pct !== 0) return pct`** — equal initial/current price returns `null` instead of `0`, causing unnecessary cascade through slower fallback layers | Important |

### PR #177 — Safety scores (API hardening)
| # | Gap | Severity |
|---|-----|----------|
| C1 | `prefetchSafetyScore` acquires semaphore slots for chains where `restApi: false` (3 slots wasted per unsupported pair) | Important |
| C2 | `fetchHolderDistribution` catch-all at line 149 in `useSafetyScore.ts` silently suppresses any error as defaults, no 404 dedup | Important |
| C3 | `useContractAnalysis` events endpoint has no 404 suppression or dedup guard | Important |
| C4 | `useAllSpotPrices` fires up to 60 concurrent REST calls completely outside the semaphore; not addressed in #177 | Important |
| C5 | `clearSafetyCache()` does not clear `_unsupported` Sets in `useDeployerReputation` and `useContractAnalysis` | Suggestion |

---

## Task 1 — Chart Polish (PR #175 gaps)

**Files:**
- Modify: `packages/shared-ui/src/components/LightweightChart.tsx`
- Modify: `apps/dexworks/src/style.css`

### Step 1: Fix `formatChartPrice` trailing zeros

**Problem:** `abs.toFixed(4)` in the `>= 0.0095` branch emits `$0.0100`, `$0.1000` for round prices.

In `packages/shared-ui/src/components/LightweightChart.tsx`, change the `>= 0.0095` branch:

```ts
// BEFORE
if (abs >= 0.0095) return `${sign}$${abs.toFixed(4)}`;

// AFTER — trim trailing zeros after the decimal point
if (abs >= 0.0095) {
    const s = abs.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
    return `${sign}$${s}`;
}
```

Verify expected outputs:
- `0.01` → `$0.01` (not `$0.0100`)
- `0.1` → `$0.1` (not `$0.1000`)
- `0.0123` → `$0.0123` (unchanged — no trailing zero)
- `0.1230` → `$0.123`

### Step 2: Add OHLC hover legend

**Problem:** The old SVG `CandlestickChart` showed OHLCV values on hover. The lightweight-charts version regresses this.

**Solution:** Subscribe to `subscribeCrosshairMove`, store the hovered candle in a React ref + a small state, render a header row above the chart.

Replace the component return in `LightweightChart.tsx`:

```tsx
// Add at the top of the component, after the existing refs:
const [hovered, setHovered] = useState<{
    open: number; high: number; low: number; close: number; volume: number; time: number;
} | null>(null);
const setHoveredRef = useRef(setHovered);
setHoveredRef.current = setHovered;
```

In the chart creation `useEffect`, after `chartRef.current = chart;` and before `if (showVolume)`:

```tsx
chart.subscribeCrosshairMove((param) => {
    if (!param.time || !candleSeriesRef.current) {
        setHoveredRef.current(null);
        return;
    }
    const c = param.seriesData.get(candleSeriesRef.current) as
        | { open: number; high: number; low: number; close: number }
        | undefined;
    const volSeries = volumeSeriesRef.current;
    const v = volSeries ? (param.seriesData.get(volSeries) as { value?: number } | undefined) : undefined;
    if (c) {
        setHoveredRef.current({
            open: c.open, high: c.high, low: c.low, close: c.close,
            volume: v?.value ?? 0,
            time: param.time as number,
        });
    }
});
```

Update the return to wrap the chart div and add the legend header:

```tsx
const isGreen = !hovered || hovered.close >= hovered.open;
return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
        {/* OHLCV hover legend */}
        <div style={{
            display: "flex", gap: "12px", padding: "4px 8px",
            fontSize: "11px", fontFamily: "monospace",
            color: isGreen ? "#00d084" : "#e74c3c",
            minHeight: "22px", flexShrink: 0,
        }}>
            {hovered ? (
                <>
                    <span>O&nbsp;{formatChartPrice(hovered.open)}</span>
                    <span>H&nbsp;{formatChartPrice(hovered.high)}</span>
                    <span>L&nbsp;{formatChartPrice(hovered.low)}</span>
                    <span>C&nbsp;{formatChartPrice(hovered.close)}</span>
                    {showVolume && hovered.volume > 0 && (
                        <span style={{ color: "rgba(229,231,235,0.6)" }}>
                            V&nbsp;{formatChartPrice(hovered.volume)}
                        </span>
                    )}
                </>
            ) : (
                <span style={{ color: "rgba(229,231,235,0.3)" }}>OHLCV</span>
            )}
        </div>
        <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />
    </div>
);
```

Also add the `useState` import to the imports line:

```tsx
// BEFORE
import { memo, useEffect, useRef } from "react";

// AFTER
import { memo, useEffect, useRef, useState } from "react";
```

**Note:** The `containerRef` div changes from `height: "100%"` to `flex: 1, minHeight: 0` so the legend header doesn't overflow the fixed container height.

### Step 3: Deduplicate `.chart-container` CSS

In `apps/dexworks/src/style.css`, search for `.chart-container` — there are two declarations (around lines 848 and 1730). Remove the duplicate by merging any unique properties from the second rule into the first, then deleting the second rule.

Run a diff between the two blocks to confirm there are no conflicting properties before merging.

### Step 4: Add mobile responsive chart height

In `apps/dexworks/src/style.css`, after the `.chart-container` rule, add:

```css
@media (max-width: 640px) {
    .chart-container {
        height: 260px;
    }
}
```

### Step 5: Harden `prevLenRef` against pair switch without empty-candles phase

**Problem:** If pair A has 120 candles and pair B loads directly with 118 candles (no `[]` intermediate), `prevLenRef.current = 120` causes `update()` to be called instead of `setData()`.

The fix is to also compare the last known timestamp. In the data-push `useEffect`, change the incremental update guard:

```tsx
// BEFORE
if (sorted.length === prevLenRef.current && sorted.length > 0) {

// AFTER — also require the oldest timestamp to be identical (proves same pair's data)
const firstTime = sorted[0]?.[0] ?? 0;
if (
    sorted.length === prevLenRef.current &&
    sorted.length > 0 &&
    firstTime === prevFirstTimeRef.current
) {
```

Add `const prevFirstTimeRef = useRef(0);` with the other refs, and update it alongside `prevLenRef` in both the empty-candles path and the successful `setData`/`update` path:

```tsx
// In the empty-candles path:
prevLenRef.current = 0;
prevFirstTimeRef.current = 0;

// After setData (the else branch):
chartRef.current?.timeScale().fitContent();
prevFirstTimeRef.current = sorted[0]?.[0] ?? 0;

// After successful update (the try block):
// (no change needed — same pair, prevFirstTimeRef stays the same)
```

Also initialise `prevFirstTimeRef.current` after the fallback `setData` in the catch block:
```tsx
// In the catch block (after setData fallback):
prevFirstTimeRef.current = sorted[0]?.[0] ?? 0;
```

### Step 6: Commit

```bash
git add packages/shared-ui/src/components/LightweightChart.tsx apps/dexworks/src/style.css
git commit -m "fix(chart): trim price label zeros, add OHLC legend, dedup CSS, mobile height, harden prevLenRef"
```

---

## Task 2 — Safety API Hardening (PR #177 gaps)

**Files:**
- Modify: `apps/dexworks/src/hooks/useSafetyScore.ts`
- Modify: `apps/dexworks/src/hooks/useContractAnalysis.ts`
- Modify: `apps/dexworks/src/hooks/useDeployerReputation.ts`
- Modify: `apps/dexworks/src/hooks/useAllSpotPrices.ts`

### Step 1: Add `_unsupportedHolders` with 404-only suppression

In `apps/dexworks/src/hooks/useSafetyScore.ts`, add a dedup Set at module level (near line 18):

```ts
// Suppress retries for tokens whose holder endpoint returns 404.
// Only populated on 404 — transient errors are not cached.
const _unsupportedHolders = new Set<string>();
```

Update `clearSafetyCache()` to clear it:

```ts
export function clearSafetyCache(): void {
    _signalCache.clear();
    _pendingEvents.clear();
    _inflight.clear();
    _unsupportedHolders.clear();  // add this line
}
```

In `fetchHolderDistribution` (around line 75), add a guard at the top of the function body (after the `getChainCaps` check):

```ts
const holderKey = `${chainName}:${tokenAddress}`;
if (_unsupportedHolders.has(holderKey)) {
    return { totalCount: 0, topHolderPct: 0, top5HolderPct: 0, top20HolderPct: 0, giniCoeff: 0 };
}
```

Update the catch block to only add to `_unsupportedHolders` on 404:

```ts
} catch (err: unknown) {
    // Only suppress on 404 — transient failures should be retried on next score computation
    if ((err as { status?: number })?.status === 404) {
        _unsupportedHolders.add(`${chainName}:${tokenAddress}`);
    }
    return { totalCount: 0, topHolderPct: 0, top5HolderPct: 0, top20HolderPct: 0, giniCoeff: 0 };
}
```

### Step 2: Add chain-cap guard to `prefetchSafetyScore`

In `apps/dexworks/src/hooks/useSafetyScore.ts`, at the top of `prefetchSafetyScore` (line 175):

```ts
export function prefetchSafetyScore(pairData: NewPairData, chainName: string): void {
    // Skip entirely for chains without REST API support — avoids wasting semaphore slots.
    if (!getChainCaps(chainName).restApi) return;

    const tokenAddress = pairData.base_token?.contract_address;
    // ... rest of function unchanged
```

### Step 3: Fix `useContractAnalysis` events endpoint 404 suppression

Read `apps/dexworks/src/hooks/useContractAnalysis.ts` first to see the current structure, then add a module-level Set for the events endpoint similar to the metadata suppression that already exists:

Add near the top of the file (with the other module-level Sets):
```ts
const _unsupportedEvents = new Set<string>(); // chainName:tokenAddress pairs that 404 on events
```

In `fetchContractAnalysis` (or `fetchContractEvents`, whatever the inner function is named), add a guard at the top and update the catch to only record 404s — matching the pattern already used for the metadata endpoint in that file.

### Step 4: Fix `useAllSpotPrices` 404 chain suppression

Read `apps/dexworks/src/hooks/useAllSpotPrices.ts` to confirm the current `_chainUnsupported` Set behavior. The known issue: if the chain 404s during a transient outage, it stays suppressed for the entire session.

Add a timestamp to the suppression so it expires after 5 minutes:

```ts
// Replace: const _chainUnsupported = new Set<string>();
// With:
const _chainUnsupported = new Map<string, number>(); // chainName → suppressedAt timestamp
const CHAIN_SUPPRESS_TTL = 5 * 60_000;
```

Update all `.has()` checks to also verify the TTL:
```ts
// BEFORE
if (_chainUnsupported.has(chain)) return;

// AFTER
const suppressedAt = _chainUnsupported.get(chain);
if (suppressedAt && Date.now() - suppressedAt < CHAIN_SUPPRESS_TTL) return;
```

Update all `.add()` calls to `.set(chain, Date.now())`.

### Step 5: Fix `clearSafetyCache` to clear cross-hook unsupported Sets

In `apps/dexworks/src/hooks/useDeployerReputation.ts`, add an export for the clear function:

```ts
export function clearDeployerCache(): void {
    _cache.clear();
    _unsupported.clear();
}
```

In `apps/dexworks/src/hooks/useContractAnalysis.ts`, add an export:

```ts
export function clearContractCache(): void {
    // clear all module-level caches and unsupported sets in this file
}
```

In `apps/dexworks/src/hooks/useSafetyScore.ts`, call both from `clearSafetyCache()`:

```ts
import { clearDeployerCache } from "./useDeployerReputation";
import { clearContractCache } from "./useContractAnalysis";

export function clearSafetyCache(): void {
    _signalCache.clear();
    _pendingEvents.clear();
    _inflight.clear();
    _unsupportedHolders.clear();
    clearDeployerCache();
    clearContractCache();
}
```

### Step 6: Commit

```bash
git add apps/dexworks/src/hooks/useSafetyScore.ts \
        apps/dexworks/src/hooks/useContractAnalysis.ts \
        apps/dexworks/src/hooks/useDeployerReputation.ts \
        apps/dexworks/src/hooks/useAllSpotPrices.ts
git commit -m "fix(safety): 404 suppression for holders/contract events, chain-cap prefetch guard, spot price TTL"
```

---

## Task 3 — Gem Tab Code Quality (PR #176 gaps)

**Files:**
- Modify: `apps/dexworks/src/App.tsx`

### Step 1: Fix `pctChange` return type and remove dead `!` assertions

In `apps/dexworks/src/App.tsx`, find the `pctChange` function declaration (around line 2061).

Change the return type from `number | null` to `number` (the final `return baselinePct(p)` already returns `number | null` but the `return 0` fallback at the very end — if present — makes it always `number`).

**First verify** whether `baselinePct(p)` is truly the last line or if there's a `?? 0` / `return 0` after it. Looking at the code at line 2083: `return baselinePct(p);` where `baselinePct` can return `null`. So `pctChange` DOES still return `number | null` — the review was slightly incorrect. The `return 0` fallback was added as a final line after `baselinePct`.

Check whether `return 0` is actually present at the end of `pctChange`. If it is, then update the return type to `number` and remove all `!` non-null assertions in the callers (lines ~2112-2114, 2119-2121).

If `return 0` is NOT present (and `return baselinePct(p)` is truly the last line), add it:

```ts
const pctChange = (p: NewPairData): number => {
    // ... existing cascade ...
    return baselinePct(p) ?? 0;  // final fallback — returns 0 when no price data available
};
```

Then remove `!` from:
```ts
// GAINERS sort and map:
.sort((a, b) => pctChange(b) - pctChange(a))
.map((p) => ({ ...base(p), pct_change: pctChange(p) }));

// LOSERS sort and map:
.sort((a, b) => pctChange(a) - pctChange(b))
.map((p) => ({ ...base(p), pct_change: pctChange(p) }));
```

Also update the GAINERS filter to remove the `?? -Infinity` dead fallback:
```ts
// BEFORE
.filter((p) => (pctChange(p) ?? -Infinity) >= 1)

// AFTER
.filter((p) => pctChange(p) >= 1)
```

And LOSERS filter:
```ts
// BEFORE
.filter((p) => (pctChange(p) ?? 0) < 0)

// AFTER
.filter((p) => pctChange(p) < 0)
```

### Step 2: Eliminate triple-computation of `spikeVal` / `pctChange`

**GAINERS** — compute once per pair before filter/sort/map:

```ts
if (activeGemTab === "gainers") {
    return [...ps]
        .map((p) => ({ p, pct: pctChange(p) }))
        .filter(({ pct }) => pct >= 1)
        .sort((a, b) => b.pct - a.pct)
        .map(({ p, pct }) => ({ ...base(p), pct_change: pct }));
}
```

**LOSERS:**

```ts
if (activeGemTab === "losers") {
    return [...ps]
        .map((p) => ({ p, pct: pctChange(p) }))
        .filter(({ pct }) => pct < 0)
        .sort((a, b) => a.pct - b.pct)
        .map(({ p, pct }) => ({ ...base(p), pct_change: pct }));
}
```

**SPIKES** — move `spikeVal` out of the inner `if` block (it's defined inline; lift it up to the level of `pctChange`), then use the same pre-compute pattern:

```ts
if (activeGemTab === "spikes") {
    return [...ps]
        .map((p) => ({ p, spike: spikeVal(p) ?? 0 }))
        .filter(({ spike }) => spike > 0)
        .sort((a, b) => b.spike - a.spike)
        .map(({ p, spike }) => ({ ...base(p), pct_change_1h: spike }));
}
```

### Step 3: Extract magic number constants

At the top of the `gemsData` useMemo (before the `pctChange` function definition), add named constants:

```ts
const GAINER_MIN_PCT = 1;    // minimum % gain to appear in GAINERS tab
const SPIKE_MIN_ABS_PCT = 0; // minimum absolute % move for SPIKES (0 = any move, real filtering via spikeVal > 0)
const MOMENTUM_MIN_LIQ = 500; // minimum $ liquidity for MOMENTUM tab
```

Reference these in the filter conditions:
```ts
.filter(({ pct }) => pct >= GAINER_MIN_PCT)
// ...
.filter((p) => (p.liquidity ?? 0) >= MOMENTUM_MIN_LIQ)
```

### Step 4: Fix `selectedTimeframe === "4h"` silently using 24h data (B5 — Critical)

In `apps/dexworks/src/App.tsx`, in the `gemsData` useMemo (line 2011), replace the binary `use1h` flag with a proper three-way timeframe:

```ts
// BEFORE
const use1h = selectedTimeframe === "1h";

// AFTER
const timeframeMs =
    selectedTimeframe === "1h" ? 3_600_000 :
    selectedTimeframe === "4h" ? 14_400_000 :
    86_400_000;
const use1h = selectedTimeframe === "1h"; // keep for stream field selection (stream_pct_1h vs stream_pct_24h)
```

Then update the `sessionPct` priceHistory cutoff (line 2036):

```ts
// BEFORE
const cutoff = Date.now() - (use1h ? 3_600_000 : 86_400_000) - 30_000;

// AFTER
const cutoff = Date.now() - timeframeMs - 30_000;
```

And update the `activityMetric` priceHistory cutoff (line 2100):

```ts
// BEFORE
const cutoff = Date.now() - (use1h ? 3_600_000 : 86_400_000);

// AFTER
const cutoff = Date.now() - timeframeMs;
```

The stream field selection (`stream_pct_1h` vs `stream_pct_24h`) stays based on `use1h` since the API only exposes two windows; for 4h, `stream_pct_1h` is the closest available field:

```ts
// In pctChange, the existing logic already handles this correctly:
// use1h → prefer stream_pct_1h; else → prefer stream_pct_24h
// For 4h, prefer stream_pct_1h (closer than 24h). No change needed here.
```

### Step 5: Remove `if (pct !== 0) return pct` guard in `sessionPct` (B6)

In `apps/dexworks/src/App.tsx`, in `sessionPct` (line 2027):

```ts
// BEFORE
const pct = ((p.quote_rate_usd - p.initial_quote_rate_usd) / p.initial_quote_rate_usd) * 100;
if (pct !== 0) return pct;

// AFTER — zero is a valid measurement; filters handle the threshold
const pct = ((p.quote_rate_usd - p.initial_quote_rate_usd) / p.initial_quote_rate_usd) * 100;
return pct;
```

This makes `sessionPct` return `0` for a stable pair rather than falling through to the priceHistory (which may produce noise). The GAINERS filter (`>= 1`) and LOSERS filter (`< 0`) naturally exclude 0% pairs.

### Step 6: Commit

```bash
git add apps/dexworks/src/App.tsx
git commit -m "fix(gems): fix 4h timeframe treated as 24h, allow zero-pct from sessionPct, fix pctChange type + precompute"
```

---

## Task 4: Verify build and lint

```bash
pnpm --filter dexworks build
pnpm lint && pnpm format:check
```

Fix any type errors or lint warnings, then commit fixes if needed.

---

## Priority Order

Execute in this order (each is independently mergeable):

1. **Task 1** — chart fixes (visible user impact, corrects regression)
2. **Task 2** — safety API hardening (reduces 404 floods, correct behavior on chain switch)
3. **Task 3** — gem tab quality (low risk, code clarity improvement)
