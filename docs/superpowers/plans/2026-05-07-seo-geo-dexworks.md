# SEO/GEO Hardening — DexWorks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-route canonical URLs, JSON-LD structured data, a static branded OG image, robots.txt, and sitemap.xml to the dexworks React SPA.

**Architecture:** Extend the existing `setPageMeta` utility to accept a `path` (drives canonical + og:url) and a `jsonLd` object (injected as a `<script type="application/ld+json">` tag). Each routed component passes its own schema. A Node.js build script generates `public/og-image.png` from SVG using `@resvg/resvg-js` (pure WASM, no system deps).

**Tech Stack:** TypeScript, React 19, React Router DOM v7, `@resvg/resvg-js` (devDep), Vite, pnpm

**Branch:** `feat/dynamic-page-titles` (extending PR #232)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/dexworks/src/lib/pageMeta.ts` | Modify | canonical, og:url, JSON-LD injection, resetPageMeta |
| `apps/dexworks/src/components/lp/LPDashboard.tsx` | Modify | pass path + JSON-LD breadcrumb; use resetPageMeta |
| `apps/dexworks/src/components/DexCompare.tsx` | Modify | pass path + JSON-LD breadcrumb; use resetPageMeta |
| `apps/dexworks/src/App.tsx` | Modify | pass path + JSON-LD breadcrumb; use resetPageMeta |
| `apps/dexworks/index.html` | Modify | static WebApplication JSON-LD block + og:image/twitter:image |
| `apps/dexworks/package.json` | Modify | add @resvg/resvg-js devDep + gen-og script |
| `apps/dexworks/scripts/gen-og-image.mjs` | Create | SVG → PNG build script |
| `apps/dexworks/public/og-image.png` | Create (generated) | 1200×630 branded static OG image |
| `apps/dexworks/public/robots.txt` | Create | crawl directives |
| `apps/dexworks/public/sitemap.xml` | Create | known stable routes |

---

## Task 1: Update `pageMeta.ts` — canonical, og:url, JSON-LD, resetPageMeta

**Files:**
- Modify: `apps/dexworks/src/lib/pageMeta.ts`

Current content (from PR #232):
```typescript
function setMeta(selector: string, attr: string, value: string) {
    const el = document.querySelector<HTMLMetaElement>(selector);
    if (el) el.setAttribute(attr, value);
}

/** Update document.title and all OG/Twitter meta tags in one call. */
export function setPageMeta(title: string, description: string) {
    document.title = title;
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[name="twitter:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[name="twitter:description"]', "content", description);
    setMeta('meta[name="description"]', "content", description);
}
```

- [ ] **Step 1: Replace the full file with the updated implementation**

```typescript
const BASE_URL = "https://dex.goldrush.dev";

function setMeta(selector: string, attr: string, value: string) {
    const el = document.querySelector<HTMLMetaElement>(selector);
    if (el) el.setAttribute(attr, value);
}

function setCanonical(url: string) {
    const link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (link) link.setAttribute("href", url);
    setMeta('meta[property="og:url"]', "content", url);
}

function upsertJsonLd(schema: object) {
    const id = "ld-json-page";
    let el = document.getElementById(id) as HTMLScriptElement | null;
    if (!el) {
        el = document.createElement("script");
        el.type = "application/ld+json";
        el.id = id;
        document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(schema);
}

/** Update document.title, all OG/Twitter meta tags, canonical URL, and optional JSON-LD. */
export function setPageMeta(
    title: string,
    description: string,
    opts?: { path?: string; jsonLd?: object }
): void {
    const url = opts?.path
        ? `${BASE_URL}${opts.path}`
        : `${BASE_URL}${window.location.pathname}${window.location.search}`;
    document.title = title;
    setMeta('meta[name="description"]', "content", description);
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[name="twitter:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[name="twitter:description"]', "content", description);
    setCanonical(url);
    if (opts?.jsonLd) upsertJsonLd(opts.jsonLd);
}

/** Remove per-route JSON-LD and reset canonical/og:url to root. Call in useEffect cleanup. */
export function resetPageMeta(): void {
    document.getElementById("ld-json-page")?.remove();
    setCanonical(BASE_URL);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/dexworks && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (warnings about existing code are ok).

---

## Task 2: Update `LPDashboard.tsx`

**Files:**
- Modify: `apps/dexworks/src/components/lp/LPDashboard.tsx`

- [ ] **Step 1: Update the import line (line 1)**

Change:
```typescript
import { setPageMeta } from "../../lib/pageMeta";
```
To:
```typescript
import { setPageMeta, resetPageMeta } from "../../lib/pageMeta";
```

- [ ] **Step 2: Replace the dynamic page title useEffect**

Find the block:
```typescript
    // Dynamic page title + meta description
    useEffect(() => {
        const chainLabel = LP_CHAINS.find((c) => c.slug === chainName)?.label ?? chainName.toUpperCase();
        const DEFAULT_TITLE = "GoldRush DEX";
        const DEFAULT_DESC = "Real-time DEX pair discovery, OHLCV charting, and LP analytics. Powered by GoldRush.";

        if (poolInfo?.token0_symbol && poolInfo?.token1_symbol) {
            const pair = `${poolInfo.token0_symbol}/${poolInfo.token1_symbol}`;
            const shortWallet = wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : "";
            setPageMeta(
                `${pair} LP on ${chainLabel} — GoldRush DEX`,
                `Uniswap V3 LP positions${shortWallet ? ` for ${shortWallet}` : ""} in the ${pair} pool on ${chainLabel}. Track P&L, fee APR, and impermanent loss. Powered by GoldRush.`
            );
        } else {
            setPageMeta(
                `${chainLabel} LP Explorer — GoldRush DEX`,
                `Analyze Uniswap V3 liquidity positions on ${chainLabel}. Track P&L, fee APR, and pool depth. Powered by GoldRush.`
            );
        }

        return () => {
            setPageMeta(DEFAULT_TITLE, DEFAULT_DESC);
        };
    }, [chainName, poolInfo, wallet]);
```

Replace with:
```typescript
    // Dynamic page title + meta description
    useEffect(() => {
        const chainLabel = LP_CHAINS.find((c) => c.slug === chainName)?.label ?? chainName.toUpperCase();
        const poolParam = pool ? `?pool=${pool}${wallet ? `&wallet=${wallet}` : ""}` : "";
        const lpPath = `/${chainName}/lp${poolParam}`;

        if (poolInfo?.token0_symbol && poolInfo?.token1_symbol) {
            const pair = `${poolInfo.token0_symbol}/${poolInfo.token1_symbol}`;
            const shortWallet = wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : "";
            setPageMeta(
                `${pair} LP on ${chainLabel} — GoldRush DEX`,
                `Uniswap V3 LP positions${shortWallet ? ` for ${shortWallet}` : ""} in the ${pair} pool on ${chainLabel}. Track P&L, fee APR, and impermanent loss. Powered by GoldRush.`,
                {
                    path: lpPath,
                    jsonLd: {
                        "@context": "https://schema.org",
                        "@type": "WebPage",
                        name: `${pair} LP on ${chainLabel} — GoldRush DEX`,
                        url: `https://dex.goldrush.dev${lpPath}`,
                        breadcrumb: {
                            "@type": "BreadcrumbList",
                            itemListElement: [
                                { "@type": "ListItem", position: 1, name: "GoldRush DEX", item: "https://dex.goldrush.dev" },
                                { "@type": "ListItem", position: 2, name: chainLabel, item: `https://dex.goldrush.dev/${chainName}` },
                                { "@type": "ListItem", position: 3, name: "LP Explorer", item: `https://dex.goldrush.dev/${chainName}/lp` },
                            ],
                        },
                    },
                }
            );
        } else {
            setPageMeta(
                `${chainLabel} LP Explorer — GoldRush DEX`,
                `Analyze Uniswap V3 liquidity positions on ${chainLabel}. Track P&L, fee APR, and pool depth. Powered by GoldRush.`,
                {
                    path: `/${chainName}/lp`,
                    jsonLd: {
                        "@context": "https://schema.org",
                        "@type": "WebPage",
                        name: `${chainLabel} LP Explorer — GoldRush DEX`,
                        url: `https://dex.goldrush.dev/${chainName}/lp`,
                        breadcrumb: {
                            "@type": "BreadcrumbList",
                            itemListElement: [
                                { "@type": "ListItem", position: 1, name: "GoldRush DEX", item: "https://dex.goldrush.dev" },
                                { "@type": "ListItem", position: 2, name: chainLabel, item: `https://dex.goldrush.dev/${chainName}` },
                                { "@type": "ListItem", position: 3, name: "LP Explorer", item: `https://dex.goldrush.dev/${chainName}/lp` },
                            ],
                        },
                    },
                }
            );
        }

        return () => {
            resetPageMeta();
        };
    }, [chainName, poolInfo, wallet, pool]);
```

---

## Task 3: Update `DexCompare.tsx`

**Files:**
- Modify: `apps/dexworks/src/components/DexCompare.tsx`

- [ ] **Step 1: Update the import line**

Change:
```typescript
import { setPageMeta } from "../lib/pageMeta";
```
To:
```typescript
import { setPageMeta, resetPageMeta } from "../lib/pageMeta";
```

- [ ] **Step 2: Replace the page meta useEffect**

Find the block:
```typescript
    useEffect(() => {
        const DEFAULT_TITLE = "GoldRush DEX";
        const DEFAULT_DESC = "Real-time DEX pair discovery, OHLCV charting, and LP analytics. Powered by GoldRush.";
        setPageMeta(
            `DEX Pair Compare — ${displayChain} | GoldRush DEX`,
            `Compare real-time Uniswap V3 pair prices and spreads on ${displayChain}. Live OHLCV charts side by side. Powered by GoldRush.`
        );
        return () => {
            setPageMeta(DEFAULT_TITLE, DEFAULT_DESC);
        };
    }, [displayChain]);
```

Replace with:
```typescript
    useEffect(() => {
        const slug = chainSlugParam ?? activeChain.slug;
        setPageMeta(
            `DEX Pair Compare — ${displayChain} | GoldRush DEX`,
            `Compare real-time Uniswap V3 pair prices and spreads on ${displayChain}. Live OHLCV charts side by side. Powered by GoldRush.`,
            {
                path: `/${slug}/compare`,
                jsonLd: {
                    "@context": "https://schema.org",
                    "@type": "WebPage",
                    name: `DEX Pair Compare — ${displayChain} | GoldRush DEX`,
                    url: `https://dex.goldrush.dev/${slug}/compare`,
                    breadcrumb: {
                        "@type": "BreadcrumbList",
                        itemListElement: [
                            { "@type": "ListItem", position: 1, name: "GoldRush DEX", item: "https://dex.goldrush.dev" },
                            { "@type": "ListItem", position: 2, name: displayChain, item: `https://dex.goldrush.dev/${slug}` },
                            { "@type": "ListItem", position: 3, name: "Compare", item: `https://dex.goldrush.dev/${slug}/compare` },
                        ],
                    },
                },
            }
        );
        return () => {
            resetPageMeta();
        };
    }, [displayChain, chainSlugParam, activeChain.slug]);
```

---

## Task 4: Update `App.tsx`

**Files:**
- Modify: `apps/dexworks/src/App.tsx`

The file already imports `setPageMeta` from `./lib/pageMeta` (added in PR #232).

- [ ] **Step 1: Add `resetPageMeta` to the existing import**

Find:
```typescript
import { setPageMeta } from "./lib/pageMeta";
```
Replace with:
```typescript
import { setPageMeta, resetPageMeta } from "./lib/pageMeta";
```

- [ ] **Step 2: Replace the title+meta useEffect**

Find (the block starting with `// Build the static title + meta description`):
```typescript
    // Build the static title + meta description whenever pair/candle data changes (Option 3)
    useEffect(() => {
        let title = BASE_TITLE;
        let description = `Real-time DEX pair discovery, OHLCV charting, and transaction streaming on ${chainLabel}. Powered by GoldRush.`;
        if (selectedPair) {
            const pair = `${selectedPair.token0}/${selectedPair.token1}`;
            if (candles.length > 0) {
                const last = candles[candles.length - 1];
                const price = last != null && last.close != null ? formatUSD(last.close) : "";
                title = price ? `${pair} ${price} — ${TITLE_SUFFIX}` : `${pair} — ${TITLE_SUFFIX}`;
            } else if (ohlcvLoading) {
                title = `${pair} ⏳ — ${TITLE_SUFFIX}`;
            } else {
                title = `${pair} — ${TITLE_SUFFIX}`;
            }
            description = `Live price chart and trades for ${pair} on ${chainLabel}. Powered by GoldRush.`;
        }
        titleRef.current = title;
        // If tab is visible, apply immediately
        if (!document.hidden) {
            setPageMeta(title, description);
        }
        return () => {
            titleRef.current = BASE_TITLE;
            document.title = BASE_TITLE;
        };
    }, [selectedPair, candles, ohlcvLoading]);
```

Replace with:
```typescript
    // Build the static title + meta description whenever pair/candle data changes (Option 3)
    useEffect(() => {
        let title = BASE_TITLE;
        let description = `Real-time DEX pair discovery, OHLCV charting, and transaction streaming on ${chainLabel}. Powered by GoldRush.`;
        const path = selectedPairAddress ? `/${chainSlug}/${selectedPairAddress}` : `/${chainSlug}`;
        let pairLabel = "";
        if (selectedPair) {
            pairLabel = `${selectedPair.token0}/${selectedPair.token1}`;
            if (candles.length > 0) {
                const last = candles[candles.length - 1];
                const price = last != null && last.close != null ? formatUSD(last.close) : "";
                title = price ? `${pairLabel} ${price} — ${TITLE_SUFFIX}` : `${pairLabel} — ${TITLE_SUFFIX}`;
            } else if (ohlcvLoading) {
                title = `${pairLabel} ⏳ — ${TITLE_SUFFIX}`;
            } else {
                title = `${pairLabel} — ${TITLE_SUFFIX}`;
            }
            description = `Live price chart and trades for ${pairLabel} on ${chainLabel}. Powered by GoldRush.`;
        }
        titleRef.current = title;
        const breadcrumbItems: object[] = [
            { "@type": "ListItem", position: 1, name: "GoldRush DEX", item: "https://dex.goldrush.dev" },
            { "@type": "ListItem", position: 2, name: chainLabel, item: `https://dex.goldrush.dev/${chainSlug}` },
        ];
        if (pairLabel) {
            breadcrumbItems.push({ "@type": "ListItem", position: 3, name: pairLabel, item: `https://dex.goldrush.dev${path}` });
        }
        // If tab is visible, apply immediately
        if (!document.hidden) {
            setPageMeta(title, description, {
                path,
                jsonLd: {
                    "@context": "https://schema.org",
                    "@type": "WebPage",
                    name: title,
                    url: `https://dex.goldrush.dev${path}`,
                    breadcrumb: { "@type": "BreadcrumbList", itemListElement: breadcrumbItems },
                },
            });
        }
        return () => {
            titleRef.current = BASE_TITLE;
            resetPageMeta();
        };
    }, [selectedPair, candles, ohlcvLoading]);
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/dexworks && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

