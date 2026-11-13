import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Palette } from '../../src/data/Palette';
import { TmpFile } from '../../src/data/TmpFile';
import { TmpDrawable } from '../../src/engine/gfx/drawable/TmpDrawable';
import { nativeTerrainMetadata } from '../../src/engine/renderable/entity/map/terrainHdContract';
import { retailMember, selectedPack, sha256 } from '../test-support/resources';

const output = path.resolve(process.argv[2]), auditFile = path.resolve(process.argv[3]);
const wanted = process.argv.find(value => value.startsWith('--theaters='))?.slice(11).split(',') ?? ['NEWURBAN'];
assert(wanted.every(value => ['TEMPERATE', 'URBAN', 'SNOW', 'NEWURBAN', 'DESERT'].includes(value)));
const audit = JSON.parse(fs.readFileSync(auditFile, 'utf8'));
assert(audit.status.startsWith('PASS_ALL_ORIGINAL_CAMPAIGN_AND_ARCHIVED_SKIRMISH'));
fs.mkdirSync(output, { recursive: false });
const settings: Record<string, [string, string]> = {
    TEMPERATE: ['.tem', 'isotem.pal'], URBAN: ['.urb', 'isourb.pal'], SNOW: ['.sno', 'isosno.pal'],
    NEWURBAN: ['.ubn', 'isoubn.pal'], DESERT: ['.des', 'isodes.pal'],
};
const packs = [];
for (const theater of wanted) {
    const [extension, paletteName] = settings[theater], selection = selectedPack('terrain', theater);
    const pointerFile = `.local/terrain${theater === 'TEMPERATE' ? '' : '-' + theater.toLowerCase()}-selection.json`;
    const pointer = JSON.parse(fs.readFileSync(pointerFile, 'utf8'));
    const edition = ['NEWURBAN', 'DESERT'].includes(theater) ? 'yr' : 'ra2';
    const paletteSource = retailMember(edition, paletteName), palette = new Palette(paletteSource.file);
    const admitted = new Map<string, any>();
    for (const group of selection.manifest.groups) for (const member of group.members) {
        if (/^(?:(?:pr|dr)slpe\d+|(?:p|d)roads?\d+|pave01|clear01[a-z]?)\./.test(member.member))
            admitted.set(member.member, { group: group.id, member });
    }
    const expectedSlopes = new Set(audit.identities.filter((row: any) => row.roadSlope
        && row.member.endsWith(extension)).map((row: any) => row.member));
    for (const member of expectedSlopes) if (!admitted.has(member)) admitted.set(member, undefined);
    const directory = path.join(output, theater.toLowerCase()); fs.mkdirSync(directory);
    const records = [];
    for (const [name, selected] of admitted) {
        const source = retailMember(edition, name), native = new TmpFile(source.file);
        const metadata = native.images.map((_, index) => nativeTerrainMetadata(native, index));
        if (selected) {
            assert.equal(selected.member.sourceHashes[edition], source.sha256);
            assert.equal(JSON.stringify(metadata), JSON.stringify(selected.member.images));
        }
        const sourceHashes = selected?.member.sourceHashes ?? { [edition]: source.sha256 };
        const frames = native.images.map((image, index) => {
            const bitmap = new TmpDrawable().draw(image as any, native.blockWidth, native.blockHeight);
            const rgba = new Uint8Array(bitmap.data.length * 4);
            bitmap.data.forEach((value, pixel) => { const color = palette.getColor(value);
                rgba.set([color.r, color.g, color.b, value ? 255 : 0], pixel * 4); });
            const file = `${theater.toLowerCase()}/${name}-${index}.rgba`;
            fs.writeFileSync(path.join(output, file), rgba, { flag: 'wx' });
            return { metadata: metadata[index], file, sha256: sha256(rgba),
                empty: native.emptySlots.includes(index), zSha256: image.zData ? sha256(image.zData) : null };
        });
        records.push({ member: name, group: selected?.group, sourceHashes, frames,
            newMember: !selected, usedInOriginalMaps: expectedSlopes.has(name) });
    }
    assert([...expectedSlopes].every(name => records.some(record => record.member === name)));
    packs.push({ theater, pointer, selector: pointerFile, sourceEdition: edition,
        palette: { member: paletteName, sha256: paletteSource.sha256 }, records });
}
fs.writeFileSync(path.join(output, 'source.json'), JSON.stringify({ schema: 'all-map-road-slope-repair-sources-v1',
    audit: { file: auditFile, sha256: sha256(fs.readFileSync(auditFile)) }, packs,
    policy: 'Source RGB is used only to locate material and paint geometry. Reproject accepted same-theater HD artwork as complete original road planes, preserving all source identities, metadata, clipping, depth and gameplay.' }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(packs.map(pack => ({ theater: pack.theater, members: pack.records.length,
    roadSlopes: pack.records.filter(record => /^(pr|dr)slpe/.test(record.member)).length,
    unregistered: pack.records.filter(record => record.newMember).map(record => record.member) }))));
