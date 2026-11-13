import { expect, test } from 'bun:test';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { loadCampaignInterfaceHd } from '../../src/gui/campaign/CampaignInterfaceHd';
import { uiArt, UI_TEXTURE_BUDGET } from '../../src/gui/hd/UiArt';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { CampaignTriggerMachine } from '../../src/game/campaign/CampaignTriggerMachine';
import { CAMPAIGN_BACKDROP_PIXELS, loadCampaignBackdrop, sizeCampaignBackdrop } from '../../src/gui/campaign/CampaignBackdrop';
import { campaignLoadingForeground } from '../../src/gui/campaign/CampaignLoadingArtwork';

const directory = '.local/campaign/ra2/sov01t/';
const manifest = JSON.parse(fs.readFileSync(directory + 'manifest.json', 'utf8'));
const sourceHash = manifest.files.find((file: any) => file.name === 'presentation.json').sha256;
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

test('the original immediate bridge trigger retains all eight explosions and both waypoints', () => {
    const d = new CampaignDefinition('ra2', 'sov01t.map', fs.readFileSync(directory + 'sov01t.map', 'utf8'));
    const trigger = d.triggers.get('0823BDEC')!;
    expect(trigger.disabled).toBe(false); expect(trigger.events.map(event => [event.opcode, event.params])).toEqual([[13, ['0', '0']]]);
    expect(trigger.actions.map(action => [action.opcode, action.params[1]])).toEqual([
        ...Array.from({ length: 4 }, () => [63, '72']), ...Array.from({ length: 4 }, () => [63, '75'])]);
    const fired: any[] = [];
    const machine = new CampaignTriggerMachine(d, 'normal', { targets: () => [], condition: () => false,
        action: action => { if (action.key === trigger.id) fired.push(action); } });
    machine.update(); expect(fired).toHaveLength(8);
});

test('HD selection reserves the shared UI budget, releases fully and falls back under budget pressure', async () => {
    const enabled = Object.getOwnPropertyDescriptor(uiArt, 'enabled');
    Object.defineProperty(uiArt, 'enabled', { configurable: true, get: () => true });
    const previous = { fetch: globalThis.fetch, document: globalThis.document, Image: globalThis.Image };
    const other = {};
    try {
        globalThis.fetch = (async (route: string) => {
            const file = manifest.files.find((file: any) => file.route === route);
            return file ? new Response(fs.readFileSync(directory + file.name)) : new Response('', { status: 404 });
        }) as typeof fetch;
        globalThis.Image = class { naturalWidth = 1264; naturalHeight = 1136; src = ''; async decode() {} } as any;
        globalThis.document = { querySelectorAll: () => [], createElement: () => ({ width: 0, height: 0,
            getContext: () => ({ drawImage: () => {}, getImageData: () => ({ width: 1264, height: 1136,
                data: new Uint8ClampedArray(1264 * 1136 * 4) }) }) }) } as any;
        const loaded = await loadCampaignInterfaceHd(manifest, 'selection', sourceHash);
        expect(loaded?.frame.width).toBe(1264); expect(loaded?.arrows.soviet).toHaveLength(8);
        expect(uiArt.metrics().reservedBytes).toBe(loaded!.reservedGpuBytes);
        loaded!.dispose(); expect(uiArt.metrics().reservedBytes).toBe(0);
        expect(uiArt.reserveSurface(other, UI_TEXTURE_BUDGET, 0)).toBe(true);
        expect(await loadCampaignInterfaceHd(manifest, 'selection', sourceHash)).toBeUndefined();
        expect(uiArt.metrics().reservedBytes).toBe(UI_TEXTURE_BUDGET);
        uiArt.releaseSurface(other);
        expect(await loadCampaignInterfaceHd(manifest, 'selection', 'a'.repeat(64))).toBeUndefined();
        expect(uiArt.metrics().reservedBytes).toBe(0);
    } finally {
        uiArt.releaseSurface(other);
        if (enabled) Object.defineProperty(uiArt, 'enabled', enabled); else delete (uiArt as any).enabled;
        Object.assign(globalThis, previous);
    }
});

