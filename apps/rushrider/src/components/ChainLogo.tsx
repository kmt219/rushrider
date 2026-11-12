/**
 * ChainLogo — chain brand mark for the switcher. Loads the Trustwallet logo
 * when a slug is known; otherwise (and on load error) shows a colored monogram
 * so every chain renders something consistent.
 */
import type { ChainConfig } from "../lib/chains";
import { useState } from "react";

const TW_BASE = "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains";
const FALLBACK_COLORS = ["#00d084", "#3b82f6", "#a855f7", "#f59e0b", "#e74c3c", "#22c55e"];

interface ChainLogoProps {
    chain: ChainConfig;
    size?: number;
}

export default function ChainLogo({ chain, size = 16 }: ChainLogoProps) {
    const [failed, setFailed] = useState(false);

    if (chain.twSlug && !failed) {
        return (
            <img
                className="chain-logo"
                src={`${TW_BASE}/${chain.twSlug}/info/logo.png`}
                width={size}
                height={size}
                alt=""
                loading="lazy"
                onError={() => setFailed(true)}
            />
        );
    }

    const color = FALLBACK_COLORS[chain.gqlName.charCodeAt(0) % FALLBACK_COLORS.length];
    return (
        <span
            className="chain-logo chain-logo-fallback"
            style={{ width: size, height: size, background: color }}
            aria-hidden
        >
            {chain.displayName[0]}
        </span>
    );
}
