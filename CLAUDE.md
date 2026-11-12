# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GoldRush Demos is a collection of standalone demo applications showcasing the [GoldRush API](https://goldrush.dev) by [Covalent](https://www.covalenthq.com). The repository is organized as a pnpm monorepo with individual demo apps under the `apps/` directory.

## Repository Structure

```
goldrush-demos-monorepo/
├── apps/
│   ├── dexworks/              - Real-time DEX pair discovery & trading dashboard
│   ├── event-stream-demo/     - Real-time blockchain event streaming
│   └── graphql-playground/    - Interactive GraphiQL for GoldRush Streaming API
├── .github/workflows/         - CI (lint + format checks)
├── .gitignore                 - Root-level git ignores
├── .prettierignore            - Prettier ignore patterns
├── .prettierrc.json           - Prettier config
├── eslint.config.mjs          - ESLint flat config
├── pnpm-workspace.yaml        - Workspace definition
├── CLAUDE.md                  - This file
└── README.md                  - Project README
```

## Applications

### DexWorks (`/apps/dexworks`)

Real-time DEX pair discovery, transaction monitoring, and OHLCV charting.

- **Tech**: React 19 + TypeScript + Vite
- **Key deps**: ethers.js (ABI decoding), graphql-ws (WebSocket subscriptions), lucide-react (icons)
- **Features**: Live new pair discovery, watchlist with localStorage persistence, real-time OHLCV candlestick charts, transaction streaming, gem discovery analytics, stream performance metrics
- **Streaming hooks**: `useNewPairsStream`, `useWalletStream`, `useOHLCVStream` — three concurrent GraphQL WebSocket subscriptions
- **Env vars**: `VITE_GOLDRUSH_API_KEY` (required), `VITE_GOLDRUSH_STREAM_URL` (optional, defaults to staging endpoint)
- **Port**: 5173 (Vite default)

### Event Stream Demo (`/apps/event-stream-demo`)

Real-time blockchain event streaming using GoldRush's WebSocket API.

- **Tech**: Vanilla JS + Vite
- **Key deps**: ethers.js (ABI decoding), graphql-ws (WebSocket subscriptions)
- **Features**: Live transaction feed, log decoding, latency metrics, multi-chain support
- **Env vars**: `VITE_GOLDRUSH_API_KEY` (required), `VITE_GOLDRUSH_STREAM_URL` (optional)
- **Port**: 5173 (Vite default)

### GraphQL Playground (`/apps/graphql-playground`)

Interactive GraphiQL interface for exploring the GoldRush Streaming API.

- **Tech**: Next.js 15 + React 19 + TypeScript + Tailwind CSS v4
- **Key deps**: graphiql (GraphiQL editor), graphql-ws (WebSocket subscriptions), @graphiql/toolkit
- **Features**: API key authentication (sessionStorage), embeddable via URL params (`?query=`, `?readOnly=true`, `?full=true`), WebSocket-based GraphQL subscriptions
- **Env vars**: `NEXT_PUBLIC_WSS_BASE_URL` (required, WebSocket endpoint)
- **Port**: 3000 (Next.js default)

## Development Commands

### Per-app development (from monorepo root)

```bash
pnpm --filter <package-name> dev          # Start dev server
pnpm --filter <package-name> build        # Production build
pnpm --filter <package-name> preview      # Preview production build
```

### Monorepo-wide commands (from root)

```bash
pnpm lint         # Lint all apps
pnpm lint:fix     # Lint and auto-fix
pnpm format       # Format all files
pnpm format:check # Check formatting (used in CI)
```

## Environment Setup

Each app has a `.env.example` file showing required variables. Copy it to `.env` and fill in your values. Never commit `.env` files.

### DexWorks

```bash
cp apps/dexworks/.env.example apps/dexworks/.env
# Then edit .env with your API key
```

### Event Stream Demo

```bash
cp apps/event-stream-demo/.env.example apps/event-stream-demo/.env
# Then edit .env with your API key
```

### GraphQL Playground

```bash
cp apps/graphql-playground/.env.example apps/graphql-playground/.env
# Then edit .env with your WebSocket URL
```

Get a GoldRush API key at https://goldrush.dev/platform/apikey

## Tech Stack

- **Build tools**: Vite (vanilla JS apps), Next.js (React apps)
- **Languages**: JavaScript (ES modules), TypeScript
- **Package manager**: pnpm (workspaces)
- **Linting**: ESLint 9 (flat config) with Next.js/TypeScript support
- **Formatting**: Prettier with import sorting

## Adding a New Demo App

### Vite (vanilla JS)

1. Create directory: `apps/my-demo/`
2. Initialize with Vite: `cd apps && pnpm create vite my-demo`
3. Ensure `package.json` has `"private": true`
4. Add a `.env` file (not committed) for any required API keys
5. Run `pnpm install` from the monorepo root
6. Update the demo table in `README.md`

### Next.js (React/TypeScript)

1. Create directory: `apps/my-demo/`
2. Initialize with Next.js: `cd apps && pnpm create next-app@latest my-demo`
3. Ensure `package.json` has `"private": true`
4. Add a `.env.local` file (not committed) for any required API keys
5. Run `pnpm install` from the monorepo root
6. Update the demo table in `README.md`

The app automatically inherits root ESLint and Prettier config.

## Important Notes

- Each demo app is standalone with no shared dependencies between apps
- Apps can use vanilla JS, React, Next.js, or TypeScript
- GoldRush API key is required for all demos - get one at https://goldrush.dev/platform/apikey
- Env variables exposed to the browser must be prefixed with `VITE_` (Vite) or `NEXT_PUBLIC_` (Next.js)
- Never commit `.env` files or API keys
