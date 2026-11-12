const BASE_URL = "https://dex.goldrush.dev";

function setMeta(selector: string, attr: string, value: string) {
    const el = document.querySelector<HTMLMetaElement>(selector);
    if (el) el.setAttribute(attr, value);
}

function setCanonical(url: string) {
    const link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (link) link.setAttribute("href", url);
    setMeta('meta[property="og:url"]', "content", url);
}

function upsertJsonLd(schema: object) {
    const id = "ld-json-page";
    let el = document.getElementById(id) as HTMLScriptElement | null;
    if (!el) {
        el = document.createElement("script");
        el.type = "application/ld+json";
        el.id = id;
        document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(schema);
}

/** Update document.title, all OG/Twitter meta tags, canonical URL, and optional JSON-LD. */
export function setPageMeta(title: string, description: string, opts?: { path?: string; jsonLd?: object }): void {
    const url = opts?.path
        ? `${BASE_URL}${opts.path}`
        : `${BASE_URL}${window.location.pathname}${window.location.search}`;
    document.title = title;
    setMeta('meta[name="description"]', "content", description);
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[name="twitter:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[name="twitter:description"]', "content", description);
    setCanonical(url);
    if (opts?.jsonLd) upsertJsonLd(opts.jsonLd);
}

/** Remove per-route JSON-LD and reset canonical/og:url to root. Call in useEffect cleanup. */
export function resetPageMeta(): void {
    document.getElementById("ld-json-page")?.remove();
    setCanonical(BASE_URL);
}
