import { expect, test } from 'bun:test';
import { nativeShpSource } from '../test-support/resources';
import { EnvironmentHd, aggregateEnvironmentHd, resolveEnvironmentFamily } from '../../src/engine/renderable/builder/EnvironmentHd';
import { environmentHdContract, isEnvironmentHdSource } from '../../src/engine/renderable/builder/environmentHdContract';
import type { PowerPlantHdEntry } from '../../src/engine/renderable/builder/resolvePowerPlantHd';
import { disposeHdSprite } from '../../src/engine/renderable/builder/resolveHdSprite';

const hash = 'a'.repeat(64);
function fixture(name: string): PowerPlantHdEntry {
    const native = environmentHdContract.sources[name];
    const { source } = nativeShpSource('ra2', name, native.sha256, native.bodyFrames, 'TEMPERATE');
    let y = 2;
    const frames = source.frames.map((frame: any) => {
        const entry = { nativeFrame: frame.nativeFrame, page: 'p0',
            sampleRect: [2, y, ...frame.legacyRenderSize.map((value: number) => value * 2)],
            contentRect: [2, y, ...frame.trimSize.map((value: number) => value * 2)] };
        y += frame.legacyRenderSize[1] * 2 + 4;
        return entry;
    });
    const size = [Math.max(...source.frames.map((frame: any) => frame.legacyRenderSize[0] * 2)) + 4, y];
    const manifest = { schemaVersion: 2, packId: 'environment-fixture', packRevision: '1',
        source: { member: name, sha256: native.sha256, theater: 'TEMPERATE', kind: 'resolved-shp-member' },
        logical: { canvas: source.canvas, frames: source.frames },
        color: { representation: 'authored-sRGB-RGBA8-plus-RGBA8-data' }, variants: [{ density: 2, frames,
            pages: [{ id: 'p0', size, base: 'base.png', data: 'data.png',
                baseSha256: hash, dataSha256: hash, baseBytes: 10, dataBytes: 10 }] }] };
    return { image: { filename: name }, source, manifest, manifestHash: hash, read: async filename => {
        const rgba = new Uint8Array(size[0] * size[1] * 4);
        if (filename === 'data.png') for (let index = 3; index < rgba.length; index += 4) rgba[index] = 255;
        else for (const frame of frames) {
            if (source.frames[frame.nativeFrame].empty) continue;
            const [left, top, width, height] = frame.contentRect;
            for (let row = top; row < top + height; row++) for (let column = left; column < left + width; column++)
                rgba.set([90, 120, 75, 255], (row * size[0] + column) * 4);
        }
        return { width: size[0], height: size[1], rgba };
    } };
}

test('environment admission requires pinned native source, theater, canvas and body-slot closure', () => {
    const { source } = fixture('tree05.tem');
    expect(isEnvironmentHdSource(source)).toBe(true);
    for (const changed of [{ sha256: hash }, { theater: 'SNOW' }, { canvas: [1, 1] }, { frames: [] }])
        expect(isEnvironmentHdSource({ ...source, ...changed })).toBe(false);
});

test('waterfall opacity is admitted only for pinned waterfall sources and preserves complete fallback', async () => {
    const entry = fixture('wb01x.tem');
    entry.manifest.color.visualOpacity = .64;
    const loaded = await resolveEnvironmentFamily('environment-wb01x', [entry], 2, 8 * 1024 * 1024, 2048, () => {});
    expect(loaded.overrides.get(entry.image)?.visualOpacity).toBe(.64);
    loaded.overrides.forEach(disposeHdSprite);
    for (const value of [0, -1, 1.01, NaN]) {
        entry.manifest.color.visualOpacity = value;
        const rejected = await resolveEnvironmentFamily('environment-wb01x', [entry], 2, 8 * 1024 * 1024, 2048, () => {});
        expect(rejected.overrides.size).toBe(0);
    }
    const tree = fixture('tree05.tem');
    tree.manifest.color.visualOpacity = .64;
    expect((await resolveEnvironmentFamily('environment-tree05', [tree], 2, 8 * 1024 * 1024, 2048, () => {})).overrides.size).toBe(0);
});

test('a complete environment family accounts retained CPU, uploads once and releases its shared pages', async () => {
    let uploads = 0;
    const entry = fixture('tree05.tem');
    const loaded = await resolveEnvironmentFamily('environment-tree05', [entry], 2, 8 * 1024 * 1024,
        2048, () => { uploads++; });
    expect(loaded.overrides.size).toBe(1);
    expect(uploads).toBe(1);
    expect(loaded.worldChargeBytes).toBe(loaded.gpuBytes + loaded.retainedCpuBytes);
    expect(loaded.loadingPeakBytes).toBeGreaterThanOrEqual(loaded.worldChargeBytes);
    expect(loaded.loadingPeakBytes).toBeGreaterThanOrEqual(loaded.worldChargeBytes + loaded.restoreWorkingBytes);
    expect(loaded.loadingPeakBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
    const override = loaded.overrides.get(entry.image)!;
    expect(override.pages[0].data.image.width).toBe(1);
    expect(override.pages[0].data.image.height).toBe(1);
    const match = new EnvironmentHd();
    match.overrides.set(entry.image, override);
    match.overrides.set({ filename: 'hash-identical-alias.tem' }, override);
    let disposed = 0;
    for (const page of override.pages) for (const texture of [page.base, page.data])
        texture.addEventListener('dispose', () => disposed++);
    Object.assign(match.report, loaded);
    match.dispose();
    expect(match.overrides.size).toBe(0);
    expect(match.report.worldChargeBytes).toBe(0);
    expect(match.report.disposed).toBe(true);
    expect(disposed).toBe(override.pages.length * 2);
});

test('missing child, invalid child, insufficient budget and missing 4X leave the whole family Original', async () => {
    const names = environmentHdContract.families['environment-ctmsc06'].members;
    const entries = names.map(fixture);
    let uploads = 0;
    const upload = () => { uploads++; };
    for (const [inputs, density, budget] of [
        [entries.slice(0, 1), 2, 8 * 1024 * 1024],
        [entries.map((entry, index) => index ? { ...entry, manifest: { ...entry.manifest, logical: {} } } : entry), 2, 8 * 1024 * 1024],
        [entries, 2, 1], [entries, 4, 8 * 1024 * 1024],
    ] as [PowerPlantHdEntry[], 2 | 4, number][]) {
        const result = await resolveEnvironmentFamily('environment-ctmsc06', inputs, density, budget, 2048, upload);
        expect(result.overrides.size).toBe(0);
        expect(result.worldChargeBytes).toBe(0);
    }
    expect(uploads).toBe(0);
});

test('bridge and building aggregate views preserve explicit native frame order and borrow one page set', async () => {
    const entry = fixture('tree05.tem');
    const loaded = await resolveEnvironmentFamily('environment-tree05', [entry], 2, 8 * 1024 * 1024, 2048, () => {});
    const view = aggregateEnvironmentHd([{ image: entry.image, nativeFrame: 0 },
        { image: entry.image, nativeFrame: 0 }], loaded.overrides)!;
    expect(view.frames).toHaveLength(2);
    expect(view.pages.length).toBe(loaded.overrides.get(entry.image)!.pages.length);
    expect(view.frames[0]).toEqual(view.frames[1]);
    expect(aggregateEnvironmentHd([{ image: {}, nativeFrame: 0 }], loaded.overrides)).toBeUndefined();
    loaded.overrides.forEach(disposeHdSprite);
});
