/**
 * PriceDisplay — renders a USD price value with proper HTML subscript notation
 * for repeated leading zeros (e.g. 0.0000006874 → $0.0<sub>6</sub>874).
 *
 * Falls back to plain formatUSD string for values that don't need compression.
 */
import { formatUSD } from "../utils";

interface PriceDisplayProps {
    value: number | null | undefined;
    /** When true, shows "—" for null/zero instead of "$0" */
    dash?: boolean;
}

export function PriceDisplay({ value, dash = true }: PriceDisplayProps) {
    if (value == null || isNaN(value) || !isFinite(value)) {
        return <>{dash ? "—" : "$0"}</>;
    }
    if (value <= 0) return <>{dash ? "—" : "$0"}</>;

    const abs = value; // value is already positive (guarded above)

    // Values >= 0.01 don't need compression — use standard formatter
    if (abs >= 0.01) return <>{formatUSD(value)}</>;

    // Count leading zeros after the decimal point
    const exp = Math.floor(Math.log10(abs));
    const leadingZeros = -exp - 1;

    // Fewer than 3 leading zeros — show as fixed decimal, no compression needed
    if (leadingZeros < 3) return <>{formatUSD(value)}</>;

    // Compute significant digits
    const mantissa = abs / Math.pow(10, exp);
    const sigDigits = parseFloat(mantissa.toPrecision(4)).toString().replace(".", "");

    return (
        <>
            $0.0<sub className="price-sub">{leadingZeros}</sub>
            {sigDigits}
        </>
    );
}
