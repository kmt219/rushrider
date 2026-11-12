# LP Analyzer — Setup Guide

GoldRush Pipeline API pushes decoded Uniswap V3 events to your Neon Postgres. Edge Functions query the DB.

## Prerequisites

- GoldRush API key: https://goldrush.dev/platform/apikey
- Neon Postgres project: https://neon.tech (free tier works for demo)
- Vercel CLI: `pnpm add -g vercel`

## Phase 0: Infrastructure (one-time, manual)

1. **Provision Neon** — create project `uniswap-lp-dashboard`, copy the connection string
2. **Deploy Pipeline 1** (Uniswap V3 Pool events for WETH/USDC pool) on GoldRush Platform
3. **Deploy Pipeline 2** (NonfungiblePositionManager events) on GoldRush Platform
4. **Create indexes** — run the SQL in the main plan file (Task 0.4)
5. Verify after ~5 min: `SELECT COUNT(*) FROM base_evt_swap;` should return > 0

See the full implementation plan at `docs/superpowers/plans/` for exact YAML configs.

## Local Dev

### With real data (requires Phase 0 complete):

```bash
echo "POSTGRES_URL=postgresql://..." >> apps/dexworks/.env
vercel dev   # NOT pnpm dev — Edge Functions need Vercel runtime
```

Navigate to http://localhost:3000/base/lp

### Without real data (frontend-only):

```bash
echo "VITE_LP_MOCK=true" >> apps/dexworks/.env
pnpm --filter dexworks dev
```

Navigate to http://localhost:5173/base/lp — uses fixture data from `api/lp/_fixtures.ts`

## Adding More Pools

1. Add the pool address + token metadata to `KNOWN_POOLS` in `api/lp/_db.ts`
2. Add the pool address to Pipeline 1's `contract_addresses` list on GoldRush Platform
3. Wait for backfill (~minutes for recent data, hours for full history)