test('HD source files and sparse vector animation keep exact original frame/anchor closure', () => {
    const hd = JSON.parse(fs.readFileSync(directory + 'interface-hd.json', 'utf8'));
    const source = JSON.parse(fs.readFileSync(directory + 'presentation.json', 'utf8'));
    expect(hd.originalPresentationSha256).toBe(sourceHash);
    expect(hd.animation).toEqual(source.animation); expect(hd.anchors).toEqual(source.anchors);
    for (const faction of ['allied', 'tutorial', 'soviet']) {
        expect(hd.arrows[faction]).toHaveLength(8); expect(hd.arrows[faction][0]).toEqual([]);
        expect(hd.arrows[faction].slice(1).every((paths: any[]) => paths.length > 0)).toBe(true);
    }
    for (const asset of [hd.selection, hd.loading]) {
        const entry = manifest.files.find((file: any) => file.name === asset.file), bytes = fs.readFileSync(directory + entry.name);
        expect([bytes.length, sha(bytes)]).toEqual([entry.bytes, entry.sha256]);
    }
    expect(hd.loading.originalPhotoRects).toHaveLength(4);
    expect(hd.loading.authoredPhotos).toHaveLength(4);
    for (const photo of hd.loading.authoredPhotos) {
        expect(photo.master.width).toBeGreaterThanOrEqual(photo.rect[2] * 2);
        expect(photo.master.height).toBeGreaterThanOrEqual(photo.rect[3] * 2);
    }
});

test('HD loading metal is identity checked and charged with the mission art to the existing budget', async () => {
    const enabled = Object.getOwnPropertyDescriptor(uiArt, 'enabled');
    Object.defineProperty(uiArt, 'enabled', { configurable: true, get: () => true });
    const previous = { fetch: globalThis.fetch, document: globalThis.document, Image: globalThis.Image };
    let corrupt = false;
    try {
        globalThis.fetch = (async (route: string) => {
            if (route.endsWith('campaign-loading-housing-r2.png')) return new Response(corrupt ? new Uint8Array(4)
                : fs.readFileSync('public/res/presentation/campaign-loading-housing-r2.png'));
            const file = manifest.files.find((file: any) => file.route === route);
            return file ? new Response(fs.readFileSync(directory + file.name)) : new Response('', { status: 404 });
        }) as typeof fetch;
        globalThis.Image = class {
            src = '';
            get naturalWidth() { return this.src.endsWith('.png') ? 1774 : 1600; }
            get naturalHeight() { return this.src.endsWith('.png') ? 887 : 1040; }
            async decode() {}
        } as any;
        globalThis.document = { querySelectorAll: () => [], createElement: () => ({ width: 0, height: 0,
            getContext: () => ({ drawImage: () => {}, getImageData: () => ({ width: 1600, height: 1040,
                data: new Uint8ClampedArray(1600 * 1040 * 4) }) }) }) } as any;
        const loaded = await loadCampaignInterfaceHd(manifest, 'loading', sourceHash);
        expect(loaded?.housing).toBe('/res/presentation/campaign-loading-housing-r2.png');
        expect(loaded?.reservedGpuBytes).toBe((1600 * 1040 + 1774 * 887) * 4 + 256 * 1024);
        expect(uiArt.metrics().reservedBytes).toBe(loaded!.reservedGpuBytes);
        expect(loaded!.reservedGpuBytes).toBeLessThanOrEqual(UI_TEXTURE_BUDGET);
        loaded!.dispose(); expect(uiArt.metrics().reservedBytes).toBe(0);
        corrupt = true;
        expect(await loadCampaignInterfaceHd(manifest, 'loading', sourceHash)).toBeUndefined();
        expect(uiArt.metrics().reservedBytes).toBe(0);
    } finally {
        if (enabled) Object.defineProperty(uiArt, 'enabled', enabled); else delete (uiArt as any).enabled;
        Object.assign(globalThis, previous);
    }
});

