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
assert(output, 'Usage: prepare-road-marking-repair.ts <new-output-directory>');
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
    const selector = `.local/terrain-${theater === 'temperate' ? '' : theater + '-'}selection.json`;
    const pointer = read(selector), root = `.local/terrain-packs/${pointer.revision}`;
    assert.equal(sha(readFileSync(`${root}/manifest.json`)), pointer.sha256);
    const manifest = read(`${root}/manifest.json`), records = [];
    mkdirSync(path.join(output, theater));
    const edition = theater === 'newurban' || theater === 'desert' ? 'yr' : 'ra2';
    const paletteFile = resolveMember(trees[edition], paletteName).file;
    const palette = new Palette(paletteFile);
    for (const group of manifest.groups) for (const member of group.members) {
        if (!/^(proad|prslpe|p_end|pave|droad|drslpe|rough)/.test(member.member)) continue;
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
    packs.push({ theater, pointer, palette: { member: paletteName, sha256: sha(paletteFile.getBytes()) }, records });
}
writeFileSync(path.join(output, 'source.json'), JSON.stringify({ schema: 'road-marking-repair-source-v1', packs,
    policy: 'Reconstruct whole-member marking geometry and reuse accepted asphalt. Native theater palettes, source indices, alpha, depth, ramps and rules remain authoritative.' }, null, 2), { flag: 'wx' });
console.log(JSON.stringify(packs.map(pack => ({ theater: pack.theater, members: pack.records.length,
    frames: pack.records.reduce((sum, member) => sum + member.frames.length, 0), palette: pack.palette.member }))));
