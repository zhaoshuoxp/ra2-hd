import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { applyOfficialLibraryPalettes } from '../../src/offline/officialSkirmishVisuals';
import { PaletteType } from '../../src/engine/type/PaletteType';
import { TheaterType } from '../../src/engine/TheaterType';
import catalog from '../../src/offline/officialSkirmishCatalog.json';

const archives = ['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix'];
const top = new Map(archives.map(name => [name,
    readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const sourceHash = 'a4f07f9b927148f871136237e48253cadff9ff631602cb79de46e86e1100c574';
const urbanHash = 'c3f4f1c670fe69ba74e35aeee38a30f5d4d04a50dd4a15ddbbb7c443d029056a';
const make = (edition: 'ra2' | 'yr', urban = false) => {
    const tree = editionRetailTree(top, edition);
    const objects = new Map(['CACITY01', 'CACITY02', 'CACITY03', 'CACITY04', 'CAHSE01'].map(name => [name,
        { imageName: name, useTheaterExtension: false, paletteType: PaletteType.Unit,
            customPaletteName: undefined as string | undefined, remapable: true, canvas: [296, 240],
            states: ['normal', 'damaged', 'occupied'], originalShadow: true }]));
    const entry = catalog.maps.find(entry => entry.edition === edition && entry.source.sha256 === (urban ? urbanHash : sourceHash))!;
    const theater = { type: urban ? TheaterType.Urban : TheaterType.Snow,
        settings: { libPaletteName: urban ? 'liburb.pal' : 'libsno.pal' } };
    const art = { getObject: (name: string) => objects.get(name)! };
    const finder = { findByObjectArt: (art: { imageName: string }) => ({
        filename: (urban ? art.imageName.toLowerCase().replace(/^ca/, 'cu') : art.imageName.toLowerCase()) + '.shp' }) };
    const read = (member: string) => resolveMember(tree, member).file.getBytes();
    return { objects, entry, theater, art, finder, read };
};

test('both original editions apply only the four approved palettes and preserve native art semantics', async () => {
    for (const edition of ['ra2', 'yr'] as const) {
        const f = make(edition), before = structuredClone(f.objects);
        const report = await applyOfficialLibraryPalettes(f.entry, f.theater, f.art, f.finder, f.read);
        expect(report.status).toBe('APPLIED_SOURCE_PINNED_ORIGINAL_LIBRARY_PALETTE');
        expect(report.members.length).toBe(4);
        for (const [name, art] of f.objects) {
            const expected = before.get(name)!;
            if (name !== 'CAHSE01') Object.assign(expected, { paletteType: PaletteType.Custom, customPaletteName: 'lib' });
            expect(art).toEqual(expected);
        }
    }
});
test('the exact Urban counterparts use identical approved library bytes in both editions', async () => {
    for (const edition of ['ra2', 'yr'] as const) {
        const f = make(edition, true), before = structuredClone(f.objects);
        const report = await applyOfficialLibraryPalettes(f.entry, f.theater, f.art, f.finder, f.read);
        expect(report.status).toBe('APPLIED_SOURCE_PINNED_ORIGINAL_LIBRARY_PALETTE');
        expect(report.members.map(row => row.member)).toEqual(['cucity01.shp', 'cucity02.shp', 'cucity03.shp', 'cucity04.shp']);
        for (const [name, art] of f.objects) {
            const expected = before.get(name)!;
            if (name !== 'CAHSE01') Object.assign(expected, { paletteType: PaletteType.Custom, customPaletteName: 'lib' });
            expect(art).toEqual(expected);
        }
        const unrelated = make(edition, true);
        const unrelatedBefore = structuredClone(unrelated.objects);
        expect((await applyOfficialLibraryPalettes({ ...unrelated.entry, source: { ...unrelated.entry.source, sha256: '0'.repeat(64) } },
            unrelated.theater, unrelated.art, unrelated.finder, () => { throw Error('No unrelated-map source read'); })).status).toBe('NOT_APPLICABLE');
        expect(unrelated.objects).toEqual(unrelatedBefore);
        const changed = make(edition, true), changedBefore = structuredClone(changed.objects);
        const changedRead = (member: string) => {
            const bytes = changed.read(member).slice();
            if (member === 'cucity04.shp') bytes[0] ^= 1;
            return bytes;
        };
        expect((await applyOfficialLibraryPalettes(changed.entry, changed.theater, changed.art,
            changed.finder, changedRead)).status).toBe('IMAGE_SOURCE_MISMATCH');
        expect(changed.objects).toEqual(changedBefore);
    }
});
test('other maps and theaters do not read or adapt source data', async () => {
    const f = make('ra2'), before = structuredClone(f.objects);
    const noRead = () => { throw Error('Unrelated maps must not inspect pinned source data'); };
    expect((await applyOfficialLibraryPalettes(undefined, f.theater, f.art, f.finder, noRead)).status).toBe('NOT_APPLICABLE');
    expect((await applyOfficialLibraryPalettes(f.entry, { ...f.theater, type: TheaterType.Temperate },
        f.art, f.finder, noRead)).status).toBe('NOT_APPLICABLE');
    expect(f.objects).toEqual(before);
});
test('a changed late member refuses the complete adaptation before any palette is published', async () => {
    const f = make('yr'), before = structuredClone(f.objects);
    const read = (member: string) => {
        const bytes = f.read(member).slice();
        if (member === 'cacity04.shp') bytes[0] ^= 1;
        return bytes;
    };
    expect((await applyOfficialLibraryPalettes(f.entry, f.theater, f.art, f.finder, read)).status).toBe('IMAGE_SOURCE_MISMATCH');
    expect(f.objects).toEqual(before);
});
test('changed library colors or a different NewTheater image retain the original palette', async () => {
    const f = make('ra2'), before = structuredClone(f.objects);
    const read = (member: string) => {
        const bytes = f.read(member).slice();
        if (member === 'libsno.pal') bytes[0] ^= 1;
        return bytes;
    };
    expect((await applyOfficialLibraryPalettes(f.entry, f.theater, f.art, f.finder, read)).status).toBe('PALETTE_SOURCE_MISMATCH');
    expect((await applyOfficialLibraryPalettes(f.entry, f.theater, f.art,
        { findByObjectArt: () => ({ filename: 'cscity01.shp' }) }, f.read)).status).toBe('IMAGE_MEMBER_MISMATCH');
    expect(f.objects).toEqual(before);
});
