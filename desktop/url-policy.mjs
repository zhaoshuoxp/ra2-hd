export function isGameURL(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'ra2:' && url.hostname === 'game' && !url.port && !url.username && !url.password;
    } catch { return false; }
}

export function isLocalRequest(value, base) {
    try {
        const url = new URL(value, base);
        const page = new URL(base);
        if (url.protocol === 'blob:') return isLocalRequest(new URL(url.pathname).href, base);
        if (isGameURL(page.href)) return isGameURL(url.href);
        return ['http:', 'https:'].includes(page.protocol) && page.origin !== 'null' && url.origin === page.origin;
    } catch { return false; }
}
