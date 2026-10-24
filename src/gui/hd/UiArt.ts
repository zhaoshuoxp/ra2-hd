import * as THREE from 'three';
import resultBanners from './resultBannerSources.json';
export interface UiArtEntry { id: string; file: string; sha256: string; width: number; height: number; logicalWidth: number; logicalHeight: number; overlay?: string }
export interface UiMenuVideo { file: string; sha256: string; width: number; height: number }
export interface UiArtManifest { schemaVersion: 1; revision: string; assets: UiArtEntry[]; menuVideo?: { original: UiMenuVideo; hd: UiMenuVideo } }
export const UI_TEXTURE_BUDGET = 16 * 1024 * 1024;
export const UI_RESULT_BANNER_BYTES = Math.min(...resultBanners.assets.map(asset => asset.width * asset.height * 4));
export function validateUiManifest(value: any): UiArtManifest {
    if (value?.schemaVersion !== 1 || !/^[\w-]{1,64}$/.test(value.revision) || !Array.isArray(value.assets) || value.assets.length > 512) throw Error('Invalid UI manifest');
    const ids = new Set<string>();
    for (const a of value.assets) {
        if (!/^[a-z0-9_.-]{1,80}$/.test(a.id) || ids.has(a.id) || !/^[\w-]+\.png$/.test(a.file)
            || !/^[a-f0-9]{64}$/.test(a.sha256)
            || ![a.width, a.height, a.logicalWidth, a.logicalHeight].every(n => Number.isInteger(n) && n > 0 && n <= 4096)
            || a.width * a.height * 4 > UI_TEXTURE_BUDGET) throw Error('Invalid UI asset');
        ids.add(a.id);
    }
    for (const a of value.assets) {
        if (a.overlay === undefined) continue;
        const overlay = value.assets.find(b => b.id === a.overlay);
        if (!overlay || overlay === a || overlay.overlay !== undefined
            || a.logicalWidth !== 60 || a.logicalHeight !== 48
            || ['width', 'height', 'logicalWidth', 'logicalHeight'].some(key => a[key] !== overlay[key])) {
            throw Error('Invalid UI cameo overlay');
        }
    }
    if (value.menuVideo) for (const key of ['original', 'hd']) {
        const v = value.menuVideo[key];
        if (!v || !/^[\w-]+\.webm$/.test(v.file) || !/^[a-f0-9]{64}$/.test(v.sha256)
            || ![v.width, v.height].every(n => Number.isInteger(n) && n > 0 && n <= 4096)
            || v.width * 570 !== v.height * 632) throw Error('Invalid menu video');
    }
    return value;
}
type Loaded = { bitmap: ImageBitmap; texture: THREE.Texture; bytes: number; url?: string };
type Slot = { refs: number; promise: Promise<Loaded | undefined>; loaded?: Loaded };
type SurfaceKind = 'transition' | 'dom' | 'result';
export interface UiCameoSource { id: string; width: number; height: number; sequence?: string; transitionBase?: number; atlas?: { width: number; height: number; x: number; y: number } }
export class UiArtStore {
    readonly frames = new WeakMap<object, UiCameoSource[]>();
    private manifest?: UiArtManifest;
    private slots = new Map<string, Slot>();
    private listeners = new Set<() => void>();
    private readEnabled = () => false;
    private generation = 0;
    private reserved = 0;
    private resultUsers = 0;
    private surfaces = new Map<object, { gpu: number; cpu: number; kind: SurfaceKind }>();
    protectResultBanner(): () => void {
        this.resultUsers++;
        let live = true;
        return () => { if (live) { live = false; this.resultUsers--; } };
    }
    private resultHeadroom(): number {
        if (!this.resultUsers) return 0;
        const allocated = [...this.surfaces.values()].reduce((sum, surface) =>
            sum + (surface.kind === 'result' ? surface.gpu : 0), 0);
        return Math.max(0, UI_RESULT_BANNER_BYTES - allocated);
    }
    reserveSurface(owner: object, gpu: number, cpu: number, kind: SurfaceKind = 'transition'): boolean {
        if (this.surfaces.has(owner)) return true;
        const limit = UI_TEXTURE_BUDGET - (kind === 'result' ? 0 : this.resultHeadroom());
        if (this.reserved + gpu > limit) return false;
        this.surfaces.set(owner, { gpu, cpu, kind }); this.reserved += gpu; return true;
    }
    releaseSurface(owner: object): void {
        const surface = this.surfaces.get(owner);
        if (surface) { this.reserved -= surface.gpu; this.surfaces.delete(owner); }
    }
    private pending?: Promise<void>;
    configure(readEnabled: () => boolean): void {
        this.readEnabled = readEnabled;
        // Startup never waits for decorative artwork or its decode.
        this.pending = this.loadManifest();
    }
    private async loadManifest(): Promise<void> {
        const generation = this.generation;
        try {
            const response = await fetch('/local-ui/selection.json');
            if (!response.ok) return;
            const manifest = validateUiManifest(await response.json());
            if (generation !== this.generation) return;
            this.manifest = manifest;
            this.changed();
        } catch { /* Optional pack: retain Original. */ }
    }
    get enabled(): boolean { return this.readEnabled() && !!this.manifest; }
    get revision(): string | undefined { return this.manifest?.revision; }
    source(id: string): (UiArtEntry & { url: string }) | undefined {
        const entry = this.manifest?.assets.find(asset => asset.id === id);
        return entry && this.enabled ? { ...entry, url: `/local-ui/${this.manifest!.revision}/${entry.file}` } : undefined;
    }
    menuVideoSource(original = false): string | undefined {
        const video = this.manifest?.menuVideo?.[!original && this.enabled ? 'hd' : 'original'];
        return video ? `/local-ui/${this.manifest!.revision}/${video.file}` : undefined;
    }
    changed = (): void => {
        document.getElementById('ra2web-root')?.toggleAttribute('data-ui-hd', this.enabled);
        this.listeners.forEach(fn => fn());
    };
    subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    has(id: string, width?: number, height?: number): boolean {
        return !!this.manifest?.assets.some(a => a.id === id
            && (width === undefined || a.logicalWidth === width) && (height === undefined || a.logicalHeight === height));
    }
    overlayId(id: string): string | undefined {
        return this.manifest?.assets.find(a => a.id === id)?.overlay;
    }
    private slotKey(entry: UiArtEntry): string {
        return `${this.revision}/${entry.file}/${entry.sha256}/${entry.width}x${entry.height}`;
    }
    canAcquire(ids: string[]): boolean {
        if (!this.enabled) return true;
        const additional = new Map<string, number>();
        for (const id of ids) {
            const entry = this.manifest?.assets.find(a => a.id === id);
            if (!entry) continue;
            const key = this.slotKey(entry);
            if (!this.slots.has(key)) additional.set(key, entry.width * entry.height * 4);
        }
        return this.reserved + [...additional.values()].reduce((sum, bytes) => sum + bytes, 0)
            <= UI_TEXTURE_BUDGET - this.resultHeadroom();
    }
    acquire(id: string, ready: (asset?: Loaded) => void, immediateIfLoaded = false): () => void {
        const entry = this.manifest?.assets.find(a => a.id === id);
        if (!this.enabled || !entry) { ready(); return () => {}; }
        // Different cameo IDs can share a base image; rank marks are separate textures.
        const key = this.slotKey(entry);
        let slot = this.slots.get(key);
        if (!slot) {
            const bytes = entry.width * entry.height * 4;
            if (this.reserved + bytes > UI_TEXTURE_BUDGET - this.resultHeadroom()) { ready(); return () => {}; }
            this.reserved += bytes;
            slot = { refs: 0, promise: Promise.resolve(undefined) };
            const created = slot;
            slot.promise = this.decode(entry).then(loaded => {
                if (created.refs === 0) { this.releaseLoaded(loaded); return; }
                created.loaded = loaded; return loaded;
            });
            this.slots.set(key, slot);
        }
        slot.refs++;
        let live = true;
        if (immediateIfLoaded && slot.loaded) ready(slot.loaded);
        else slot.promise.then(asset => { if (live) ready(asset); });
        return () => {
            if (!live) return;
            live = false;
            if (--slot!.refs === 0) {
                this.releaseLoaded(slot!.loaded);
                this.reserved -= entry.width * entry.height * 4;
                this.slots.delete(key);
            }
        };
    }
    private releaseLoaded(loaded?: Loaded): void {
        loaded?.texture.dispose(); loaded?.bitmap.close();
        if (loaded?.url) URL.revokeObjectURL(loaded.url);
    }
    private async decode(entry: UiArtEntry): Promise<Loaded | undefined> {
        let bitmap: ImageBitmap | undefined;
        try {
            const response = await fetch(`/local-ui/${this.manifest!.revision}/${entry.file}`);
            if (!response.ok) return;
            const bytes = await response.arrayBuffer();
            if (bytes.byteLength > UI_TEXTURE_BUDGET) return;
            const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
            if (digest !== entry.sha256) return;
            const blob = new Blob([bytes], { type: 'image/png' });
            bitmap = await createImageBitmap(blob);
            if (bitmap.width !== entry.width || bitmap.height !== entry.height) { bitmap.close(); return; }
            const texture = new THREE.Texture(bitmap);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
            texture.generateMipmaps = false; texture.needsUpdate = true;
            return { bitmap, texture, bytes: entry.width * entry.height * 4, url: URL.createObjectURL(blob) };
        } catch { bitmap?.close(); return; }
    }
    metrics() {
        return { revision: this.revision, enabled: this.enabled, reservedBytes: this.reserved,
            resultHeadroomBytes: this.resultHeadroom(),
            decodedCpuBytes: [...this.slots.values()].reduce((n,s) => n + (s.loaded?.bytes ?? 0), 0),
            gpuTextureBytesUpperBound: [...this.slots.values()].reduce((n,s) => n + (s.loaded?.bytes ?? 0), 0),
            transitionGpuBytes: [...this.surfaces.values()].reduce((n,s) => n + (s.kind === 'transition' ? s.gpu : 0), 0),
            transitionCpuCanvasBytes: [...this.surfaces.values()].reduce((n,s) => n + (s.kind === 'transition' ? s.cpu : 0), 0),
            domImageGpuBytesUpperBound: [...this.surfaces.values()].reduce((n,s) => n + (s.kind !== 'transition' ? s.gpu : 0), 0),
            domImageDecodedCpuBytesUpperBound: [...this.surfaces.values()].reduce((n,s) => n + (s.kind !== 'transition' ? s.cpu : 0), 0),
            textures: [...this.slots.values()].filter(s => s.loaded).length, budget: UI_TEXTURE_BUDGET,
            domCanvasBytes: [...document.querySelectorAll<HTMLCanvasElement>('canvas[data-ui-art],canvas[data-loading-backdrop],canvas[data-native-ui-backdrop]')]
                .reduce((n,c) => n + (c.hidden ? 0 : c.width * c.height * 4), 0), mipmaps: false };
    }
    dispose(): void {
        this.generation++;
        this.manifest = undefined;
        this.changed();
        this.listeners.clear();
    }
}
export const uiArt = new UiArtStore();
