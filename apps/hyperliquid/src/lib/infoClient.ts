import { GOLDRUSH_INFO_TYPES, GOLDRUSH_INFO_URL, HL_INFO_URL } from "../constants";

const GOLDRUSH_API_KEY = import.meta.env.VITE_GOLDRUSH_API_KEY as string | undefined;

interface InfoBody {
    type: string;
    [key: string]: unknown;
}

async function post<T>(url: string, body: InfoBody, apiKey?: string): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Info API ${res.status} for ${body.type}`);
    return res.json() as Promise<T>;
}

/**
 * POST to the Hyperliquid /info API.
 *
 * Types GoldRush serves natively (GOLDRUSH_INFO_TYPES) go to the GoldRush host with
 * Bearer auth — no rate limits, faster reads, and a separate host so they don't
 * compete with public-HL calls for the browser's per-host connection budget. The
 * wire shape is identical, so on any GoldRush-side error we transparently fall back
 * to the public Hyperliquid host and the screener never breaks. Every other type
 * goes straight to public Hyperliquid.
 */
export async function infoPost<T>(body: InfoBody): Promise<T> {
    const canGoldRush = Boolean(GOLDRUSH_API_KEY) && GOLDRUSH_INFO_TYPES.has(body.type);
    if (canGoldRush) {
        try {
            return await post<T>(GOLDRUSH_INFO_URL, body, GOLDRUSH_API_KEY);
        } catch {
            // GoldRush hiccup (network, 5xx, transient) — fall through to public HL.
            // Same request body, same response shape.
        }
    }
    return post<T>(HL_INFO_URL, body);
}
