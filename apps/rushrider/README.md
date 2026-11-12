# RUSH RIDER

Ride a physics dirt bike across live crypto charts. Pick a token, pick a timeframe, try not to crash.

Every track is real OHLCV data pulled live from the **GoldRush Streaming API** — the price line becomes the terrain. Switch between Base, BNB Chain, Monad, MegaETH, and Tempo.

## How it works

- **Trending tracks** — curated headliner tokens per chain, resolved live via the `searchToken` streaming query (no hardcoded pair addresses), with sparkline previews and a volatility-derived difficulty badge.
- **Search** — ride any token the `searchToken` query can find.
- **Terrain** — `ohlcvCandlesForPair` / `ohlcvCandlesForToken` subscriptions. The 15M / 1H / 1D pills map to the supported interval/timeframe combos (`1m/15m`, `1m/1h`, `1h/1d`).
- **Live card stats** — `updatePairs` / `updateTokens` subscriptions.
- **Physics** — [matter-js](https://brm.io/matter-js/) bodies under a custom retro Canvas 2D renderer.

## Controls

| Key   | Action                         |
| ----- | ------------------------------ |
| →     | go right (roll forward in air) |
| ←     | go left (backflip in air)      |
| Space | small hop                      |
| R     | reset ride                     |
| Esc   | back                           |

Score = distance + tricks (flips +300, airtime, 2.5s+ air = Superman! +500). Crash = helmet touches the chart.

## Setup

```bash
cp apps/rushrider/.env.example apps/rushrider/.env
# set VITE_GOLDRUSH_API_KEY — get one at https://goldrush.dev/platform/apikey
pnpm install
pnpm --filter rushrider dev
```

## Tests

```bash
pnpm --filter rushrider test   # vitest — terrain + scoring unit tests
```