---

## Task 5: Update `index.html`

**Files:**
- Modify: `apps/dexworks/index.html`

- [ ] **Step 1: Add og:image + twitter:image after existing twitter:description meta tag**

Find:
```html
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="GoldRush DEX" />
        <meta
            name="twitter:description"
            content="Real-time DEX pair discovery, OHLCV charting, and LP analytics. Powered by GoldRush."
        />
```

Replace with:
```html
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="GoldRush DEX" />
        <meta
            name="twitter:description"
            content="Real-time DEX pair discovery, OHLCV charting, and LP analytics. Powered by GoldRush."
        />
        <meta property="og:image" content="https://dex.goldrush.dev/og-image.png" />
        <meta name="twitter:image" content="https://dex.goldrush.dev/og-image.png" />
```

- [ ] **Step 2: Add static WebApplication JSON-LD before closing `</head>`**

Find:
```html
    </head>
```

Replace with:
```html
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "WebApplication",
          "name": "GoldRush DEX",
          "url": "https://dex.goldrush.dev",
          "applicationCategory": "FinanceApplication",
          "description": "Real-time DEX pair discovery, OHLCV charting, and LP analytics. Powered by GoldRush.",
          "provider": {
            "@type": "Organization",
            "name": "Covalent",
            "url": "https://www.covalenthq.com"
          },
          "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "USD"
          }
        }
        </script>
    </head>
```

