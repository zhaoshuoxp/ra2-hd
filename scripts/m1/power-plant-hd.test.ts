import { test, expect } from 'bun:test';
import { ImageFinder } from '../../src/engine/ImageFinder';
import { ShpFile } from '../../src/data/ShpFile';
import { ShpImage } from '../../src/data/ShpImage';
import { ShpAggregator } from '../../src/engine/renderable/builder/ShpAggregator';
import { resolvePowerPlantHd, disposePowerPlantHd, aggregatePowerPlantHd, powerPlantMembers,
    type PowerPlantHdEntry } from '../../src/engine/renderable/builder/resolvePowerPlantHd';

const hash = 'a'.repeat(64);
function fixture(): PowerPlantHdEntry[] {
    return [...powerPlantMembers].map(([member, count], index) => {
        const frames = Array.from({ length: count }, (_, nativeFrame) => ({ nativeFrame,
            trimOrigin: [7, 9], trimSize: [2, 2], legacyRenderSize: [2, 2], empty: false }));
        const source = { member, sha256: String(index + 1).repeat(64), theater: 'TEMPERATE', canvas: [142, 110], frames };
        const manifest = { schemaVersion: 2, packId: 'gapowr-test', packRevision: '1',
            source: { ...source, kind: 'resolved-shp-member' }, logical: { canvas: source.canvas, frames },
            color: { representation: 'authored-sRGB-RGBA8-plus-RGBA8-data' },
            variants: [2, 4].map(density => ({ density, pages: [{ id: 'p0', size: [2 * density + 4, count * (2 * density + 4)],
                base: `${density}-base.png`, data: `${density}-data.png`, baseBytes: 1, dataBytes: 1,
                baseSha256: hash, dataSha256: hash }], frames: frames.map(({ nativeFrame }) => ({ nativeFrame, page: 'p0',
                    sampleRect: [2, 2 + nativeFrame * (2 * density + 4), 2 * density, 2 * density],
                    contentRect: [2, 2 + nativeFrame * (2 * density + 4), 2 * density, 2 * density] })) })) };
        const image = new ShpFile(); image.filename = member; image.width = 142; image.height = 110;
        for (let i = 0; i < (member === 'ggpowr_a.shp' ? 32 : count * 2); i++) image.addImage(new ShpImage());
        return { source, manifest, image, manifestHash: hash, read: async filename => {
            const density = Number(filename[0]), width = 2 * density + 4, height = count * (2 * density + 4);
            const rgba = new Uint8Array(width * height * 4);
            if (filename.includes('data')) for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
            return { width, height, rgba };
        } };
    });
}
const resolve = (entries = fixture(), density = 4) => resolvePowerPlantHd(entries, density, 2048);

test('building selects one complete density; missing construction 4x downshifts all members', async () => {
    let loaded = await resolve(); expect(loaded.report.density).toBe(4); expect(loaded.overrides.size).toBe(3);
    disposePowerPlantHd(loaded);
    const entries = fixture(); entries[2].manifest.variants.pop();
    let disposed = 0;
    loaded = await resolvePowerPlantHd(entries, 4, 2048, textures => {
        textures.forEach(t => t.addEventListener('dispose', () => disposed++));
    });
    expect(disposed).toBe(4); expect(loaded.report.density).toBe(2);
    expect([...loaded.overrides.values()].every(o => o.identity.endsWith('/2'))).toBe(true);
    expect(loaded.report.attempts).toEqual([{ density: 4, member: 'gtpowrmk.shp', reason: 'missing-density' }]);
    disposePowerPlantHd(loaded); expect(disposed).toBe(10);
});

test('missing damaged frame, invalid source, missing page and unsupported theater reject complete family', async () => {
    for (const failure of ['damaged', 'source', 'page', 'theater', 'missing-member']) {
        const entries = fixture();
        if (failure === 'damaged') entries[1].manifest.variants.forEach(v => v.frames.splice(8, 1));
        if (failure === 'source') entries[1].manifest.source.sha256 = 'b'.repeat(64);
        if (failure === 'page') entries[2].read = async () => { throw new Error('missing-page'); };
        if (failure === 'theater') entries[0].source.theater = 'SNOW';
        if (failure === 'missing-member') entries.pop();
        const loaded = await resolve(entries);
        expect(loaded.report.density).toBe(1); expect(loaded.overrides.size).toBe(0);
        expect(loaded.report.gpuBytes).toBe(0); expect(loaded.report.attempts.length).toBeGreaterThan(0);
    }
    const entries = fixture(); entries.forEach(e => { e.read = async () => { throw new Error('disabled-read'); }; });
    expect((await resolve(entries, 1)).report.attempts).toEqual([]);
});

test('native aggregation preserves offsets, retained tail data and original shadows alongside Conscript', async () => {
    const entries = fixture(), loaded = await resolve(entries);
    const infos = entries.map(e => ShpAggregator.getShpFrameInfo(e.image as ShpFile, e.source.member !== 'ggpowr_a.shp'));
    const aggregate = new ShpAggregator().aggregate(infos, 'agg_GAPOWR.shp');
    expect([...aggregate.imageIndexes.values()]).toEqual([0, 3, 35]);
    expect(aggregate.file.numImages).toBe(120);
    const hd = aggregatePowerPlantHd(aggregate, loaded)!;
    expect(hd.frames[0].page).toBe(0); expect(hd.frames[3].page).toBe(1); expect(hd.frames[35].page).toBe(2);
    for (let i = 19; i < 35; i++) expect(hd.frames[i]).toBeUndefined();
    for (let i = 60; i < 120; i++) expect(hd.frames[i]).toBeUndefined();
    expect(aggregate.file.getImage(60)).toBe((entries[0].image as ShpFile).getImage(3));
    expect(aggregate.file.getImage(95)).toBe((entries[2].image as ShpFile).getImage(25));
    const conscript = {}, conscriptOverride = { identity: 'accepted-conscript', frames: [], pages: [] };
    const finder = new ImageFinder(new Map(), {}, { image: conscript, override: conscriptOverride,
        report: { density: 4, gpuBytes: 0, attempts: [] } }, loaded);
    expect(finder.getHdOverride(conscript)).toBe(conscriptOverride);
    expect(finder.getHdOverride({})).toBeUndefined();
    expect(finder.getBuildingHdOverride('GAPOWR', aggregate)?.pages[0]).toBe(hd.pages[0]);
    expect(finder.getBuildingHdOverride('NAREFN', aggregate)).toBeUndefined();
    expect(finder.getBuildingHdOverride('NAPOWR', aggregate)).toBeUndefined(); // No Soviet family loaded.
    const fake = { imageIndexes: new Map([[{}, 0], [{}, 3], [{}, 35]]) };
    expect(finder.getBuildingHdOverride('GAPOWR', fake)).toBeUndefined();
    expect(new ImageFinder(new Map(), {}).getBuildingHdOverride('GAPOWR', aggregate)).toBeUndefined();
    disposePowerPlantHd(loaded);
    expect(finder.getHdOverride(conscript)).toBe(conscriptOverride);
});
