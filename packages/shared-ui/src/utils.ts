// Subscript digit mapping for compressed zero notation
const SUBSCRIPT_MAP: Record<string, string> = {
    "0": "₀",
    "1": "₁",
    "2": "₂",
    "3": "₃",
    "4": "₄",
    "5": "₅",
    "6": "₆",
    "7": "₇",
    "8": "₈",
    "9": "₉",
};

export function compressRepeatedZeros(value: number, sigFigs: number = 4, minZerosToCompress: number = 3): string {
    if (value === 0 || !isFinite(value)) return "0";

    const isNegative = value < 0;
    const absValue = Math.abs(value);

    if (absValue >= 0.01) return absValue.toFixed(4);

    // Use log10 to count leading zeros — avoids JS scientific notation in toString()
    const exponent = Math.floor(Math.log10(absValue));
    const leadingZeros = -exponent - 1;

    if (leadingZeros < minZerosToCompress) return absValue.toFixed(Math.max(4, leadingZeros + 2));

    const mantissa = absValue / Math.pow(10, exponent);
    const significantDigits = parseFloat(mantissa.toPrecision(sigFigs)).toString().replace(".", "");
    const subscript = Array.from(leadingZeros.toString())
        .map((d) => SUBSCRIPT_MAP[d] || d)
        .join("");

    const result = `0.0${subscript}${significantDigits}`;
    return isNegative ? `-${result}` : result;
}

export function formatPrice(value: number): string {
    if (value >= 1) return value.toFixed(2);
    return value.toPrecision(4);
}

export async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        console.error("Failed to copy to clipboard:", err);
        return false;
    }
}
