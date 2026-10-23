// Decode unchanged imported Temperate component guides for bounded reuse review.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { ShpFile } from '../../src/data/ShpFile';

const [nativeRoot, outputRoot] = process.argv.slice(2);
assert(nativeRoot && outputRoot);
const sha = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const nativeFile = path.join(nativeRoot, 'source.json');
const native = JSON.parse(readFileSync(nativeFile, 'utf8'));
const contract = JSON.parse(readFileSync('desktop/environment-hd-contract.json', 'utf8'));
const names = ['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix'];
const tree = editionRetailTree(new Map(names.map(name => [name,
    readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)])), 'yr');
mkdirSync(outputRoot);
const sources = [];
for (const source of native.sources) {
    const member = source.member[0] + 't' + source.member.slice(2);
    const declaration = contract.sources[member];
    assert(declaration);
    const original = resolveMember(tree, member).file;
    assert.equal(sha(original.getBytes()), declaration.sha256);
    const shp = new ShpFile(original), frames = [];
    const palette = resolveMember(tree, declaration.palette.member).file.getBytes();
    assert.equal(sha(palette), declaration.palette.sha256);
    writeFileSync(path.join(outputRoot, declaration.palette.sha256 + '.pal'), palette);
    for (let slot = 0; slot < declaration.bodyFrames; slot++) {
        const image = shp.images[slot], file = `${member}-${slot}.index`;
        writeFileSync(path.join(outputRoot, file), image.imageData);
        frames.push({ slot, origin: [image.x, image.y], size: [image.width, image.height],
            file, indexSha256: sha(image.imageData) });
    }
    sources.push({ snow: source.member, member, sha256: declaration.sha256,
        canvas: [shp.width, shp.height], palette: declaration.palette, frames });
}
writeFileSync(path.join(outputRoot, 'source.json'), JSON.stringify({
    schema: 'm2-4-original-component-comparison-guides-v1',
    nativeSourceSha256: sha(readFileSync(nativeFile)), acceptedContractSha256:
        sha(readFileSync('desktop/environment-hd-contract.json')), sources,
    policy: 'Original indexed comparison guides only; no HD art or resource selection changed.'
}, null, 2) + '\n');
console.log(JSON.stringify({ originalGuides: sources.length }));
