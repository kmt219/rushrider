<div align="center">

# RUSH RIDER

### The chart is the track. Try not to crash.

A browser-based dirt-bike game where crypto price candles become rideable terrain.

**React · TypeScript · Vite · Matter.js · Canvas 2D · GoldRush**

[Get started](#get-started) · [How it works](#how-it-works) · [Controls](#controls) · [Development](#development) · [Credits](#credits-and-license)

</div>

---

## What you can do

- **Ride price action.** Turn streamed OHLCV data into a dirt-bike course.
- **Find your next track.** Browse trending tokens, search for a token and switch chains.
- **Choose a time window.** Ride 15-minute, 1-hour or 1-day market history.
- **Land tricks.** Earn points for distance, flips and airtime. Touch the chart with your helmet and the ride ends.
- **Watch the market move.** GraphQL WebSocket subscriptions feed candle data and market-card updates.

Supported chain selections in the app include Base, BNB Chain, Monad, MegaETH and Tempo. Available tokens and live data depend on the provider and your API key.

## How it works

```text
Token + chain + time window
            |
            v
GoldRush GraphQL WebSocket streams
            |
            v
OHLCV candles -> terrain -> Matter.js physics
                                 |
                                 v
                     Canvas 2D ride + scoring
```

React handles the interface and track selection. Matter.js simulates the bike and collisions, while a custom Canvas 2D renderer draws the ride. The scoring module tracks forward progress, landed flips and airtime bonuses.

## Get started

### 1. Install the prerequisites

- Node.js **20.19+ or 22.12+** for Vite 7 compatibility.
- pnpm **10**. The workspace pins `pnpm@10.4.1`.
- Your own GoldRush API key for live market features.

### 2. Clone and install

```bash
git clone https://github.com/kmt219/rushrider.git
cd rushrider
pnpm install
```

### 3. Configure the app

```bash
cp apps/rushrider/.env.example apps/rushrider/.env
```

Set this value in `apps/rushrider/.env`:

```dotenv
VITE_GOLDRUSH_API_KEY=your_key_here
```

Do not commit a populated `.env` file. `VITE_` variables are bundled into browser assets, so this key must not be treated as a server-only secret. Apply provider-supported key restrictions and appropriate permissions before a public deployment.

### 4. Start riding

```bash
pnpm --filter rushrider dev
```

Open the local URL printed by Vite. Run commands from the repository root so workspace dependencies resolve correctly.

## Controls

| Key | On the track |
| --- | --- |
| Right arrow | Move right / roll forward in the air |
| Left arrow | Move left / backflip in the air |
| Space | Hop |
| R | Reset the ride |
| Esc | Go back |

### Scoring

Forward distance adds points. Each landed flip adds **300**, and landed airtime of at least **0.5 seconds** adds **100 points per second**. A continuous airborne stretch of **2.5 seconds** earns a **500-point Superman bonus**.

## Development

| Task | Command |
| --- | --- |
| Terrain and scoring unit tests | `pnpm --filter rushrider test` |
| TypeScript check and production build | `pnpm --filter rushrider build` |
| Preview the production build | `pnpm --filter rushrider preview` |
| Lint the monorepo | `pnpm lint` |
| Check formatting | `pnpm format:check` |

### Repository map

```text
apps/rushrider/
  src/components/     Track browser, ride view and UI
  src/game/           Physics engine, rendering and scoring
  src/lib/            Market streams, queries and terrain
  src/tracks.ts       Track configuration
packages/shared-ui/   Shared workspace UI
apps/                 Other retained GoldRush demos
docs/                 Setup notes, specifications and provenance
```

This is a full monorepo copy, not an extracted standalone app. Keep the shared packages and workspace files. Other demos are retained but are not part of the Rush Rider game.

### Deployment and current status

The app includes `apps/rushrider/vercel.json` with its monorepo build configuration. See [development and deployment notes](docs/DEVELOPMENT.md) before configuring a deployment.

This repository does not claim a verified production deployment. Dependency installation, tests, build output and live API behavior were **not verified during the import or this documentation update**. The commands above come from the checked-in package scripts.

## Troubleshooting

- **No market data:** check the API key, provider access, selected chain/token and network connection.
- **Workspace dependency errors:** install and run from the root, not only from `apps/rushrider`.
- **Vite rejects the Node version:** use a supported Node release listed above.

## More documentation

- [Rush Rider app README](apps/rushrider/README.md)
- [Development and deployment](docs/DEVELOPMENT.md)
- [Source provenance](docs/PROVENANCE.md)
- [Preserved GoldRush monorepo README](docs/UPSTREAM_README.md)

## Credits and license

Maintained under [kmt219](https://github.com/kmt219). The source snapshot came from [dinxsh/rushrider](https://github.com/dinxsh/rushrider), with fresh repository history and documentation updates. Source and dependency credits are preserved; an import commit is not a claim of original authorship of every file.

The source README identifies the wider GoldRush demos project. No repository-wide license file was present in the imported snapshot, and this copy does not add a license or grant new rights to third-party code. Dependency licenses continue to apply.
