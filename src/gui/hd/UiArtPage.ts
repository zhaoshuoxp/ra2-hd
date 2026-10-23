import { uiArt, type UiArtStore, type UiCameoSource } from './UiArt';

type Page = { ready: boolean; listeners: Set<() => void>; releases: (() => void)[]; timer?: ReturnType<typeof setTimeout> };
// Retain at most three visited visible pages, charged to the existing UI budget.
// Cold preparation keeps the previously published cards coherent for at most 750 ms.
export class UiArtPage {
    private pages = new Map<string, Page>();
    private selection?: string;
    constructor(private store: UiArtStore = uiArt, private timeout = 750) {}
    prepare(frames: UiCameoSource[], publish: () => void, releaseDisplayed?: () => void): () => void {
        const selection = `${this.store.enabled}/${this.store.revision}`;
        if (selection !== this.selection) { this.dispose(); this.selection = selection; }
        const entries = this.store.enabled ? frames.filter(frame => frame &&
            this.store.has(frame.id, frame.atlas?.width ?? frame.width, frame.atlas?.height ?? frame.height)) : [];
        const ids = [...new Set(entries.flatMap(frame => [frame.id, this.store.overlayId(frame.id)].filter(Boolean) as string[]))];
        const key = `${selection}/${ids.join(',')}`;
        let page = this.pages.get(key);
        if (page) {
            this.pages.delete(key); this.pages.set(key, page);
        } else {
            // Evict idle preparation leases before allocating the next page.
            // Displayed sprites keep their live leases when capacity allows.
            while (this.pages.size && (this.pages.size >= 3 || !this.store.canAcquire(ids)))
                this.remove(this.pages.keys().next().value!);
            // Old displayed sprites may still hold the evicted page. Release them
            // only when both pages cannot coexist within the fixed UI budget.
            if (!this.store.canAcquire(ids)) releaseDisplayed?.();
            page = { ready: false, listeners: new Set(), releases: [] };
            this.pages.set(key, page);
            const current = page;
            let remaining = ids.length;
            const finish = () => {
                if (current.ready) return;
                current.ready = true; clearTimeout(current.timer);
                for (const listener of current.listeners) listener();
                current.listeners.clear();
            };
            for (const id of ids) current.releases.push(this.store.acquire(id, () => { if (--remaining === 0) finish(); }, true));
            if (!remaining) finish();
            else current.timer = setTimeout(finish, this.timeout);
        }
        if (page.ready) { publish(); return () => {}; }
        page.listeners.add(publish);
        const pending = page;
        return () => {
            pending.listeners.delete(publish);
            // Superseded cold pages do not retain pending leases or callbacks.
            if (!pending.ready && !pending.listeners.size) this.remove(key);
        };
    }
    private remove(key: string): void {
        const page = this.pages.get(key);
        if (!page) return;
        clearTimeout(page.timer); page.listeners.clear();
        page.releases.forEach(release => release()); this.pages.delete(key);
    }
    dispose(): void { for (const key of this.pages.keys()) this.remove(key); }
}