---

## Task 6: Add devDependency and npm script

**Files:**
- Modify: `apps/dexworks/package.json`

- [ ] **Step 1: Install `@resvg/resvg-js` as devDependency**

```bash
cd apps/dexworks && pnpm add -D @resvg/resvg-js
```

Expected: package.json devDependencies gains `"@resvg/resvg-js": "^2.x.x"`, pnpm-lock.yaml updated.

- [ ] **Step 2: Add gen-og script to package.json scripts**

Find in `apps/dexworks/package.json`:
```json
    "scripts": {
        "dev": "vite",
        "build": "vite build",
        "preview": "vite preview"
    },
```

Replace with:
```json
    "scripts": {
        "dev": "vite",
        "build": "vite build",
        "preview": "vite preview",
        "gen-og": "node scripts/gen-og-image.mjs"
    },
```

---

## Task 7: Write OG image generation script and generate `public/og-image.png`

**Files:**
- Create: `apps/dexworks/scripts/gen-og-image.mjs`
- Create (generated): `apps/dexworks/public/og-image.png`

- [ ] **Step 1: Create `apps/dexworks/scripts/` directory and write the script**

Create `apps/dexworks/scripts/gen-og-image.mjs` with this content:

```javascript
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, "../public/og-image.png");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <!-- Background -->
  <rect width="1200" height="630" fill="#0b0b0b"/>

  <!-- Subtle horizontal grid lines -->
  <line x1="0" y1="210" x2="1200" y2="210" stroke="#161616" stroke-width="1"/>
  <line x1="0" y1="420" x2="1200" y2="420" stroke="#161616" stroke-width="1"/>

  <!-- Left green accent bar -->
  <rect x="0" y="0" width="4" height="630" fill="#00cc66"/>

  <!-- Vertical divider -->
  <line x1="660" y1="40" x2="660" y2="576" stroke="#1e1e1e" stroke-width="1"/>

  <!-- GOLDRUSH label (top-left) -->
  <text x="60" y="88" font-family="Courier New,Courier,monospace" font-size="13" fill="#00cc66" font-weight="bold" letter-spacing="5">GOLDRUSH</text>

  <!-- DEX large text -->
  <text x="55" y="220" font-family="Courier New,Courier,monospace" font-size="140" fill="#ffffff" font-weight="bold">DEX</text>

  <!-- Feature list -->
  <text x="62" y="278" font-family="Courier New,Courier,monospace" font-size="15" fill="#666666">&#x25B8; Real-time pair discovery</text>
  <text x="62" y="306" font-family="Courier New,Courier,monospace" font-size="15" fill="#666666">&#x25B8; OHLCV charting</text>
  <text x="62" y="334" font-family="Courier New,Courier,monospace" font-size="15" fill="#666666">&#x25B8; LP position analytics</text>

  <!-- Chain badges -->
  <rect x="62" y="374" width="74" height="24" rx="2" fill="#0d2b1c" stroke="#00cc66" stroke-width="1"/>
  <text x="99" y="391" font-family="Courier New,Courier,monospace" font-size="11" fill="#00cc66" text-anchor="middle" font-weight="bold">BASE</text>

  <rect x="148" y="374" width="90" height="24" rx="2" fill="#1a1a1a" stroke="#2a2a2a" stroke-width="1"/>
  <text x="193" y="391" font-family="Courier New,Courier,monospace" font-size="11" fill="#555555" text-anchor="middle">MEGAETH</text>

  <rect x="250" y="374" width="56" height="24" rx="2" fill="#1a1a1a" stroke="#2a2a2a" stroke-width="1"/>
  <text x="278" y="391" font-family="Courier New,Courier,monospace" font-size="11" fill="#555555" text-anchor="middle">BNB</text>

  <rect x="318" y="374" width="70" height="24" rx="2" fill="#1a1a1a" stroke="#2a2a2a" stroke-width="1"/>
  <text x="353" y="391" font-family="Courier New,Courier,monospace" font-size="11" fill="#555555" text-anchor="middle">MONAD</text>

  <!-- STREAMING indicator -->
  <rect x="62" y="434" width="10" height="10" fill="#00cc66"/>
  <text x="82" y="444" font-family="Courier New,Courier,monospace" font-size="11" fill="#00cc66" letter-spacing="2">STREAMING</text>

  <!-- Right: table header -->
  <text x="700" y="88" font-family="Courier New,Courier,monospace" font-size="11" fill="#333333" letter-spacing="3">PAIR</text>
  <text x="980" y="88" font-family="Courier New,Courier,monospace" font-size="11" fill="#333333" letter-spacing="3" text-anchor="end">PRICE</text>
  <text x="1130" y="88" font-family="Courier New,Courier,monospace" font-size="11" fill="#333333" letter-spacing="3" text-anchor="end">SAFE</text>
  <line x1="690" y1="98" x2="1150" y2="98" stroke="#1e1e1e" stroke-width="1"/>

  <!-- Row 1 -->
  <text x="700" y="146" font-family="Courier New,Courier,monospace" font-size="17" fill="#aaaaaa" font-weight="bold">ETH/USDC</text>
  <text x="980" y="146" font-family="Courier New,Courier,monospace" font-size="17" fill="#cccccc" text-anchor="end">$2,541</text>
  <text x="1130" y="146" font-family="Courier New,Courier,monospace" font-size="17" fill="#00cc66" text-anchor="end">&#x25CE; 92</text>

  <!-- Row 2 (highlighted) -->
  <rect x="690" y="156" width="470" height="42" fill="#0a2016"/>
  <rect x="690" y="156" width="3" height="42" fill="#00cc66"/>
  <text x="706" y="183" font-family="Courier New,Courier,monospace" font-size="17" fill="#ffffff" font-weight="bold">WBTC/ETH</text>
  <text x="980" y="183" font-family="Courier New,Courier,monospace" font-size="17" fill="#00cc66" text-anchor="end">$62.4K</text>
  <text x="1130" y="183" font-family="Courier New,Courier,monospace" font-size="17" fill="#00cc66" text-anchor="end">&#x25CE; 87</text>

  <!-- Row 3 -->
  <text x="700" y="230" font-family="Courier New,Courier,monospace" font-size="17" fill="#aaaaaa" font-weight="bold">SOL/USDC</text>
  <text x="980" y="230" font-family="Courier New,Courier,monospace" font-size="17" fill="#cccccc" text-anchor="end">$184</text>
  <text x="1130" y="230" font-family="Courier New,Courier,monospace" font-size="17" fill="#00cc66" text-anchor="end">&#x25CE; 74</text>

  <!-- Row 4 (dim) -->
  <text x="700" y="272" font-family="Courier New,Courier,monospace" font-size="17" fill="#2a2a2a" font-weight="bold">PEPE/WETH</text>
  <text x="980" y="272" font-family="Courier New,Courier,monospace" font-size="17" fill="#2a2a2a" text-anchor="end">$0.0000093</text>
  <text x="1130" y="272" font-family="Courier New,Courier,monospace" font-size="17" fill="#2a2a2a" text-anchor="end">&#x25CE; 61</text>

  <!-- LP + COMPARE buttons -->
  <rect x="700" y="360" width="44" height="22" rx="2" fill="#0a2016" stroke="#00cc66" stroke-width="1"/>
  <text x="722" y="376" font-family="Courier New,Courier,monospace" font-size="11" fill="#00cc66" text-anchor="middle" font-weight="bold">LP</text>

  <rect x="756" y="360" width="84" height="22" rx="2" fill="#1a1a1a" stroke="#2a2a2a" stroke-width="1"/>
  <text x="798" y="376" font-family="Courier New,Courier,monospace" font-size="11" fill="#555555" text-anchor="middle">COMPARE</text>

  <!-- Bottom separator -->
  <line x1="0" y1="576" x2="1200" y2="576" stroke="#1e1e1e" stroke-width="1"/>

  <!-- Footer -->
  <text x="600" y="608" font-family="Courier New,Courier,monospace" font-size="12" fill="#333333" text-anchor="middle" letter-spacing="4">POWERED BY GOLDRUSH  &#xB7;  dex.goldrush.dev</text>
</svg>`;

