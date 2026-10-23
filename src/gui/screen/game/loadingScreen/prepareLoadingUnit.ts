import { uiArt, type UiArtStore } from '@/gui/hd/UiArt';
import { getLoadingArtId } from './loadingArtwork';

// Hold one decoded country image until the loading screen releases its lease.
// Optional artwork must not stall a match or appear late after a fallback.
export function prepareLoadingUnit(country: string, store: UiArtStore = uiArt, timeoutMs = 500) {
    const id = getLoadingArtId(country);
    if (!id || !store.enabled) return { ready: Promise.resolve(false), dispose() {} };
    let complete = false, release = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    let resolveReady!: (ready: boolean) => void;
    const ready = new Promise<boolean>(resolve => { resolveReady = resolve; });
    const finish = (available: boolean) => {
        if (complete) return;
        complete = true; clearTimeout(timer); resolveReady(available);
        if (!available) release();
    };
    release = store.acquire(id, asset => finish(!!asset));
    if (!complete) timer = setTimeout(() => finish(false), timeoutMs);
    return { ready, dispose() { if (complete) release(); else finish(false); } };
}
