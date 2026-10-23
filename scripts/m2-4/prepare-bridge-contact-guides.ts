// Preserve source-pinned main road blocks separately from overlapping bridge extra data.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Palette } from '../../src/data/Palette';
import { TmpFile } from '../../src/data/TmpFile';
import { TmpDrawable } from '../../src/engine/gfx/drawable/TmpDrawable';
import { nativeTerrainMetadata } from '../../src/engine/renderable/entity/map/terrainHdContract';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';

const [output, ...members] = process.argv.slice(2);
assert(output && members.length && new Set(members).size === members.length);
const suffix = members[0].split('.').at(-1);
assert(members.every(member => member.endsWith(`.${suffix}`)), 'Use one source theater per guide');
assert(suffix === 'ubn' || suffix === 'tem');
const theater = suffix === 'ubn' ? 'NEWURBAN' : 'TEMPERATE';
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const names = ['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix'];
const tree = editionRetailTree(new Map(names.map(name => [name,
    readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)])), 'yr');
const paletteFile = resolveMember(tree, suffix === 'ubn' ? 'isoubn.pal' : 'isotem.pal').file;
const palette = new Palette(paletteFile);
mkdirSync(output);
const sources = members.map(member => {
    const file = resolveMember(tree, member).file;
    const tmp = new TmpFile(file), bytes = file.getBytes();
    const offsets = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const rawName = member + '.source';
    writeFileSync(join(output, rawName), bytes, { flag: 'wx' });
    const images = tmp.images.map((image, index) => {
        const bitmap = new TmpDrawable().draw({ ...image, hasExtraData: false }, tmp.blockWidth, tmp.blockHeight);
        const rgba = new Uint8Array(bitmap.data.length * 4);
        bitmap.data.forEach((value, pixel) => {
            const color = palette.colors[value];
            rgba.set([color.r, color.g, color.b, value ? 255 : 0], pixel * 4);
        });
        const filename = `${member}-${index}-main.rgba`;
        writeFileSync(join(output, filename), rgba, { flag: 'wx' });
        const indexed = Uint8Array.from(bitmap.data), indexFile = `${member}-${index}-main.indices`;
        writeFileSync(join(output, indexFile), indexed, { flag: 'wx' });
        return { ...nativeTerrainMetadata(tmp, index), nativeOffset: offsets.getInt32(16 + index * 4, true),
            main: { file: filename, size: [tmp.blockWidth, tmp.blockHeight], sha256: sha(rgba),
                indexFile, indexSha256: sha(indexed) } };
    });
    return { member, sha256: sha(bytes), rawFile: rawName, images };
});
writeFileSync(join(output, 'source.json'), JSON.stringify({
    schema: 'm2-4-source-pinned-road-main-block-guides-v1', theater,
    paletteSha256: sha(paletteFile.getBytes()), sources,
    policy: 'Read-only source copies and native main-block guides. Extra data, source numbering and runtime files are unchanged.',
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: 'PASS_PINNED_MAIN_BLOCK_GUIDES', members: sources.length }));
