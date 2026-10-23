// Pin native Desert dirt roads and accepted Temperate geometry/material counterparts.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { TmpFile } from '../../src/data/TmpFile';
import { Palette } from '../../src/data/Palette';
import { TmpDrawable } from '../../src/engine/gfx/drawable/TmpDrawable';
import { nativeTerrainMetadata } from '../../src/engine/renderable/entity/map/terrainHdContract';

const root = '.artifacts/m2-4/desert-dirt-roads-batch81-20261019';
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const inventoryFile = '.artifacts/m2-4/accepted-faction-routing-batches79-80-20261019/inventory-current-v1/inventory.json';
const inventory = read(inventoryFile);
const targets = inventory.resourceGroups.filter((g: any) => g.theater === 'DESERT' && g.kind === 'tmp'
    && g.decisions.includes('MISSING_AUTHORED_FAMILY'));
assert.equal(targets.length, 81);
assert(targets.every((g: any) => g.member.startsWith('droad')));
const pointer = read('.local/terrain-selection.json');
const donorFile = `.local/terrain-packs/${pointer.revision}/manifest.json`;
assert.equal(sha(readFileSync(donorFile)), pointer.sha256);
const donor = read(donorFile);
const selected = new Map(donor.groups.flatMap((g: any) => g.members.map((m: any) => [m.member, { ...m, group: g.id }])));
const nativeRoot = '.artifacts/m2-4/desert-native-v1';
const original = read(nativeRoot+'/source.json');
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const tree = editionRetailTree(top, 'yr');
const paletteSource = resolveMember(tree, 'isotem.pal');
const palette = new Palette(paletteSource.file);
mkdirSync(root+'/temperate-native');
const rows = [];
for (const target of targets) {
    const source = original.sources.find((s: any) => s.member === target.member && s.sha256 === target.sha256);
    assert(source);
    const counterpart = target.member.replace('.des', '.tem');
    const accepted: any = selected.get(counterpart);
    assert(accepted);
    const file = resolveMember(tree, counterpart).file;
    assert.equal(sha(file.getBytes()), accepted.sourceHashes.yr);
    const tmp = new TmpFile(file);
    assert.equal(tmp.images.length, source.images.length);
    const folder = `${root}/temperate-native/${counterpart}`;
    mkdirSync(folder);
    writeFileSync(folder+'/source.tmp', file.getBytes(), { flag: 'wx' });
    const images = tmp.images.map((image: any, slot: number) => {
        const metadata = nativeTerrainMetadata(tmp, slot);
        const targetImage = source.images[slot];
        const differences: any[] = [];
        for (const key of ['grid', 'block', 'logical', 'offset', 'origin', 'height', 'hasExtraData', 'hasZData'])
            if (JSON.stringify((metadata as any)[key]) !== JSON.stringify(targetImage[key])) differences.push(key);
        const bitmap = new TmpDrawable().draw(image, tmp.blockWidth, tmp.blockHeight);
        const rgba = new Uint8Array(bitmap.data.length*4);
        bitmap.data.forEach((index: number, pixel: number) => {
            const color = palette.colors[index];
            rgba.set([color.r, color.g, color.b, index ? 255 : 0], pixel*4);
        });
        const relative = `temperate-native/${counterpart}/${slot}.rgba`;
        writeFileSync(root+'/'+relative, rgba, { flag: 'wx' });
        return { ...metadata, subTile: slot, size: [bitmap.width, bitmap.height], file: relative,
            rgbaSha256: sha(rgba), targetNativePointer: targetImage.nativeOffset, geometryDifferences: differences };
    });
    rows.push({ member: target.member, sourceSha256: target.sha256, donorMember: counterpart,
        donorSourceSha256: sha(file.getBytes()), donorGroup: accepted.group, maps: target.maps, images,
        geometryCompatible: images.every((i: any) => !i.geometryDifferences.length) });
}
writeFileSync(root+'/preparation-v1.json', JSON.stringify({ status: 'NATIVE_GEOMETRY_AND_ACCEPTED_MATERIAL_PREPARATION_ONLY',
    inventoryFile, inventorySha256: sha(readFileSync(inventoryFile)), acceptedDonor: pointer,
    nativeRoot, nativeGuideSha256: sha(readFileSync(nativeRoot+'/source.json')),
    donorPaletteSha256: sha(paletteSource.file.getBytes()), rows, sourceMapsChanged: false,
    selectedResourcesChanged: false, artworkStatus: 'NOT_EXPORTED', m24Complete: false }, null, 2)+'\n', { flag: 'wx' });
console.log(JSON.stringify({ members: rows.length, geometryCompatible: rows.filter(r => r.geometryCompatible).length,
    incompatible: rows.filter(r => !r.geometryCompatible).map(r => ({ member: r.member,
        differences: r.images.filter((i: any) => i.geometryDifferences.length).map((i: any) => [i.subTile, i.geometryDifferences]) })) }));
