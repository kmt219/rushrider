import { App } from "./App";
import { GoldRushProvider } from "./context/GoldRushContext";
import { NodeStreamProvider } from "./context/NodeStreamContext";
import "./style.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("app")!).render(
    <StrictMode>
        <NodeStreamProvider>
            <GoldRushProvider>
                <App />
            </GoldRushProvider>
        </NodeStreamProvider>
    </StrictMode>
);
