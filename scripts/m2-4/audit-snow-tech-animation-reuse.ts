// Compare original component pixels before reusing accepted technology animations.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { ShpFile } from '../../src/data/ShpFile';

const [nativeRoot, output] = process.argv.slice(2);
assert(nativeRoot && output);
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const native = read(path.join(nativeRoot, 'source.json'));
assert.equal(native.theater, 'SNOW');
const contract = read('desktop/environment-hd-contract.json');
const root = path.join('.local/environment-packs', contract.selectedPack.revision);
const manifest = read(path.join(root, 'manifest.json'));
assert.equal(sha(readFileSync(path.join(root, 'manifest.json'))), contract.selectedPack.sha256);
const names = ['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix'];
const tree = editionRetailTree(new Map(names.map(name => [name,
    readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)])), 'yr');
const rows = [];
for (const source of native.sources.filter((s: any) => !s.member.endsWith('_f.shp')
    && s.bindings.every((b: any) => b.role !== 'body'))) {
    const snow = source.member, temp = snow[0] + 't' + snow.slice(2);
    const declaration = contract.sources[temp];
    if (!declaration) {
        rows.push({ snow, temp, status: 'NO_ACCEPTED_COMPONENT_DONOR' });
        continue;
    }
    const currentFile = resolveMember(tree, snow).file, originalFile = resolveMember(tree, temp).file;
    assert.equal(sha(currentFile.getBytes()), source.sha256);
    assert.equal(sha(originalFile.getBytes()), declaration.sha256);
    const current = new ShpFile(currentFile), original = new ShpFile(originalFile);
    const bodyCount = current.numImages / (source.hasShadow ? 2 : 1);
    const canvasMatches = current.width === original.width && current.height === original.height;
    const fixed = new Set<number>(), differences = [], pixelDifferences = [], sizeDifferences = [], originDifferences = [];
    for (let slot = 0; slot < Math.max(bodyCount, declaration.bodyFrames); slot++) {
        const a = slot < declaration.bodyFrames ? original.images[slot] : undefined;
        const b = slot < bodyCount ? current.images[slot] : undefined;
        if (!a || !b || [a.x, a.y, a.width, a.height].some((n, i) => n !== [b.x, b.y, b.width, b.height][i])
            || sha(a.imageData) !== sha(b.imageData)) differences.push(slot);
        if (!a || !b || sha(a.imageData) !== sha(b.imageData)) pixelDifferences.push(slot);
        if (!a || !b || a.width !== b.width || a.height !== b.height) sizeDifferences.push(slot);
        if (!a || !b || a.x !== b.x || a.y !== b.y) originDifferences.push(slot);
        if (b) for (const index of b.imageData) if (index && (index < 16 || index > 31)) fixed.add(index);
    }
    const snowPalette = resolveMember(tree, source.palette.member).file.getBytes();
    const tempPalette = resolveMember(tree, declaration.palette.member).file.getBytes();
    assert.equal(sha(snowPalette), source.palette.sha256);
    assert.equal(sha(tempPalette), declaration.palette.sha256);
    const paletteDifferences = [...fixed].filter(index => [0, 1, 2]
        .some(channel => snowPalette[index * 3 + channel] !== tempPalette[index * 3 + channel]));
    const entries = (Object.values(manifest.families) as any[]).flatMap(f => f.members)
        .filter(m => m.member === temp);
    assert.equal(new Set(entries.map(m => m.path)).size, 1);
    const metadataPath = path.join(root, entries[0].path);
    assert.equal(sha(readFileSync(metadataPath)), entries[0].sha256);
    const metadata = read(metadataPath);
    const payloads = [];
    for (const variant of metadata.variants) for (const page of variant.pages) for (const role of ['base', 'data']) {
        const file = path.join(path.dirname(metadataPath), String(variant.density), page.id, role + '.png');
        assert.equal(sha(readFileSync(file)), page[role + 'Sha256']);
        payloads.push({ path: file, sha256: page[role + 'Sha256'] });
    }
    const remapMatches = source.remapable === declaration.remapable;
    rows.push({ snow, temp, snowSourceSha256: source.sha256, tempSourceSha256: declaration.sha256,
        canvasMatches, bodyFrames: [bodyCount, declaration.bodyFrames], differingFrames: differences,
        differingPixelFrames: pixelDifferences, differingTrimSizeFrames: sizeDifferences,
        differingOriginFrames: originDifferences,
        usedFixedPaletteEntries: fixed.size, differingFixedPaletteEntries: paletteDifferences, remapMatches,
        acceptedMetadata: metadataPath, acceptedMetadataSha256: entries[0].sha256, payloads,
        status: canvasMatches && remapMatches && !differences.length && !paletteDifferences.length
            ? 'ELIGIBLE_EXACT_COMPONENT_MATERIAL_REUSE_COMPLETE_FAMILY_PENDING' : 'DISTINCT_SOURCE_COMPONENT_AUTHORING_REQUIRED',
        placementPolicy: 'Target original art offsets, logical state roles, shadows and animation timing remain authoritative.' });
}
writeFileSync(output, JSON.stringify({ status: 'PASS_READ_ONLY_ORIGINAL_COMPONENT_COMPARISON',
    nativeSourceSha256: sha(readFileSync(path.join(nativeRoot, 'source.json'))), acceptedTemperate: contract.selectedPack,
    rows, completeFamiliesPublished: 0, policy: 'Eligibility only; no resource, source, selector or prepared cache is changed.' }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ components: rows.length,
    eligible: rows.filter(r => r.status.startsWith('ELIGIBLE')).length,
    distinct: rows.filter(r => r.status.startsWith('DISTINCT')).length }));
