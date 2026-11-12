# Rush Rider

Ride a physics dirt bike over live crypto price charts. Rush Rider turns OHLCV candles into a track, with token search, chain selection, live market stats and keyboard controls.

This repository retains the full source monorepo, including the other GoldRush demos and shared packages. Rush Rider is in `apps/rushrider`. The original monorepo README is preserved in [docs/UPSTREAM_README.md](docs/UPSTREAM_README.md).

## Quick start

Requirements: Node.js 20 or newer, pnpm 10, and a GoldRush API key.

```bash
pnpm install
cp apps/rushrider/.env.example apps/rushrider/.env
# Set VITE_GOLDRUSH_API_KEY in apps/rushrider/.env
pnpm --filter rushrider dev
```

Use your own API key. Do not commit populated `.env` files. Values prefixed with `VITE_` are included in the browser bundle; use provider-side restrictions and appropriate key permissions for public deployments.

## Commands

```bash
pnpm --filter rushrider test       # terrain and scoring tests
pnpm --filter rushrider build      # TypeScript check and Vite build
pnpm --filter rushrider preview    # preview the production build
pnpm lint                         # monorepo lint
pnpm format:check                 # monorepo formatting check
```

## Controls

| Key | Action |
| --- | --- |
| Right arrow | Move right / roll forward in the air |
| Left arrow | Move left / backflip in the air |
| Space | Hop |
| R | Reset ride |
| Esc | Return |

## Source layout

- `apps/rushrider`: React, TypeScript and Vite app; Matter.js physics, Canvas 2D rendering and GraphQL WebSocket market streams.
- `apps/*`: Other demos retained from the source repository.
- `packages/shared-ui`: Shared UI used by workspace apps.
- `docs`: Existing project specifications and plans, plus setup and provenance notes.

See [development notes](docs/DEVELOPMENT.md), the [app README](apps/rushrider/README.md) and [source provenance](docs/PROVENANCE.md).

## Provenance and credits

This is a fresh-history copy of [dinxsh/rushrider](https://github.com/dinxsh/rushrider), maintained under `kmt219` at the owner's request. A new import commit does not mean that its author wrote every file. Existing source and dependency credits are retained. The source README identifies the broader GoldRush demos project; see the preserved upstream README.

No repository-wide license file was present in the imported snapshot. This copy does not add a new license or grant new rights to third-party code. Dependency licenses continue to apply.