const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1200 },
    font: { loadSystemFonts: true },
});
const pngData = resvg.render();
writeFileSync(OUTPUT, pngData.asPng());
console.log("✓ og-image.png written to apps/dexworks/public/");
```

- [ ] **Step 2: Run the script from the dexworks directory**

```bash
cd apps/dexworks && pnpm gen-og
```

Expected output:
```
✓ og-image.png written to apps/dexworks/public/
```

If `Courier New` is not available on the system, resvg falls back to a default sans-serif font — the image will still render; the font just won't match the app's JetBrains Mono exactly. This is acceptable for an OG image.

- [ ] **Step 3: Verify the PNG was created and has a reasonable file size**

```bash
ls -lh apps/dexworks/public/og-image.png
```

Expected: file exists, size between 20 KB and 200 KB.

---

## Task 8: Write `robots.txt` and `sitemap.xml`

**Files:**
- Create: `apps/dexworks/public/robots.txt`
- Create: `apps/dexworks/public/sitemap.xml`

- [ ] **Step 1: Create `apps/dexworks/public/robots.txt`**

```
User-agent: *
Allow: /
Disallow: /api/

Sitemap: https://dex.goldrush.dev/sitemap.xml
```

- [ ] **Step 2: Create `apps/dexworks/public/sitemap.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://dex.goldrush.dev/base</loc>
    <lastmod>2026-05-07</lastmod>
    <changefreq>always</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://dex.goldrush.dev/megaeth</loc>
    <lastmod>2026-05-07</lastmod>
    <changefreq>always</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://dex.goldrush.dev/bnb</loc>
    <lastmod>2026-05-07</lastmod>
    <changefreq>always</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://dex.goldrush.dev/monad</loc>
    <lastmod>2026-05-07</lastmod>
    <changefreq>always</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://dex.goldrush.dev/base/lp</loc>
    <lastmod>2026-05-07</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://dex.goldrush.dev/megaeth/lp</loc>
    <lastmod>2026-05-07</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://dex.goldrush.dev/bnb/lp</loc>
    <lastmod>2026-05-07</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://dex.goldrush.dev/monad/lp</loc>
    <lastmod>2026-05-07</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://dex.goldrush.dev/base/compare</loc>
    <lastmod>2026-05-07</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://dex.goldrush.dev/megaeth/compare</loc>
    <lastmod>2026-05-07</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.6</priority>
  </url>
