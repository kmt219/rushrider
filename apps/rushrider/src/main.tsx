import App from "./App";
import "./style.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const GOLDRUSH_API_KEY = import.meta.env.VITE_GOLDRUSH_API_KEY as string | undefined;
// In dev, route the WebSocket through the Vite proxy (ws://localhost/api/ws) to
// avoid Firefox's mixed-content block of wss:// connections from http://localhost.
const GOLDRUSH_STREAM_URL = import.meta.env.DEV
    ? `ws://${window.location.host}/api/ws`
    : (import.meta.env.VITE_GOLDRUSH_STREAM_URL as string | undefined) || "wss://streaming.goldrushdata.com/graphql";

if (!GOLDRUSH_API_KEY) {
    document.getElementById("app")!.innerHTML = `
        <div class="error-banner">
            <h2>MISSING_API_KEY</h2>
            <p>Set <code>VITE_GOLDRUSH_API_KEY</code> in your <code>.env</code> file (see <code>.env.example</code>).</p>
            <p style="margin-top:8px">Get one at <a href="https://goldrush.dev/platform/apikey">goldrush.dev</a></p>
        </div>
    `;
} else {
    createRoot(document.getElementById("app")!).render(
        <StrictMode>
            <App apiKey={GOLDRUSH_API_KEY} streamUrl={GOLDRUSH_STREAM_URL} />
        </StrictMode>
    );
}
