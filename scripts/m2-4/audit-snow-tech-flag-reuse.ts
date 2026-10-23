// Prove component reuse before authoring complete Snow technology-building families.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { ShpFile } from '../../src/data/ShpFile';

const [output] = process.argv.slice(2);
assert(output);
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const names = ['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix'];
const top = new Map(names.map(name => [name,
    readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const tree = editionRetailTree(top, 'yr');
const native = read('.artifacts/m2-4/snow-native-v1/source.json');
const contract = read('desktop/environment-hd-contract.json');
const root = path.join('.local/environment-packs', contract.selectedPack.revision);
const manifest = read(path.join(root, 'manifest.json'));
assert.equal(sha(readFileSync(path.join(root, 'manifest.json'))), contract.selectedPack.sha256);
const snowPalette = resolveMember(tree, 'unitsno.pal').file.getBytes();
const tempPalette = resolveMember(tree, 'unittem.pal').file.getBytes();
const rows = [];
for (const snow of ['caoild_f.shp', 'cahosp_f.shp', 'caairp_f.shp', 'caoutp_f.shp']) {
    const temp = snow[0] + 't' + snow.slice(2);
    const source = native.sources.find((s: any) => s.member === snow);
    assert(source);
    assert.equal(sha(snowPalette), source.palette.sha256);
    assert.equal(sha(tempPalette), contract.sources[temp].palette.sha256);
    assert.equal(source.remapable, contract.sources[temp].remapable);
    const a = resolveMember(tree, temp), b = resolveMember(tree, snow);
    assert.equal(sha(a.file.getBytes()), contract.sources[temp].sha256);
    assert.equal(sha(b.file.getBytes()), source.sha256);
    const original = new ShpFile(a.file), current = new ShpFile(b.file);
    assert.deepEqual([original.width, original.height], [current.width, current.height]);
    const entries = (Object.values(manifest.families) as any[]).flatMap(f => f.members)
        .filter(m => m.member === temp);
    assert.equal(new Set(entries.map(m => m.path)).size, 1);
    const metadataPath = path.join(root, entries[0].path);
    assert.equal(sha(readFileSync(metadataPath)), entries[0].sha256);
    const hd = read(metadataPath);
    assert.equal(hd.source.sha256, contract.sources[temp].sha256);
    assert.deepEqual(hd.variants.map((variant: any) => variant.density), [2, 4]);
    const fixed = new Set<number>();
    for (let slot = 0; slot < 16; slot++) {
        const old = original.images[slot], frame = current.images[slot];
        assert.deepEqual([old.x, old.y, old.width, old.height], [frame.x, frame.y, frame.width, frame.height]);
        assert.equal(sha(old.imageData), sha(frame.imageData));
        assert.deepEqual(hd.logical.frames[slot].trimOrigin, [frame.x, frame.y]);
        assert.deepEqual(hd.logical.frames[slot].trimSize, [frame.width, frame.height]);
        for (const index of frame.imageData) if (index && (index < 16 || index > 31)) fixed.add(index);
    }
    for (const index of fixed) for (let channel = 0; channel < 3; channel++)
        assert.equal(snowPalette[index * 3 + channel], tempPalette[index * 3 + channel]);
    const bodyCount = current.numImages / (source.hasShadow ? 2 : 1);
    const appendedEmptySlots = [];
    for (let slot = hd.logical.frames.length; slot < bodyCount; slot++) {
        const frame = current.images[slot];
        assert.equal(frame.width * frame.height, 0);
        assert.equal(frame.imageData.length, 0);
        appendedEmptySlots.push({ slot, origin: [frame.x, frame.y], size: [frame.width, frame.height] });
    }
    assert(hd.logical.frames.length <= bodyCount);
    const payloads = [];
    for (const variant of hd.variants) for (const page of variant.pages) for (const role of ['base', 'data']) {
        const file = path.join(path.dirname(metadataPath), String(variant.density), page.id, role + '.png');
        assert.equal(sha(readFileSync(file)), page[role + 'Sha256']);
        payloads.push({ path: file, sha256: page[role + 'Sha256'] });
    }
    rows.push({ snow, temp, snowSourceSha256: source.sha256, tempSourceSha256: hd.source.sha256,
        acceptedMetadata: metadataPath, acceptedMetadataSha256: entries[0].sha256,
        snowBodyFrames: bodyCount, acceptedBodyFrames: hd.logical.frames.length,
        identicalNonemptyBodyFrames: 16, fixedPaletteEntriesMatched: fixed.size, appendedEmptySlots,
        shadowPolicy: source.hasShadow ? 'Exact separate original Snow shadows' : 'Original no-shadow declaration',
        payloads, status: 'ELIGIBLE_ACCEPTED_FLAG_MATERIAL_REUSE; COMPLETE_TECH_FAMILY_NOT_PUBLISHED' });
}
writeFileSync(output, JSON.stringify({ status: 'PASS_SOURCE_GEOMETRY_INDICES_FIXED_PALETTE_AND_ACCEPTED_PAYLOADS',
    rows, acceptedTemperate: contract.selectedPack, paletteHashes: { snow: sha(snowPalette), temp: sha(tempPalette) },
    policy: 'Read-only proof. No artwork or metadata is changed and no coverage is counted. Oil/outpost require their exact additional empty logical slots; all four require new Snow metadata and fresh preparation. Complete technology families also need their new Snow bodies and linked animations.' }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(rows.map(({ payloads, appendedEmptySlots, ...row }) => ({ ...row, appendedEmptySlots: appendedEmptySlots.length }))));