test('responsive background allocations fit the unchanged budget beside both live menu textures', async () => {
    const enabled = Object.getOwnPropertyDescriptor(uiArt, 'enabled'), menu = {};
    Object.defineProperty(uiArt, 'enabled', { configurable: true, get: () => true });
    const previous = { fetch: globalThis.fetch, document: globalThis.document, Image: globalThis.Image };
    let corrupt = false;
    try {
        expect(uiArt.reserveSurface(menu, 8_828_928 + 442_368, 0)).toBe(true);
        globalThis.fetch = (async (route: string) => {
            if (route.startsWith('/res/')) return new Response(corrupt ? new Uint8Array(4) : fs.readFileSync('public' + route));
            const file = manifest.files.find((file: any) => file.route === route);
            return file ? new Response(fs.readFileSync(directory + file.name)) : new Response('', { status: 404 });
        }) as typeof fetch;
        globalThis.Image = class {
            src = '';
            get naturalWidth() { return this.src.includes('topography') ? 1898 : 1264; }
            get naturalHeight() { return this.src.includes('topography') ? 829 : 1136; }
            async decode() {}
        } as any;
        globalThis.document = { querySelectorAll: () => [], createElement: () => ({ width: 0, height: 0,
            getContext: () => ({ drawImage: () => {}, getImageData: () => ({ width: 1264, height: 1136,
                data: new Uint8ClampedArray(1264 * 1136 * 4) }) }) }) } as any;
        const backdrop = await loadCampaignBackdrop('topography'); expect(backdrop).toBeDefined();
        const hd = await loadCampaignInterfaceHd(manifest, 'selection', sourceHash, true); expect(hd).toBeDefined();
        expect(uiArt.metrics().reservedBytes).toBeLessThanOrEqual(UI_TEXTURE_BUDGET);
        hd!.dispose(); backdrop!.dispose();
        expect(uiArt.metrics().reservedBytes).toBe(8_828_928 + 442_368);
        corrupt = true; expect(await loadCampaignBackdrop('topography')).toBeUndefined();
        expect(uiArt.metrics().reservedBytes).toBe(8_828_928 + 442_368);
    } finally {
        uiArt.releaseSurface(menu);
        if (enabled) Object.defineProperty(uiArt, 'enabled', enabled); else delete (uiArt as any).enabled;
        Object.assign(globalThis, previous);
    }
});

test('responsive canvas remains bounded for 4K, ultrawide, portrait and extreme aspect ratios', () => {
    for (const [width, height] of [[632, 552], [1232, 568], [3840, 2160], [10000, 600], [600, 10000]]) {
        const transform: number[][] = [];
        const canvas = { width: 0, height: 0, getContext: () => ({ setTransform: (...args: number[]) => transform.push(args) }) };
        sizeCampaignBackdrop(canvas as any, width, height);
        expect(canvas.width * canvas.height).toBeLessThanOrEqual(CAMPAIGN_BACKDROP_PIXELS);
        expect(canvas.width / width).toBeLessThanOrEqual(2); expect(canvas.height / height).toBeLessThanOrEqual(2);
        expect(transform[0][0] / transform[0][3]).toBeCloseTo(1, 2);
    }
});

test('loading foreground preserves all six source image payloads and clips its former world background', () => {
    const source = fs.readFileSync(directory + 'interface-loading-vector.svg', 'utf8');
    const foreground = campaignLoadingForeground(source);
    const images = (svg: string) => [...svg.matchAll(/<image\b[^>]*\/>/g)].map(match => match[0]);
    expect(images(foreground)).toEqual(images(source));
    expect(foreground).toContain('<g clip-path="url(#mission-focus)">');
    expect(foreground).not.toContain('stroke="#b4b9c2"');
    expect(foreground).not.toContain('<rect width="800" height="520" fill="#000"/>');
    expect(() => campaignLoadingForeground('<svg/>')).toThrow('campaign-loading-layer-contract');
});
