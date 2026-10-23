// Retain exact donor indices and palettes for bounded reuse, never as replacement HD detail.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ShpFile } from '../../src/data/ShpFile';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';

const root = '.artifacts/m2-4/newurban-anchored-buildings-batch91-20261020/accepted-native-donors-v1';
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const pin = (file: string) => ({ file, sha256: sha(readFileSync(file)), bytes: readFileSync(file).length });
const preparationFile = '.artifacts/m2-4/newurban-anchored-buildings-batch91-20261020/source-preparation-v1.json';
const prep = read(preparationFile);
const contracts = Object.fromEntries(['urban', 'desert'].map(theater =>
    [theater, read(`desktop/environment-${theater}-hd-contract.json`)]));
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const trees = ['yr', 'ra2'].map(edition => editionRetailTree(top, edition as 'yr' | 'ra2'));
function exact(name: string, expected: string) {
    for (const tree of trees) if (tree.some(({ mix }) => mix.containsFile(name))) {
        const file = resolveMember(tree, name).file;
        if (sha(file.getBytes()) === expected) return file;
    }
    throw Error(`Pinned donor unavailable: ${name} ${expected}`);
}
mkdirSync(root, { recursive: false });
const sources = prep.records.map((record: any) => {
    const descriptor = contracts[record.donorTheater].sources[record.donorMember];
    const original = exact(record.donorMember, descriptor.sha256), shp = new ShpFile(original);
    const directory = path.join(root, record.donorMember.replace('.', '-'));
    mkdirSync(directory);
    const file = path.join(directory, record.donorMember);
    writeFileSync(file, original.getBytes(), { flag: 'wx' });
    const frames = Array.from({ length: descriptor.bodyFrames }, (_, slot) => {
        const image = shp.images[slot];
        const palette = descriptor.framePalettes?.[String(slot)] ?? descriptor.palette;
        const paletteFile = path.join(directory, palette.sha256 + '.pal');
        try { assert.equal(sha(readFileSync(paletteFile)), palette.sha256); }
        catch { writeFileSync(paletteFile, exact(palette.member, palette.sha256).getBytes(), { flag: 'wx' }); }
        const indexFile = path.join(directory, `${slot}.index`);
        writeFileSync(indexFile, image.imageData, { flag: 'wx' });
        return { slot, origin: [image.x, image.y], size: [image.width, image.height],
            index: pin(indexFile), palette: pin(paletteFile) };
    });
    return { targetMember: record.member, donorMember: record.donorMember, original: pin(file),
        descriptor, frames, acceptedMetadata: record.donorMetadata };
});
writeFileSync(path.join(root, 'source.json'), JSON.stringify({
    status: 'EXACT_ACCEPTED_DONOR_NATIVE_INPUTS_FOR_REUSE_AUDIT', preparation: pin(preparationFile), sources,
    originalArchivesEdited: false, newHdArtwork: false
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ donors: sources.length, frames: sources.reduce((sum: number, source: any) => sum + source.frames.length, 0) }));
