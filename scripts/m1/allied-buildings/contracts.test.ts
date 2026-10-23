import { expect, test } from 'bun:test';
import catalog from '../../../desktop/allied-building-coverage.json';
import { ImageFinder } from '../../../src/engine/ImageFinder';
import { resolvePowerPlantHd, aggregatePowerPlantHd, disposePowerPlantHd,
    type BuildingHdFamily, type PowerPlantHdEntry } from '../../../src/engine/renderable/builder/resolvePowerPlantHd';

function fixture(definition: typeof catalog[keyof typeof catalog]): PowerPlantHdEntry[] {
    return definition.members.map(m => {
        const frames = Array.from({ length: m.frames }, (_, nativeFrame) => ({ nativeFrame,
            trimOrigin: [2, 2], trimSize: [2, 2], legacyRenderSize: [2, 2], empty: false }));
        const source = { member: m.member, theater: m.theater, sha256: m.sha256, canvas: m.canvas, frames };
        const manifest = { schemaVersion: 2, packId: 'allied-contract-fixture', packRevision: '1',
            source: { kind: 'resolved-shp-member', ...source }, logical: { canvas: m.canvas, frames },
            color: { representation: 'authored-sRGB-RGBA8-plus-RGBA8-data' },
            variants: [{ density: 2, pages: [{ id: 'p0', size: [8, 8 * m.frames],
                base: 'base.png', data: 'data.png', baseBytes: 1, dataBytes: 1,
                baseSha256: 'a'.repeat(64), dataSha256: 'a'.repeat(64) }],
            frames: frames.map(({ nativeFrame }) => ({ nativeFrame, page: 'p0',
                sampleRect: [2, nativeFrame * 8 + 2, 4, 4], contentRect: [2, nativeFrame * 8 + 2, 4, 4] })) }] };
        return { source, manifest, image: {}, manifestHash: 'a'.repeat(64), read: async file => {
            const rgba = new Uint8Array(8 * 8 * m.frames * 4);
            if (file === 'data.png') for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
            else for (let n = 0; n < m.frames; n++) for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) {
                const i = ((n * 8 + y) * 8 + x) * 4;
                rgba[i] = 100; rgba[i + 3] = 255;
            }
            return { width: 8, height: 8 * m.frames, rgba };
        } };
    });
}

test('each declared Allied family resolves atomically at its complete catalog member count', async () => {
    for (const definition of Object.values(catalog)) {
        const entries = fixture(definition), uploads: unknown[] = [];
        const family = definition.family as BuildingHdFamily;
        const loaded = await resolvePowerPlantHd(entries, 2, 2048, textures => uploads.push(textures), family, 1e6, true);
        expect(loaded.report, JSON.stringify(loaded.report)).toMatchObject({ density: 2 });
        expect(loaded.overrides.size).toBe(definition.members.length);
        expect(uploads).toHaveLength(1);
        const offsets = entries.map((entry, i) => [entry.image, i * 100] as [object, number]);
        const aggregate = aggregatePowerPlantHd({ imageIndexes: new Map(offsets) }, loaded, family)!;
        expect(aggregate.identity.startsWith(family.toLowerCase() + '/')).toBe(true);
        expect(aggregate.frames[99]).toBeUndefined();
        disposePowerPlantHd(loaded);
    }
});

test('missing member, mismatched theater source, corrupt final page and exhausted budget publish no partial Allied family', async () => {
    for (const failure of ['member', 'theater', 'page', 'budget']) {
        const definition = catalog['gtgcan-temperate'], entries = fixture(definition);
        if (failure === 'member') entries.pop();
        if (failure === 'theater') entries[0].source.theater = 'SNOW';
        if (failure === 'page') entries.at(-1)!.read = async () => { throw Error('corrupt page'); };
        let uploads = 0;
        const loaded = await resolvePowerPlantHd(entries, 2, 2048, () => uploads++, 'GTGCAN', failure === 'budget' ? 0 : 1e6, true);
        expect(loaded.overrides.size).toBe(0);
        expect(loaded.report.gpuBytes).toBe(0);
        expect(uploads).toBe(0);
        expect(loaded.report.attempts.length).toBeGreaterThan(0);
    }
});

test('American airfield shares the exact complete HQ texture family and aggregate binding', async () => {
    const entries = fixture(catalog['gaairc-temperate']);
    const loaded = await resolvePowerPlantHd(entries, 2, 2048, () => {}, 'GAAIRC', 1e6, true);
    const finder = new ImageFinder(new Map(), {}, undefined, undefined, undefined, undefined, { GAAIRC: loaded });
    const aggregate = { imageIndexes: new Map(entries.map((e, i) => [e.image, i * 100])) };
    const alias = finder.getBuildingHdOverride('AMRADR', aggregate);
    expect(alias?.identity.startsWith('amradr/')).toBe(true);
    expect(alias?.frames.filter(Boolean).length).toBe(entries.reduce((n, e) => n + e.source.frames.length, 0));
    const peer = finder.getBuildingHdOverride('GAAIRC', { imageIndexes: aggregate.imageIndexes });
    expect(alias?.pages[0]?.base).toBeDefined();
    expect(peer?.pages[0]?.base).toBe(alias?.pages[0]?.base);
    disposePowerPlantHd(loaded);
    expect(finder.getBuildingHdOverride('AMRADR', aggregate)).toBeUndefined();
});
