/**
 * Dev-only ride harness — mounts the game with synthetic candles so the
 * physics, rendering, and HUD can be exercised without an API key or
 * streaming credits. Served by Vite at /test-ride.html in dev; never part
 * of the production build (only index.html is a build input).
 */
import Ride from "../components/Ride";
import "../style.css";
import type { OHLCVCandle, Track } from "../types";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

function syntheticCandles(count: number): OHLCVCandle[] {
    const candles: OHLCVCandle[] = [];
    let price = 100;
    for (let i = 0; i < count; i++) {
        // Deterministic pseudo-random walk with a few violent moves.
        const wave = Math.sin(i * 0.45) * 2.2 + Math.sin(i * 0.13) * 4;
        const spike = i % 17 === 0 ? 7 : i % 11 === 0 ? -5 : 0;
        price = Math.max(20, price + wave + spike);
        candles.push({
            timestamp: new Date(2026, 0, 1, 0, i).toISOString(),
            open: price,
            high: price * 1.01,
            low: price * 0.99,
            close: price,
            volume: 1000,
        });
    }
    return candles;
}

const track: Track = {
    chainGql: "BASE_MAINNET",
    pairAddress: "0xdev",
    tokenAddress: null,
    symbol: "DEV",
    name: "Synthetic Dev Track",
    priceUsd: 100,
    pctChange24h: null,
};

createRoot(document.getElementById("app")!).render(
    <StrictMode>
        <Ride
            track={track}
            timeframe="1H"
            candles={syntheticCandles(60)}
            smooth={true}
            onExit={() => window.location.reload()}
        />
    </StrictMode>
);
