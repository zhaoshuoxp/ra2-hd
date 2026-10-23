// Prove complete decoded original overlay geometry/colors before any accepted-art aliasing.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { ShpFile } from '../../src/data/ShpFile';
import { Palette } from '../../src/data/Palette';
import { VirtualFile } from '../../src/data/vfs/VirtualFile';

const root = '.artifacts/m2-4/remaining-overlays-batch82-preparation-20261019';
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const inventoryFile = '.artifacts/m2-4/accepted-faction-routing-batches79-80-20261019/inventory-current-v1/inventory.json';
const inventory = read(inventoryFile);
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const trees = ['yr', 'ra2'].map(edition => editionRetailTree(top, edition as 'yr' | 'ra2'));
const resolved = new Map<string, any>();
function original(member: string, expected: string) {
    const key = member+':'+expected;
    if (resolved.has(key)) return resolved.get(key);
    for (const tree of trees) {
        if (!tree.some(owner => owner.mix.containsFile(member))) continue;
        const source = resolveMember(tree, member);
        if (sha(source.file.getBytes()) === expected) { resolved.set(key, source); return source; }
    }
    throw Error('Pinned original source unavailable: '+member);
}
function signatures(member: string, descriptor: any) {
    const raw = original(member, descriptor.sha256).file;
    const file = VirtualFile.fromBytes(raw.getBytes(), member);
    const shp = new ShpFile(file);
    assert.equal(shp.numImages, descriptor.totalFrames);
    assert.deepEqual([shp.width, shp.height], descriptor.canvas);
    const paletteFile = original(descriptor.palette.member, descriptor.palette.sha256).file;
    const palette = new Palette(paletteFile.getBytes());
    const frames = shp.images.map((image: any, index: number) => {
        const framePalette = descriptor.framePalettes?.[String(index)];
        if (framePalette) {
            assert.equal(framePalette.role, 'body');
            assert.equal(framePalette.runtimeUsed, true);
            assert.equal(framePalette.remapable, descriptor.remapable);
            assert.equal(framePalette.sha256, descriptor.palette.sha256,
                'Alternate frame palettes require separate explicit proof');
        }
        const rgba = new Uint8Array(image.imageData.length*4);
        const owner = new Uint8Array(image.imageData.length);
        const canvas = new Uint8Array(shp.width * shp.height * 4);
        const shadow = descriptor.hasShadow && index >= shp.numImages / 2;
        assert.equal(image.imageData.length, image.width * image.height);
        image.imageData.forEach((value: number, pixel: number) => {
            const color = palette.colors[value];
            rgba.set(value ? [shadow ? 0 : color.r, shadow ? 0 : color.g,
                shadow ? 0 : color.b, 255] : [0, 0, 0, 0], pixel*4);
            owner[pixel] = descriptor.remapable && value >= 16 && value <= 31 ? value : 0;
            const x = image.x + pixel % image.width, y = image.y + Math.floor(pixel / image.width);
            assert(x >= 0 && x < shp.width && y >= 0 && y < shp.height);
            canvas.set(rgba.subarray(pixel * 4, pixel * 4 + 4), (y * shp.width + x) * 4);
        });
        return { index, origin: [image.x, image.y], size: [image.width, image.height],
            rgbaSha256: sha(rgba), ownerSha256: sha(owner), canvasSha256: sha(canvas), shadow };
    });
    return { canvas: descriptor.canvas, totalFrames: descriptor.totalFrames,
        hasShadow: descriptor.hasShadow, remapable: descriptor.remapable, frames };
}
const donors: any[] = [];
for (const theater of ['TEMPERATE', 'SNOW', 'URBAN']) {
    const contractFile = theater === 'TEMPERATE' ? 'desktop/environment-hd-contract.json'
        : `desktop/environment-${theater.toLowerCase()}-hd-contract.json`;
    const contract = read(contractFile);
    const packFile = `.local/environment-packs/${contract.selectedPack.revision}/manifest.json`;
    assert.equal(sha(readFileSync(packFile)), contract.selectedPack.sha256);
    for (const [family, declaration] of Object.entries(contract.families) as [string, any][]) {
        if (!declaration.kinds.includes('overlay')) continue;
        const members = declaration.members.map((member: string) => ({ member,
            source: contract.sources[member], raster: signatures(member, contract.sources[member]) }));
        donors.push({ theater, family, contractFile, contractSha256: sha(readFileSync(contractFile)),
            selectedPack: contract.selectedPack, familyHash: declaration.familyHash, identities: declaration.identities, members });
    }
}
const rows = [];
for (const group of inventory.resourceGroups.filter((g: any) => ['DESERT', 'NEWURBAN'].includes(g.theater)
        && g.kind === 'overlay' && g.decisions.includes('MISSING_AUTHORED_FAMILY'))) {
    const guide = read(`.artifacts/m2-4/${group.theater.toLowerCase()}-native-v1/source.json`);
    const sources = guide.sources.filter((s: any) => s.member === group.member && s.sha256 === group.sha256);
    assert.equal(sources.length, 1);
    const [source] = sources;
    const target = signatures(source.member, source);
    const comparisons = donors.flatMap(donor => donor.members.map((member: any) => {
        const a = target, b = member.raster;
        const geometry = JSON.stringify({ canvas: a.canvas, totalFrames: a.totalFrames,
            hasShadow: a.hasShadow, remapable: a.remapable,
            frames: a.frames.map((f: any) => [f.origin, f.size]) }) === JSON.stringify({
                canvas: b.canvas, totalFrames: b.totalFrames, hasShadow: b.hasShadow, remapable: b.remapable,
                frames: b.frames.map((f: any) => [f.origin, f.size]) });
        const exact = geometry && a.frames.every((frame: any, index: number) =>
            frame.rgbaSha256 === b.frames[index].rgbaSha256 && frame.ownerSha256 === b.frames[index].ownerSha256);
        const canvasExact = JSON.stringify(a.canvas) === JSON.stringify(b.canvas)
            && a.totalFrames === b.totalFrames && a.hasShadow === b.hasShadow && a.remapable === b.remapable
            && !a.remapable && a.frames.every((frame: any, index: number) => frame.canvasSha256 === b.frames[index].canvasSha256);
        const bodyCount = a.hasShadow ? a.totalFrames / 2 : a.totalFrames;
        const bodyExact = JSON.stringify(a.canvas) === JSON.stringify(b.canvas)
            && a.totalFrames === b.totalFrames && a.hasShadow === b.hasShadow && a.remapable === b.remapable
            && a.frames.slice(0, bodyCount).every((frame: any, index: number) =>
                JSON.stringify([frame.origin, frame.size]) === JSON.stringify([b.frames[index].origin, b.frames[index].size])
                && frame.rgbaSha256 === b.frames[index].rgbaSha256 && frame.ownerSha256 === b.frames[index].ownerSha256);
        return { donorTheater: donor.theater, donorFamily: donor.family, donorMember: member.member,
            donorSourceSha256: member.source.sha256, donorFamilyHash: donor.familyHash,
            geometryExact: geometry, allOriginalRgbaAndOwnerFramesExact: exact,
            completeLogicalCanvasExact: canvasExact,
            completeBodyFramesExactTargetNativeShadowMustRemain: bodyExact,
            rawSourceHashExact: source.sha256 === member.source.sha256,
            differingFrames: geometry ? a.frames.filter((f: any, index: number) =>
                f.rgbaSha256 !== b.frames[index].rgbaSha256 || f.ownerSha256 !== b.frames[index].ownerSha256).length : null };
    }));
    const stem = (name: string) => name.replace(/\.(tem|sno|urb|ubn|des)$/, '');
    const counterparts = comparisons.filter((c: any) => stem(c.donorMember) === stem(source.member));
    rows.push({ theater: group.theater, member: group.member, sourceSha256: source.sha256,
        sourcePalette: source.palette, sourceKey: group.key, identities: group.identities, maps: group.maps,
        completeOriginalRasterMatches: comparisons.filter((c: any) => c.allOriginalRgbaAndOwnerFramesExact),
        completeCanvasMatchesRepackingMayBeRequired: comparisons.filter((c: any) => c.completeLogicalCanvasExact),
        completeBodyMatchesTargetNativeShadowMustRemain: comparisons.filter((c: any) => c.completeBodyFramesExactTargetNativeShadowMustRemain),
        namedCounterpartComparisons: counterparts, status: comparisons.some((c: any) => c.allOriginalRgbaAndOwnerFramesExact)
            ? 'COMPLETE_ORIGINAL_RASTER_MATCH_CANDIDATE_FAMILY_CLOSURE_AND_RUNTIME_PENDING'
            : 'NO_EXACT_ACCEPTED_RASTER_NEW_ART_OR_EXPLICIT_ADAPTATION_REQUIRED' });
}
const file = root+'/complete-original-raster-equivalence-v3.json';
writeFileSync(file, JSON.stringify({ status: 'READ_ONLY_ORIGINAL_PROOF_NOT_RESOURCE_OR_COVERAGE_CHANGE',
    inventoryFile, inventorySha256: sha(readFileSync(inventoryFile)), rows, donors,
    resourcesChanged: false, coverageChanged: false, windows: 'NOT_RUN', m24Complete: false }, null, 2)+'\n', { flag: 'wx' });
console.log(JSON.stringify({ targetSourceGroups: rows.length,
    exactRasterCandidates: rows.filter(r => r.completeOriginalRasterMatches.length).length,
    completeCanvasCandidates: rows.filter(r => r.completeCanvasMatchesRepackingMayBeRequired.length).length,
    completeBodyCandidates: rows.filter(r => r.completeBodyMatchesTargetNativeShadowMustRemain.length).length,
    remaining: rows.filter(r => !r.completeOriginalRasterMatches.length).map(r => [r.theater, r.member]) }));
