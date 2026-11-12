# GoldRush Demos Monorepo

A collection of lightweight demo applications showcasing the [GoldRush API](https://goldrush.dev). Each demo is a standalone app demonstrating a specific capability for both the Foundational and Streaming API.

## Demos

| Demo                                              | Live Link | Description                                           | Key APIs               |
| ------------------------------------------------- | ----------------------------------------------------- | ---------------------- | ------- |
| [Event Stream Demo](./apps/event-stream-demo) |  [https://event-stream-demo.vercel.app](https://event-stream-demo.vercel.app) | Real-time blockchain event streaming with live transaction decoding | [Wallet Activity Stream](https://goldrush.dev/docs/api-reference/streaming-api/subscriptions/wallet-activity-stream) |
| [DexWorks](./apps/dexworks) | https://dex.goldrush.dev | Real-time DEX pair discovery, transaction monitoring, and OHLCV charting | [New Pairs Stream](https://goldrush.dev/docs/api-reference/streaming-api/subscriptions/new-pairs-stream), [Wallet Activity Stream](https://goldrush.dev/docs/api-reference/streaming-api/subscriptions/wallet-activity-stream), [OHLCV Stream](https://goldrush.dev/docs/api-reference/streaming-api/subscriptions/ohlcv-stream) |
| [RedStone](./apps/redstone) | https://redstone.goldrush.dev | Real-time RedStone oracle price feed charts on MegaETH | [OHLCV Stream](https://goldrush.dev/docs/api-reference/streaming-api/subscriptions/ohlcv-stream) |
| [Hyperliquid Market Screener](./apps/hyperliquid) | | Real-time Hyperliquid HIP-3 & TradFi market screener with heatmaps, watchlists, and order flow | Hyperliquid API |
| [GraphQL Playground](./apps/graphql-playground) | | Interactive GraphiQL interface for the GoldRush Streaming API | [Streaming API](https://goldrush.dev/docs/api-reference/streaming-api/) |
| [RUSH RIDER](./apps/rushrider) | | Ride a physics dirt bike across live OHLCV charts — pick a token, pick a chain, try not to crash | [OHLCV Stream](https://goldrush.dev/docs/api-reference/streaming-api/subscriptions/ohlcv-stream), Token Search, Pair Updates |

### DexWorks — Vision

DexWorks is a real-time DEX trading intelligence tool. The idea is simple: give traders a live, streaming view of what's happening on-chain right now — new pairs being created, transactions flowing through them, and price action forming in real time — all powered by a single WebSocket connection to the GoldRush Streaming API.

**What it demonstrates:**

- **Live pair discovery** — Watch new trading pairs appear the moment they're created on-chain. Each pair shows its protocol, initial liquidity, and market cap so traders can evaluate opportunities as they emerge. Click any pair row to select it and drill into its activity.
- **Transaction monitoring** — Select any pair and see its transactions stream in live. Track volume and activity to gauge real demand vs. noise.
- **OHLCV charting** — View candlestick charts that update in real time as trades happen. No polling, no page refreshes — just a persistent stream of price data rendered into candles.
- **Gem discovery** — Surface pairs worth watching by filtering for momentum, gainers, losers, price spikes, and newly created pairs across configurable timeframes.
- **Watchlist** — Save pairs to a persistent watchlist stored in localStorage so you can track them across sessions.
- **Block explorer links** — Jump directly to pairs and contracts on their chain's block explorer for deeper on-chain analysis.
- **Streaming performance metrics** — Latency, throughput, and uptime stats are displayed alongside the data, showing that the GoldRush Streaming API can deliver sub-second blockchain data at scale.

The app is built with React, TypeScript, and a brutalist terminal-inspired UI. It uses three concurrent GraphQL WebSocket subscriptions (new pairs, wallet transactions, OHLCV) to show how a single API key can power a sophisticated multi-stream trading interface.

### RedStone — Vision

RedStone is a real-time oracle price feed viewer for the MegaETH mainnet. It streams live OHLCV candlestick data from RedStone Bolt push-based oracle feeds — giving traders and developers a live, charting view of major crypto and stablecoin prices as they update on-chain.

**What it demonstrates:**

- **Live OHLCV charting** — Candlestick charts that update in real time via a persistent GraphQL WebSocket subscription. Supports 1-second, 1-minute, and 1-hour intervals.
- **Feed browser** — Browse and search across RedStone oracle feeds (BTC, ETH, SOL, BNB, XRP, ADA, DOGE, USDT, USDC) with a sidebar feed list.
- **Shareable URLs** — Feed selection and interval are synced to query parameters so any chart view can be shared as a link.
- **Dynamic page title** — Shows live price and percent change in the browser tab; scrolls a ticker when the tab is backgrounded.
- **Client-side caching** — Candle data is cached per feed/interval with a 5-minute TTL so switching between feeds is instant.

The app is built with React, TypeScript, and uses a single OHLCV GraphQL WebSocket subscription to show how GoldRush's Streaming API can power oracle price feed visualizations.

### Hyperliquid Market Screener — Vision

Hyperliquid Market Screener is a real-time market screener for Hyperliquid's HIP-3 perpetuals and TradFi markets. It gives traders a Bloomberg-terminal-style view of the Hyperliquid ecosystem with live data updates.

**What it demonstrates:**

- **Screener table** — Browse all Hyperliquid markets with sortable columns for price, 24h change, volume, open interest, funding rate, and more.
- **Sector heatmap** — Visualize market performance at a glance with a color-coded heatmap grouped by category.
- **Builder cards** — Explore markets grouped by builder with aggregate stats.
- **Detail view** — Drill into any market for order book depth, trade feed, liquidation history, order flow analysis, and fee economics.
- **Watchlist** — Save markets to a persistent watchlist for quick access across sessions.
- **Command palette** — Keyboard-driven navigation with a command palette for fast market lookup.
- **Live ticker** — A scrolling tape ticker showing real-time price updates across all markets.

The app is built with React, TypeScript, and Vite. It uses mock data generation to simulate real-time market updates, making it a fully self-contained demo with no external API keys required.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) >= 20
- [pnpm](https://pnpm.io) >= 10
- A [GoldRush API key](https://goldrush.dev/platform/apikey)

### Installation

```bash
git clone https://github.com/covalenthq/goldrush-demos-monorepo.git
cd goldrush-demos-monorepo
pnpm install
```

### Running a Demo App

```bash
# Copy the .env.example to .env and fill in the variables.
cp apps/event-stream-demo/.env.example apps/event-stream-demo/.env
cp apps/dexworks/.env.example apps/dexworks/.env
cp apps/redstone/.env.example apps/redstone/.env
cp apps/hyperliquid/.env.example apps/hyperliquid/.env
cp apps/graphql-playground/.env.example apps/graphql-playground/.env

# Start a specific app's dev server
pnpm --filter event-log-stream-demo dev
pnpm --filter dexworks dev
pnpm --filter redstone dev
pnpm --filter hyperliquid dev
pnpm --filter @covalenthq/goldrush-graphql-playground dev
```

## Repository Structure

```
goldrush-demos-monorepo/
├── apps/                     # Contains individual demo apps
├── packages/                 # Shared packages (shared-ui)
├── .github/workflows/        # CI (lint + format checks)
├── .prettierrc.json          # Code formatting config
├── eslint.config.mjs         # Linting config
├── pnpm-workspace.yaml       # pnpm workspace definition
├── CLAUDE.md                 # AI coding assistant guidance
└── README.md                 # This file
```

## Development

### Lint and Format

```bash
# From the monorepo root
pnpm lint          # Check for lint errors
pnpm lint:fix      # Auto-fix lint errors
pnpm format        # Format all files
pnpm format:check  # Check formatting (CI)
```

### Adding a New Demo

1. Create a new app under `apps/`:
   ```bash
   # Vite (vanilla JS)
   cd apps && pnpm create vite my-new-demo

   # Next.js (React/TypeScript)
   cd apps && pnpm create next-app@latest my-new-demo
   ```
2. Add your environment variables, including your GoldRush API key, to the app's `.env` file. Then create an `.env.example` with just the variable names. 
3. Run `pnpm install` from the root
4. Update the demo table in this README.


## Deployment

Each demo app is deployed independently using [Vercel](https://vercel.com). Every app has its own Vercel project with the **Root Directory** set to its folder (e.g. `apps/event-stream-demo`).

- **Automatic deploys**: Pushing to `main` triggers a production deploy for any app whose files changed.
- **Preview deploys**: Opening a PR automatically creates a preview deployment.
- **Build config**: Each app includes a `vercel.json` that tells Vercel how to build within the monorepo context.
- **Environment variables**: Set your app's env vars (e.g. `VITE_GOLDRUSH_API_KEY`) in the Vercel project dashboard under Settings > Environment Variables.

## Tech Stack

- **Build**: [Vite](https://vite.dev) / [Next.js](https://nextjs.org)
- **Languages**: JavaScript (ES Modules), TypeScript
- **Package Manager**: [pnpm](https://pnpm.io) workspaces
- **Linting**: [ESLint](https://eslint.org) 9 (flat config)
- **Formatting**: [Prettier](https://prettier.io)


## Contributing

1. Fork the repository
2. Create a feature branch
3. Ensure `pnpm lint` and `pnpm format:check` pass
4. Open a pull request


