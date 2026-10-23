// Preserve source-pinned native guides for existing accepted Temperate style references.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { TmpFile } from '../../src/data/TmpFile';
import { Palette } from '../../src/data/Palette';
import { TmpDrawable } from '../../src/engine/gfx/drawable/TmpDrawable';
import { nativeTerrainMetadata } from '../../src/engine/renderable/entity/map/terrainHdContract';

const [root, ...members] = process.argv.slice(2);
assert(root && members.length && new Set(members).size === members.length);
const sha = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const pointer = JSON.parse(readFileSync('.local/terrain-selection.json', 'utf8'));
const packBytes = readFileSync(join('.local/terrain-packs', pointer.revision, 'manifest.json'));
assert.equal(sha(packBytes), pointer.sha256);
const pack = JSON.parse(packBytes.toString());
const tree = editionRetailTree(new Map(['ra2.mix', 'language.mix', 'multi.mix'].map(name =>
    [name, readFileSync(`.local/assets/ra2/${name}`)])), 'ra2');
const paletteSource = resolveMember(tree, 'isotem.pal').file, palette = new Palette(paletteSource);
mkdirSync(root); mkdirSync(join(root, 'native'));
const sources = members.map(member => {
    const selected = pack.groups.flatMap((group: any) => group.members).find((row: any) => row.member === member);
    assert(selected, 'Style references must be selected accepted artwork');
    const file = resolveMember(tree, member).file, bytes = file.getBytes();
    assert.equal(sha(bytes), selected.sourceHashes.ra2);
    const tmp = new TmpFile(file), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const images = tmp.images.map((image, slot) => {
        const bitmap = new TmpDrawable().draw(image as any, tmp.blockWidth, tmp.blockHeight);
        const rgba = new Uint8Array(bitmap.data.length * 4);
        bitmap.data.forEach((index, pixel) => {
            const color = palette.colors[index];
            rgba.set([color.r, color.g, color.b, index ? 255 : 0], pixel * 4);
        });
        const filename = `${member}-${slot}.rgba`;
        writeFileSync(join(root, 'native', filename), rgba, { flag: 'wx' });
        return { ...nativeTerrainMetadata(tmp, slot), nativeOffset: view.getInt32(16 + slot * 4, true),
            file: filename, rgbaSha256: sha(rgba) };
    });
    return { member, sha256: sha(bytes), images };
});
writeFileSync(join(root, 'source.json'), JSON.stringify({ theater: 'TEMPERATE',
    schema: 'm2-4-accepted-temperate-style-native-guides-v1', acceptedPack: pointer,
    paletteSha256: sha(paletteSource.getBytes()), sources, status: 'REFERENCE_ONLY_NO_NEW_ART_OR_SELECTION' }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ sources: sources.length, acceptedPack: pointer }));
