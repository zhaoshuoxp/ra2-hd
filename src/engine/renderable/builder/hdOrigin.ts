// Trust only the registered desktop host or the existing local diagnostic origin.
export function isDesktopHdOrigin(href: string): boolean {
    const url = new URL(href);
    return url.protocol === 'ra2:' && url.hostname === 'game' && !url.port && !url.username && !url.password;
}
export function isLocalHdOrigin(href: string): boolean {
    const url = new URL(href);
    return isDesktopHdOrigin(href) || (['http:', 'https:'].includes(url.protocol)
        && ['127.0.0.1', 'localhost'].includes(url.hostname) && !url.username && !url.password);
}
export function requestedHdDensity(enabled: boolean, parameter: string, href: string, density: 2 | 4 = 4): number | undefined {
    if (!isLocalHdOrigin(href)) return;
    // Historical diagnostic launchers retain their explicit density controls.
    const requested = !isDesktopHdOrigin(href) && new URL(href).searchParams.get(parameter);
    return requested === '2' || requested === '4' ? Number(requested) : enabled ? density : undefined;
}
