import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [react()],
    server: { port: 5174 },
    build: {
        target: "ES2020",
        sourcemap: false,
        rollupOptions: {
            output: {
                manualChunks: (id: string) => {
                    if (id.includes("cmdk")) return "cmdk";
                    if (id.includes("DetailView")) return "detail-view";
                    if (id.includes("SectorHeatmap")) return "heatmap";
                    if (id.includes("LiveTV")) return "live-tv";
                    if (id.includes("node_modules")) return "vendor";
                },
            },
        },
    },
});
