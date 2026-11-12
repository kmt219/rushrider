# RUSH RIDER — Design Spec

**Date:** 2026-06-11
**App:** `apps/rushrider` (new standalone Vite + React 19 + TypeScript app)
**Inspiration:** StonkRider (stonkrider.com) — ride a physics dirt bike across a price chart.
**Twist:** tracks are live crypto OHLCV charts from the GoldRush Streaming API, with chain switching.

## Goals

- Replicate the StonkRider experience (landing → track detail → ride) on GoldRush data.
- Streaming API only — no deprecated REST endpoints (`xy=k/pools` is out).
- Retro GoldRush dark theme (shared-ui tokens, JetBrains Mono, brutalist accents) — StonkRider's layout, GoldRush's skin.
- Chain switching across the five chains supported by the streaming API.

## Screens (app-level state machine, no router)

1. **Landing** — hero ("Ride any chart."), localStorage stat counters (rides completed, virtual $ ridden, crashes), chain switcher (Base / BNB Chain / Monad / MegaETH / Tempo), token search, trending track cards (sparkline + difficulty badge + 24h %).
2. **Track detail** — ticker, name, % change, difficulty badge, timeframe pills **15M / 1H / 1D**, chart preview with START marker, stat tiles (POINTS / VOLATILITY / MAX SLOPE / PERIOD), Smooth toggle, "Ride this chart" CTA.
3. **Ride** — fullscreen canvas game. HUD: ticker·timeframe + pts + air (top-left), timer (top-center), minimap (top-right), key hints + mute (bottom-right). Crash and finish overlays; R retry, Esc back.

## Data layer (streaming only)

| Need | Source |
|---|---|
| Terrain candles | `ohlcvCandlesForPair` subscription (`ohlcvCandlesForToken` on Tempo); snapshot then unsubscribe |
| Timeframe pills | 15M → `ONE_MINUTE/FIFTEEN_MINUTES`, 1H → `ONE_MINUTE/ONE_HOUR`, 1D → `ONE_HOUR/ONE_DAY` |
| Trending cards | Curated ticker list per chain, resolved via `searchToken` GraphQL query at load (no hardcoded pair addresses) |
| Live card stats | `updatePairs` subscription (`updateTokens` on Tempo) over resolved pairs |
| Search | `searchToken` query (parameterized variables, injection-safe) |

- WS client: copy of dexworks `createHardenedClient` (graphql-ws, exponential backoff).
- Env: `VITE_GOLDRUSH_API_KEY` (required), `VITE_GOLDRUSH_STREAM_URL`, `VITE_GOLDRUSH_API_URL`. Dev WS goes through the Vite `/api/ws` proxy (Firefox mixed-content fix, same as dexworks).
- No-data handling: if the selected combo returns nothing in the timeout, fall back through remaining combos; if all fail show "NO TRACK DATA".

## Game

- **Terrain** (`src/lib/terrain.ts`, pure): close prices → polyline. Fixed x-spacing per candle; y normalized into an elevation band sized to viewport. Optional Catmull-Rom smoothing. Flat runway prepended, finish flag at the end. Difficulty = f(stddev of per-candle returns, max segment slope) → EASY / MEDIUM / HARD / INSANE.
- **Physics** (`src/game/engine.ts`): matter-js. Static terrain edge bodies; bike = 2 wheels + chassis + head sensor. ↑ gas (wheel torque), ↓ brake, ←/→ lean, Space jump, R reset. Crash = head contact with terrain.
- **Scoring** (`src/game/scoring.ts`, pure): distance points, airtime bonus, flip detection from accumulated rotation; floating callouts (Backflip! +300, Superman! +500 for long air).
- **Rendering** (`src/game/render.ts`): Canvas 2D — glowing terrain line (gain green / loss red), wireframe wheels + stick rider, grid + scanline retro overlay. Matter.js never renders.
- **Audio** (`src/game/audio.ts`): WebAudio synth (engine hum tied to speed, crash blip), mute toggle, no assets.
- **Stats persistence**: localStorage counters incremented on finish/crash; "virtual $" = sum of |price change| over distance ridden.

## Theme

`@goldrush-demos/shared-ui/tokens.css` variables (`--bg #1a1a1a`, `--accent #00d084`, `--gain`, `--loss`, `--font-mono`), uppercase mono labels, hard shadows (`--shadow`), scanline/CRT accents.

## Errors & testing

- WS failures: hardened client backoff; missing API key → setup banner.
- Vitest unit tests for `terrain.ts` (normalization, smoothing, difficulty) and `scoring.ts` (flips, airtime). Game feel verified manually. CI: `pnpm lint` + `pnpm format:check` must pass.

## Out of scope (YAGNI)

- Live-extending tracks (option B — deferred), leaderboards/backends, share cards, mobile touch controls (keyboard-first; viewport note shown on small screens).
