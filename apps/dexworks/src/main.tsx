import App from "./App";
import { preWarmSharedClient } from "./hooks/useSharedStreamClient";
import "./style.css";
import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";

const DexCompare = lazy(() => import("./components/DexCompare"));
const LPDashboard = lazy(() => import("./components/lp/LPDashboard"));

const GOLDRUSH_API_KEY = import.meta.env.VITE_GOLDRUSH_API_KEY as string | undefined;
// In dev, route WebSocket through the Vite proxy (ws://localhost/api/ws) to avoid
// Firefox's mixed-content block of wss:// connections from http://localhost.
const GOLDRUSH_STREAM_URL = import.meta.env.DEV
    ? `ws://${window.location.host}/api/ws`
    : (import.meta.env.VITE_GOLDRUSH_STREAM_URL as string) || "wss://streaming.goldrushdata.com/graphql";
const GOLDRUSH_API_URL = (import.meta.env.VITE_GOLDRUSH_API_URL as string) || "https://api.goldrush.dev/graphql";

if (!GOLDRUSH_API_KEY) {
    document.getElementById("app")!.innerHTML = `
        <div class="error-banner">
            <h2>MISSING_API_KEY</h2>
            <p>Set <code>VITE_GOLDRUSH_API_KEY</code> in your <code>.env</code> file.</p>
            <p style="margin-top:8px">Get one at <a href="https://goldrush.dev/platform/apikey" style="color:var(--accent)">goldrush.dev</a></p>
        </div>
    `;
} else {
    preWarmSharedClient(GOLDRUSH_API_KEY, GOLDRUSH_STREAM_URL);
    createRoot(document.getElementById("app")!).render(
        <StrictMode>
            <BrowserRouter>
                <Routes>
                    <Route
                        path="/:chainName/compare"
                        element={
                            <Suspense
                                fallback={<div className="compare-loading-fallback">LOADING COMPARE VIEW...</div>}
                            >
                                <DexCompare
                                    apiKey={GOLDRUSH_API_KEY}
                                    streamUrl={GOLDRUSH_STREAM_URL}
                                    apiUrl={GOLDRUSH_API_URL}
                                />
                            </Suspense>
                        }
                    />
                    <Route
                        path="/:chainName/lp"
                        element={
                            <Suspense fallback={<div className="compare-loading-fallback">LOADING LP ANALYZER…</div>}>
                                <LPDashboard />
                            </Suspense>
                        }
                    />
                    <Route
                        path="/:chainName/:pairAddress"
                        element={
                            <App apiKey={GOLDRUSH_API_KEY} streamUrl={GOLDRUSH_STREAM_URL} apiUrl={GOLDRUSH_API_URL} />
                        }
                    />
                    <Route
                        path="/:chainName"
                        element={
                            <App apiKey={GOLDRUSH_API_KEY} streamUrl={GOLDRUSH_STREAM_URL} apiUrl={GOLDRUSH_API_URL} />
                        }
                    />
                    <Route
                        path="*"
                        element={
                            <App apiKey={GOLDRUSH_API_KEY} streamUrl={GOLDRUSH_STREAM_URL} apiUrl={GOLDRUSH_API_URL} />
                        }
                    />
                </Routes>
            </BrowserRouter>
        </StrictMode>
    );
}
