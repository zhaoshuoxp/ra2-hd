import { afterEach, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import contracts from '../../desktop/yr-campaign-vehicle-contracts.json';
import { registerHdResources } from '../../desktop/hd-profile.mjs';
import { Engine } from '../../src/engine/Engine';
import { loadVxlFamily } from '../../src/engine/renderable/unitVxl/loadVxlFamily';
import { prepareVxlPixels } from '../../src/engine/renderable/unitVxl/prepareVxlPixels';
import { resourceRoot, retailMember } from '../test-support/resources';

const originalFetch = globalThis.fetch, originalVfs = Engine.vfs;
const registered = registerHdResources(resourceRoot);
afterEach(() => { globalThis.fetch = originalFetch; Engine.vfs = originalVfs; });
for (const identity of Object.keys(contracts.vxl)) test(`${identity} checks original palette/VPL, complete independent bearings and atomic fallback`, async () => {
    const profile = await registered;
    let fault = '', uploads = 0, releases = 0;
    Engine.vfs = { openFile: (name: string) => fault === name
        ? { getBytes: () => new Uint8Array([0]) } : retailMember('yr', name).file } as any;
    globalThis.fetch = (async (url: any) => {
        const file = profile.routes.get(String(url));
        if (!file || fault === 'missing' && String(url).endsWith('-data.png'))
            return new Response(null, { status: 404 });
        const bytes = readFileSync(file);
        if (fault === 'corrupt' && String(url).endsWith('-data.png')) bytes[0] ^= 1;
        return new Response(bytes);
    }) as any;
    const renderer = { capabilities: { maxTextureSize: 8192 },
        initTexture: (texture: any) => { uploads++; texture.addEventListener('dispose', () => releases++); },
        getContext: () => ({ getError: () => 0 }) } as any;
    const preparer = { prepare: async (images: ArrayBuffer[], _size: number[], scale: number,
        maximum: number, lighting: boolean) => {
        const decoded = images.map(bytes => { const png = PNG.sync.read(Buffer.from(bytes));
            return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) }; });
        return prepareVxlPixels(decoded[0], decoded[1], scale, maximum, lighting);
    } } as any;
    for (const density of [2, 4] as const) {
        const loaded = await loadVxlFamily(identity, 1536 * 1024 ** 2, renderer, () => false, density, preparer);
        expect(loaded.attempts).toEqual([]); expect(loaded.density).toBe(density);
        expect(loaded.vxl?.identity).toBe(identity); expect(loaded.vxl?.parts).toHaveLength(1);
        const part = loaded.vxl!.parts[0];
        expect(part.frames.map(frame => frame.heading)).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
        for (const frame of part.frames)
            expect(frame.rect.slice(2)).toEqual(frame.logicalSize.map(size => Math.round(size * density)));
        loaded.vxl!.dispose(); expect(releases).toBe(uploads);
    }
    for (fault of ['unitubn.pal', 'voxels.vpl', 'missing', 'corrupt', 'budget']) {
        const before = uploads;
        const loaded = await loadVxlFamily(identity, fault === 'budget' ? 1 : 1536 * 1024 ** 2,
            renderer, () => false, 4, preparer);
        expect(loaded.vxl).toBeUndefined(); expect(loaded.density).toBe(1);
        expect(loaded.gpuBytes).toBe(0); expect(uploads).toBe(before);
        expect(loaded.attempts.map(attempt => attempt.reason)).toEqual(Array(2).fill({
            'unitubn.pal': 'vxl-source-palette', 'voxels.vpl': 'vxl-source-vpl',
            missing: 'missing-vxl-resource', corrupt: 'vxl-hash-mismatch', budget: 'combined-budget',
        }[fault]));
    }
}, 30000);
