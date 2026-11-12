import type { HIP3Market } from "../types";
import { formatPrice, formatPercent } from "../utils/format";

interface TapeTickerProps {
    markets: HIP3Market[];
}

export function TapeTicker({ markets }: TapeTickerProps) {
    if (markets.length === 0) return null;

    // Duplicate the list so the scroll loops seamlessly
    const items = [...markets, ...markets];

    return (
        <div className="tape-ticker">
            <div className="tape-ticker-track">
                {items.map((m, i) => {
                    const isUp = m.change24h >= 0;
                    const baseCoin = m.coin.includes(":") ? (m.coin.split(":")[1] ?? m.coin) : m.coin;
                    // Outcome markets: show the human-readable question name, not the #NX coin key
                    const displayCoin =
                        m.marketClass === "hip-4"
                            ? m.name
                            : m.type === "spot"
                              ? baseCoin
                              : `${baseCoin}-${m.quoteToken}`;
                    return (
                        <span key={`${m.coin}-${i}`} className="tape-ticker-item">
                            <span
                                className={`tape-ticker-dot ${isUp ? "tape-ticker-dot--up" : "tape-ticker-dot--down"}`}
                            />
                            <span className="tape-ticker-coin">{displayCoin}</span>
                            <span className="tape-ticker-price">{formatPrice(m.markPx)}</span>
                            <span className={`tape-ticker-change ${isUp ? "val-positive" : "val-negative"}`}>
                                {formatPercent(m.change24h)}
                            </span>
                        </span>
                    );
                })}
            </div>
        </div>
    );
}
