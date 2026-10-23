// Verify the accepted faction wall authorities without re-authoring their artwork.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import allied from '../../desktop/allied-building-coverage.json';
import { sovietBuildingHdFamilies } from '../../src/engine/renderable/builder/sovietBuildingHdFamilies';
import { sovietBatchIdentities, sovietBatchRevisions } from '../../desktop/hd-profile.mjs';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';

const [prepared, output] = process.argv.slice(2);
assert(prepared && output);
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const native = read(path.join(prepared, 'source.json'));
const archiveNames = ['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix'];
const tree = editionRetailTree(new Map(archiveNames.map(name => [name,
    readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)])), 'yr');
const unitPalette = resolveMember(tree, 'unittem.pal').file.getBytes();
const rows = [], files: { file: string; sha256: string; bytes: number }[] = [];
const pin = (file: string, expected?: string) => {
    const bytes = readFileSync(file), digest = sha(bytes);
    if (expected) assert.equal(digest, expected);
    files.push({ file, sha256: digest, bytes: bytes.length });
    return bytes;
};
for (const name of ['GAWALL', 'NAWALL'] as const) {
    const member = name === 'GAWALL' ? 'guwall.shp' : 'nuwall.shp';
    const source = native.sources.find((row: any) => row.member === member);
    const descriptor = name === 'GAWALL' ? allied['gawall-temperate'] : sovietBuildingHdFamilies.NAWALL;
    const original = descriptor.members[0];
    assert.equal(source.sha256, original.sha256);
    assert.equal(source.totalFrames, original.frames * 2);
    pin(path.join(prepared, 'native', source.nativeFile), original.sha256);
    assert.equal(sha(resolveMember(tree, original.member).file.getBytes()), original.sha256);
    const palette = pin(path.join(prepared, 'native', source.palette.sha256 + '.pal'), source.palette.sha256);
    let bodyPixels = 0;
    for (const frame of source.frames.slice(0, original.frames)) {
        const indices = pin(path.join(prepared, 'native', frame.indexFile), frame.indexSha256);
        for (const index of indices) if (index && index !== 12) {
            bodyPixels++;
            for (let channel = 0; channel < 3; channel++)
                assert.equal(palette[index * 3 + channel], unitPalette[index * 3 + channel]);
        }
    }
    const familyFile = name === 'GAWALL' ? allied['gawall-temperate'].familyPath
        : `hd-packs/soviet-nawall-authored/${sovietBatchRevisions.nawall}/family.json`;
    const familyHash = name === 'GAWALL' ? allied['gawall-temperate'].familyHash : sovietBatchIdentities.nawall;
    const family = JSON.parse(pin(path.join('.local', familyFile), familyHash).toString());
    assert.equal(family.family, name);
    assert.equal(family.members.length, 1);
    const entry = family.members[0];
    const folder = path.join('.local/hd-packs', entry.packId, entry.revision);
    const manifest = JSON.parse(pin(path.join(folder, 'manifest.json'), entry.sha256).toString());
    assert.equal(manifest.source.sha256, source.sha256);
    assert.equal(manifest.logical.frames.length, original.frames);
    assert.deepEqual(manifest.logical.canvas, source.canvas);
    assert.deepEqual(manifest.logical.frames, source.frames.slice(0, original.frames).map((frame: any) => ({
        nativeFrame: frame.slot, trimOrigin: frame.origin, trimSize: frame.size,
        legacyRenderSize: frame.size.map((value: number) => value + value % 2), empty: frame.empty,
    })));
    assert(manifest.variants.some((variant: any) => variant.density === 4));
    for (const variant of manifest.variants) for (const page of variant.pages)
        for (const role of ['base', 'data', 'map']) if (page[role])
            pin(path.join(folder, page[role]), page[role + 'Sha256']);
    rows.push({ identity: name, member, sourceSha256: source.sha256, bodyFrames: original.frames,
        bodyPixels, shadowFrames: original.frames, familyFile, familyHash,
        manifestSha256: entry.sha256, authoredDensities: manifest.variants.map((variant: any) => variant.density),
        twoX: manifest.variants.some((variant: any) => variant.density === 2)
            ? 'Accepted authored 2X page; verify actual binding in packaged Mac.'
            : 'Existing accepted resolver derives native 2X from the authored 4X page and retains categorical data; verify actual binding in packaged Mac.' });
}
const receipt = { status: 'PASS_ACCEPTED_WALL_SOURCE_PALETTE_FRAME_GEOMETRY_AND_PAYLOAD_PINS',
    rows, files, resourcesChanged: false, nativeBinding: 'PENDING', artworkAcceptance: 'REUSED_ACCEPTED',
    policy: 'The two 48-body-frame faction families remain outside the environment pack; exact whole native sources also preserve all shadows and owner indices.' };
writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ walls: rows.length, pinnedFiles: files.length }));
