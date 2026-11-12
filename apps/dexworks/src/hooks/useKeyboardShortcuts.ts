import type { GemTab, GemTimeframe, Pair, TokenSearchResult } from "../types";
import { useEffect } from "react";

const GEM_TABS: GemTab[] = ["new", "momentum", "gainers", "losers", "spikes"];
const TIMEFRAMES: GemTimeframe[] = ["1h", "24h"];

function isInputFocused(): boolean {
    const el = document.activeElement;
    return (
        el?.tagName === "INPUT" ||
        el?.tagName === "SELECT" ||
        el?.tagName === "TEXTAREA" ||
        (el as HTMLElement)?.isContentEditable === true
    );
}

function getPairAddress(item: Pair | TokenSearchResult): string {
    return "pairAddress" in item ? item.pairAddress : item.pair_address;
}

export interface UseKeyboardShortcutsOptions {
    topPairs: Array<Pair | TokenSearchResult>;
    activeGemTab: GemTab;
    setActiveGemTab: (tab: GemTab) => void;
    selectedTimeframe: GemTimeframe;
    setSelectedTimeframe: (tf: GemTimeframe) => void;
    focusedPairIndex: number;
    setFocusedPairIndex: (i: number) => void;
    selectPair: (address: string) => void;
    unwatchPair: (address: string) => void;
    exportPairs: () => void;
    setPaletteOpen: (open: boolean) => void;
    paletteOpen: boolean;
    setShortcutsOpen: (open: boolean) => void;
    shortcutsOpen: boolean;
}

export function useKeyboardShortcuts(opts: UseKeyboardShortcutsOptions) {
    const {
        topPairs,
        activeGemTab: _activeGemTab,
        setActiveGemTab,
        selectedTimeframe,
        setSelectedTimeframe,
        focusedPairIndex,
        setFocusedPairIndex,
        selectPair,
        unwatchPair,
        exportPairs,
        setPaletteOpen,
        paletteOpen,
        setShortcutsOpen,
        shortcutsOpen,
    } = opts;

    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            const key = e.key;
            const isMeta = e.metaKey || e.ctrlKey;

            // Cmd+K / Ctrl+K: open palette (always fires, even in inputs)
            if (key === "k" && isMeta) {
                e.preventDefault();
                setPaletteOpen(true);
                return;
            }

            // While palette is open, delegate all other keys to cmdk
            if (paletteOpen) return;

            // ?: toggle keyboard shortcuts dialog
            if (key === "?" && !isInputFocused()) {
                e.preventDefault();
                setShortcutsOpen(!shortcutsOpen);
                return;
            }

            const inputFocused = isInputFocused();

            // 1–5: switch gem tabs
            if (!inputFocused && key >= "1" && key <= "5") {
                const idx = Number(key) - 1;
                if (idx < GEM_TABS.length) setActiveGemTab(GEM_TABS[idx]!);
                return;
            }

            // [ / ]: cycle timeframe backwards / forwards
            if (!inputFocused && key === "[") {
                const idx = TIMEFRAMES.indexOf(selectedTimeframe);
                setSelectedTimeframe(TIMEFRAMES[(idx - 1 + TIMEFRAMES.length) % TIMEFRAMES.length]!);
                return;
            }
            if (!inputFocused && key === "]") {
                const idx = TIMEFRAMES.indexOf(selectedTimeframe);
                setSelectedTimeframe(TIMEFRAMES[(idx + 1) % TIMEFRAMES.length]!);
                return;
            }

            // Alt+W: unwatch focused pair
            // Use e.code (physical key) so Mac Option+W works even though
            // Option changes e.key to a special character (e.g. "∑" on US layout).
            if (e.altKey && e.code === "KeyW") {
                if (focusedPairIndex >= 0 && focusedPairIndex < topPairs.length) {
                    unwatchPair(getPairAddress(topPairs[focusedPairIndex]!));
                }
                return;
            }

            // Alt+S: export CSV (same e.code fix for Mac Option key)
            if (e.altKey && e.code === "KeyS") {
                exportPairs();
                return;
            }

            // Arrow up/down: navigate watchlist rows
            if (!inputFocused && key === "ArrowUp") {
                e.preventDefault();
                setFocusedPairIndex(Math.max(0, focusedPairIndex - 1));
                return;
            }
            if (!inputFocused && key === "ArrowDown") {
                e.preventDefault();
                setFocusedPairIndex(Math.min(topPairs.length - 1, focusedPairIndex + 1));
                return;
            }

            // Enter: select focused pair
            if (!inputFocused && key === "Enter" && focusedPairIndex >= 0) {
                selectPair(getPairAddress(topPairs[focusedPairIndex]!));
                return;
            }

            // Escape: clear keyboard focus (cmdk handles Escape when palette is open)
            if (key === "Escape") {
                setFocusedPairIndex(-1);
                return;
            }
        }

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [
        topPairs,
        setActiveGemTab,
        selectedTimeframe,
        setSelectedTimeframe,
        focusedPairIndex,
        setFocusedPairIndex,
        selectPair,
        unwatchPair,
        exportPairs,
        setPaletteOpen,
        paletteOpen,
        setShortcutsOpen,
        shortcutsOpen,
    ]);
}
