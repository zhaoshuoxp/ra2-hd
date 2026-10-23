import { uiArt } from './UiArt';
const SOURCES = [
    { id: 'icons24.pcx', variable: '--res-icons-24',
        selector: 'input[type="range"], .select, .icon-button, .lobby-form, .storage-explorer, .prompt-box, .chat',
        width: 288, height: 24 },
    { id: 'menu-mnbttn', variable: '--res-mnbttn', selector: '.dialog-button', width: 378, height: 25 },
    ...['cue-i', 'cce-i', 'cce-il', 'cce-ir'].map(name => ({
        id: name.replaceAll('-', '_') + '.pcx', variable: '--res-' + name,
        selector: 'input[type="checkbox"]', width: 18, height: 18,
    })),
];
// CSS sprites retain native background sizes and lease only while their controls exist.
export class UiCssArt {
    private leases = new Map<string, { revision?: string; release: () => void }>();
    private observer: MutationObserver;
    private unsubscribe: () => void;
    constructor(private root: HTMLElement) {
        this.unsubscribe = uiArt.subscribe(this.refresh);
        this.observer = new MutationObserver(this.refresh);
        this.observer.observe(root, { childList: true, subtree: true });
        this.refresh();
    }
    private refresh = (): void => {
        for (const source of SOURCES) {
            const wanted = uiArt.enabled && uiArt.has(source.id, source.width, source.height)
                && !!this.root.querySelector(source.selector);
            const lease = this.leases.get(source.id);
            if (lease && (!wanted || lease.revision !== uiArt.revision)) {
                lease.release(); this.leases.delete(source.id);
            }
            if (!wanted || this.leases.has(source.id)) continue;
            const original = this.root.style.getPropertyValue(source.variable), owner = {};
            const release = uiArt.acquire(source.id, asset => {
                if (asset?.url && uiArt.reserveSurface(owner, asset.bytes, asset.bytes, 'dom'))
                    this.root.style.setProperty(source.variable, `url("${asset.url}")`);
            });
            this.leases.set(source.id, { revision: uiArt.revision, release: () => {
                this.root.style.setProperty(source.variable, original);
                release(); uiArt.releaseSurface(owner);
            } });
        }
    };
    dispose(): void {
        this.observer.disconnect(); this.unsubscribe();
        this.leases.forEach(lease => lease.release()); this.leases.clear();
    }
}