</urlset>
```

---

## Task 9: Lint, format, commit

- [ ] **Step 1: Run format fix**

```bash
cd ../.. && pnpm format
```

Expected: modified files reformatted, no errors.

- [ ] **Step 2: Run format check**

```bash
pnpm format:check
```

Expected: `All matched files use Prettier code style!`

- [ ] **Step 3: Run lint**

```bash
pnpm lint 2>&1 | grep -E "error|Error" | head -10
```

Expected: 0 errors (pre-existing warnings are fine).

- [ ] **Step 4: Commit everything**

```bash
git add \
  apps/dexworks/src/lib/pageMeta.ts \
  apps/dexworks/src/components/lp/LPDashboard.tsx \
  apps/dexworks/src/components/DexCompare.tsx \
  apps/dexworks/src/App.tsx \
  apps/dexworks/index.html \
  apps/dexworks/package.json \
  apps/dexworks/scripts/gen-og-image.mjs \
  apps/dexworks/public/og-image.png \
  apps/dexworks/public/robots.txt \
  apps/dexworks/public/sitemap.xml \
  pnpm-lock.yaml

git commit -m "feat(dexworks): SEO/GEO hardening — canonical, JSON-LD, OG image, robots, sitemap"
```

- [ ] **Step 5: Push to origin**

```bash
git push
```

PR #232 will automatically pick up the new commit.
