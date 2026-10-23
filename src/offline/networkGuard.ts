import { isLocalRequest } from '../../desktop/url-policy.mjs';

export function installOfflineGuard() {
    const attempts: { api: string; url: string }[] = [];
    (window as any).__offlineAttempts = attempts;
    function reject(api: string, url: string): never {
        attempts.push({ api, url });
        throw new Error(`Offline policy rejected ${api}: ${url}`);
    }
    const fetchOriginal = window.fetch.bind(window);
    window.fetch = (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href);
        if (!isLocalRequest(url.href, location.href)) reject('fetch', url.href);
        return fetchOriginal(input, init);
    };
    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method: string, url: string | URL, ...args: any[]) {
        const resolved = new URL(String(url), location.href);
        if (!isLocalRequest(resolved.href, location.href)) reject('XMLHttpRequest', resolved.href);
        return (open as any).call(this, method, url, ...args);
    } as any;
    for (const api of ['WebSocket', 'EventSource', 'RTCPeerConnection', 'webkitRTCPeerConnection'] as const) {
        if (api in window) (window as any)[api] = class { constructor(url?: string) { reject(api, String(url ?? '')); } };
    }
    navigator.sendBeacon = (url) => reject('sendBeacon', String(url));
    if (navigator.serviceWorker) navigator.serviceWorker.register = async (url) => reject('serviceWorker', String(url));
    addEventListener('securitypolicyviolation', (event) => attempts.push({ api: 'CSP', url: event.blockedURI }));
}
