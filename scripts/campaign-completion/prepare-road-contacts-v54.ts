import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Palette } from '../../src/data/Palette';
import { TmpFile } from '../../src/data/TmpFile';
import { TmpDrawable } from '../../src/engine/gfx/drawable/TmpDrawable';
import { nativeTerrainMetadata } from '../../src/engine/renderable/entity/map/terrainHdContract';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';

const output = process.argv[2];
const sideRoads = true;
assert(output, 'Usage: prepare-road-contacts-v54.ts <new-output-directory>');
mkdirSync(output, { recursive: false });
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const archives = ['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix'];
const top = new Map(archives.map(name => [name,
    readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const trees = { ra2: editionRetailTree(top, 'ra2'), yr: editionRetailTree(top, 'yr') };
const palettes = { temperate: 'isotem.pal', urban: 'isourb.pal', newurban: 'isoubn.pal',
    snow: 'isosno.pal', desert: 'isodes.pal' };
const packs = [];
for (const [theater, paletteName] of Object.entries(palettes)) {
    if (sideRoads && theater !== 'urban') continue;
    const selector = `.local/terrain-${theater === 'temperate' ? '' : theater + '-'}selection.json`;
    const pointer = read(selector), root = `.local/terrain-packs/${pointer.revision}`;
    assert.equal(sha(readFileSync(`${root}/manifest.json`)), pointer.sha256);
    const manifest = read(`${root}/manifest.json`), records = [];
    mkdirSync(path.join(output, theater));
    const edition = theater === 'newurban' || theater === 'desert' ? 'yr' : 'ra2';
    const paletteFile = resolveMember(trees[edition], paletteName).file;
    const palette = new Palette(paletteFile);
    for (const group of manifest.groups) for (const member of group.members) {
        if (!(sideRoads ? /^(drslpe0[1-8]|droads[0-9]+|pave01)\./ : /^(prslpe0[1-4]|proad0[12])\./).test(member.member)) continue;
        const sourceEdition = member.sourceHashes[edition] ? edition : 'yr';
        const source = new TmpFile(resolveMember(trees[sourceEdition], member.member).file);
        assert.equal(sha(source.sourceBytes!), member.sourceHashes[sourceEdition]);
        assert.equal(JSON.stringify(source.images.map((_, index) => nativeTerrainMetadata(source, index))), JSON.stringify(member.images));
        const frames = source.images.map((image, index) => {
            const metadata = nativeTerrainMetadata(source, index);
            const native = new TmpDrawable().draw(image as any, source.blockWidth, source.blockHeight);
            const rgba = new Uint8Array(native.data.length * 4);
            native.data.forEach((value, pixel) => {
                const color = palette.getColor(value);
                rgba.set([color.r, color.g, color.b, value ? 255 : 0], pixel * 4);
            });
            const file = `${theater}/${member.member}-${index}.rgba`;
            writeFileSync(path.join(output, file), rgba, { flag: 'wx' });
            return { metadata, file, sha256: sha(rgba), empty: source.emptySlots.includes(index),
                zSha256: image.zData ? sha(image.zData) : null };
        });
        records.push({ member: member.member, group: group.id, sourceHashes: member.sourceHashes, frames });
    }
    if (sideRoads && !records.some(record => record.member === 'drslpe04.urb')) {
        const name = 'drslpe04.urb', original = resolveMember(trees.ra2, name).file;
        const source = new TmpFile(original), digest = sha(original.getBytes());
        assert.equal(sha(resolveMember(trees.yr, name).file.getBytes()), digest, 'Independent YR source identity must match');
        const frames = source.images.map((image, index) => {
            const metadata = nativeTerrainMetadata(source, index);
            const native = new TmpDrawable().draw(image as any, source.blockWidth, source.blockHeight);
            const rgba = new Uint8Array(native.data.length * 4);
            native.data.forEach((value, pixel) => {
                const color = palette.getColor(value);
                rgba.set([color.r, color.g, color.b, value ? 255 : 0], pixel * 4);
            });
            const file = `${theater}/${name}-${index}.rgba`; writeFileSync(path.join(output, file), rgba, { flag: 'wx' });
            return { metadata, file, sha256: sha(rgba), empty: source.emptySlots.includes(index), zSha256: image.zData ? sha(image.zData) : null };
        });
        const group = manifest.groups.find((group: any) => group.members.some((member: any) => member.member === 'drslpe03.urb'))!;
        records.push({ member: name, group: group.id, sourceHashes: { ra2: digest, yr: digest }, frames, newMember: true } as any);
    }
    packs.push({ theater, selector, pointer, palette: { member: paletteName, sha256: sha(paletteFile.getBytes()) }, records });
}
writeFileSync(path.join(output, 'source.json'), JSON.stringify({ schema: 'native-road-contacts-v54', packs,
    policy: 'Reconstruct whole-member marking geometry and reuse accepted asphalt. Native theater palettes, source indices, alpha, depth, ramps and rules remain authoritative.' }, null, 2), { flag: 'wx' });
console.log(JSON.stringify(packs.map(pack => ({ theater: pack.theater, members: pack.records.length,
    frames: pack.records.reduce((sum, member) => sum + member.frames.length, 0), palette: pack.palette.member }))));
