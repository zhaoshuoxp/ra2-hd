// Follow geometry/depth candidates with rendered material evidence, not source-byte equality.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { TmpFile } from '../../src/data/TmpFile';
import { Palette } from '../../src/data/Palette';
import { TmpDrawable } from '../../src/engine/gfx/drawable/TmpDrawable';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';

const root = '.artifacts/m2-4/newurban-tmp-material-reuse-batch93-20261020';
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const pin = (file: string) => ({ file, sha256: sha(readFileSync(file)), bytes: readFileSync(file).length });
const inventoryFile = '.artifacts/m2-4/newurban-anchored-buildings-batch91-20261020/inventory-reconciliation-v1.json';
const geometryFile = '.artifacts/m2-4/structures-batches76-77-v1/temperate-cross-name-reuse-audit-v1.json';
const guideFile = '.artifacts/m2-4/newurban-native-v1/source.json';
const missing = read(inventoryFile).remainingGaps.filter((gap: any) => gap.kind === 'tmp');
const guide = read(guideFile), geometry = read(geometryFile);
const pointer = read('.local/terrain-selection.json');
assert.deepEqual(pointer, geometry.donor);
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const trees = new Map((['ra2', 'yr'] as const).map(edition => [edition, editionRetailTree(top, edition)]));
const palettes = new Map((['ra2', 'yr'] as const).map(edition => [edition,
    new Palette(resolveMember(trees.get(edition)!, 'isotem.pal').file)]));
const targetPalette = new Palette(resolveMember(trees.get('yr')!, 'isoubn.pal').file);
const rows = missing.map((gap: any) => {
    const source = guide.sources.find((source: any) => source.member === gap.member && source.sha256 === gap.sha256);
    const proof = geometry.rows.find((row: any) => row.theater === 'NEWURBAN' && row.member === gap.member);
    assert(source && proof);
    const candidate = proof.geometryOnlyCandidates.find((candidate: any) =>
        candidate.member === gap.member.replace(/\.ubn$/, '.tem'));
    if (!candidate) return { member: gap.member, set: source.setIndex, status: 'NO_SAME_NAME_COMPLETE_GEOMETRY_MATCH',
        geometryCandidates: proof.geometryOnlyCandidates.length, newArtNeeded: 'NOT_DETERMINED_BY_THIS_AUDIT' };
    const targetFile = resolveMember(trees.get('yr')!, source.member).file;
    const donorFile = resolveMember(trees.get(candidate.edition as 'yr' | 'ra2')!, candidate.member).file;
    assert.equal(sha(targetFile.getBytes()), source.sha256);
    assert.equal(sha(donorFile.getBytes()), candidate.sourceSha256);
    const target = new TmpFile(targetFile), donor = new TmpFile(donorFile);
    let alphaDifferences = 0, fixedRgbDifferences = 0, count = 0;
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, squaredDifference = 0;
    const oldMean = [0, 0, 0], newMean = [0, 0, 0], pairs = new Map<string, number>();
    const frames = source.images.filter((image: any) => image.nativeOffset > 0).map((image: any) => {
        const slot = image.subTile, a = donor.images[slot], b = target.images[slot];
        assert(a && b);
        const aa = new TmpDrawable().draw(a as any, donor.blockWidth, donor.blockHeight);
        const bb = new TmpDrawable().draw(b as any, target.blockWidth, target.blockHeight);
        assert.equal(aa.data.length, bb.data.length);
        for (let i = 0; i < aa.data.length; i++) {
            const u = aa.data[i], v = bb.data[i];
            if (!!u !== !!v) alphaDifferences++;
            if (!u || !v) continue;
            const ac = palettes.get(candidate.edition as 'yr' | 'ra2')!.colors[u], bc = targetPalette.colors[v];
            const av = [ac.r, ac.g, ac.b], bv = [bc.r, bc.g, bc.b];
            if (av.some((n, channel) => n !== bv[channel])) fixedRgbDifferences++;
            const x = av.reduce((a, b) => a + b) / 3, y = bv.reduce((a, b) => a + b) / 3;
            sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; count++;
            for (let c = 0; c < 3; c++) {
                oldMean[c] += av[c]; newMean[c] += bv[c];
                squaredDifference += (av[c] - bv[c]) ** 2;
            }
            const key = [...av, ...bv].join(',');
            pairs.set(key, (pairs.get(key) ?? 0) + 1);
        }
        return { slot, targetDepth: b.zData ? sha(b.zData) : null, donorDepth: a.zData ? sha(a.zData) : null };
    });
    const variance = Math.sqrt((count * sxx - sx * sx) * (count * syy - sy * sy));
    const correlation = variance > 0 ? (count * sxy - sx * sy) / variance : null;
    return { member: gap.member, set: source.setIndex, sourceSha256: source.sha256,
        donor: candidate, status: 'MATERIAL_SCREEN_ONLY_NATIVE_RULES_AND_DEPTH_TARGET_OWNED',
        visibleSamples: count, alphaDifferences, fixedRgbDifferences, luminanceCorrelation: correlation,
        originalRgbRmse: Math.sqrt(squaredDifference / Math.max(1, count * 3)),
        sourceMeanRgb: newMean.map(n => n / Math.max(1, count)), donorMeanRgb: oldMean.map(n => n / Math.max(1, count)),
        nativeColorPairs: [...pairs].map(([pair, count]) => ({ rgb: pair.split(',').map(Number), count })), frames,
        newArtNeeded: 'NOT_DETERMINED_BY_THIS_AUDIT' };
});
mkdirSync(root, { recursive: false });
writeFileSync(`${root}/material-reuse-screen-v1.json`, JSON.stringify({
    status: 'READ_ONLY_MATERIAL_SCREEN_NO_NEW_COVERAGE_OR_SELECTION', inventory: pin(inventoryFile),
    originalGuide: pin(guideFile), completeGeometryProof: pin(geometryFile), acceptedTemperate: pointer, rows,
    policy: 'Geometry and actual native RGB/alpha evidence distinguish accepted-material adaptation from incompatible source shapes. Correlation alone is not eligibility. Inspect defining surfaces, complete subtiles, target depth and seams before any selection. No maps, resources, budgets or prepared data changed.',
    windows: 'NOT_RUN', m24Complete: false
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ members: rows.length, sameNameGeometry: rows.filter((r: any) => r.frames).length,
    exactAlphaHighCorrelation: rows.filter((r: any) => r.frames && !r.alphaDifferences && r.luminanceCorrelation >= .98)
        .map((r: any) => ({ member: r.member, correlation: r.luminanceCorrelation, rmse: r.originalRgbRmse })) }));
