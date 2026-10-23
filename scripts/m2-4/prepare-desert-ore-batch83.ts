// Compare original ore anatomy and export the accepted donor's untouched native guides.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { ShpFile } from '../../src/data/ShpFile';
import { Palette } from '../../src/data/Palette';
import { VirtualFile } from '../../src/data/vfs/VirtualFile';

const root = '.artifacts/m2-4/desert-ore-batch83-preparation-v2-20261019';
mkdirSync(root, { recursive: false });
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const guideFile = '.artifacts/m2-4/desert-native-v1/source.json';
const guide = read(guideFile);
const acceptedFile = 'desktop/environment-hd-contract.json';
const accepted = read(acceptedFile);
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const trees = ['yr', 'ra2'].map(edition => editionRetailTree(top, edition as 'yr' | 'ra2'));
function original(member: string, expected: string) {
    for (const tree of trees) {
        if (!tree.some(owner => owner.mix.containsFile(member))) continue;
        const source = resolveMember(tree, member);
        if (sha(source.file.getBytes()) === expected) return source.file.getBytes();
    }
    throw Error('Pinned original not found: '+member);
}
const records: any[] = [];
for (let number = 1; number <= 12; number++) {
    const stem = 'tib'+String(number).padStart(2, '0');
    const source = guide.sources.find((s: any) => s.member === stem+'.des');
    assert(source && source.hasShadow && !source.remapable && source.totalFrames % 2 === 0);
    const targetBodyCount = source.totalFrames / 2;
    const descriptor = accepted.sources[stem+'.tem'];
    assert(descriptor.bodyFrames === 12 && descriptor.hasShadow && !descriptor.remapable);
    const raw = original(stem+'.tem', descriptor.sha256);
    const shp = new ShpFile(VirtualFile.fromBytes(raw, stem+'.tem'));
    assert.deepEqual([shp.width, shp.height], source.canvas);
    assert.equal(shp.numImages, descriptor.totalFrames);
    const palette = new Palette(original(descriptor.palette.member, descriptor.palette.sha256));
    const frames = shp.images.map((image, index) => {
        const indices = image.imageData;
        const rgba = new Uint8Array(indices.length*4);
        indices.forEach((value, pixel) => {
            const color = palette.colors[value];
            rgba.set(value ? [color.r, color.g, color.b, 255] : [0, 0, 0, 0], pixel*4);
        });
        const targetSlot = index < descriptor.bodyFrames ? index : targetBodyCount + index - descriptor.bodyFrames;
        const target = source.frames[targetSlot];
        const targetRgbaFile = '.artifacts/m2-4/desert-native-v1/native/'+target.file;
        const targetIndexFile = '.artifacts/m2-4/desert-native-v1/native/'+target.indexFile;
        const targetRgba = readFileSync(targetRgbaFile), targetIndices = readFileSync(targetIndexFile);
        assert.equal(sha(targetRgba), target.rgbaSha256);
        assert.equal(sha(targetIndices), target.indexSha256);
        const geometry = JSON.stringify([image.x, image.y, image.width, image.height])
            === JSON.stringify([...target.origin, ...target.size]);
        let alphaDifferences = 0, fixedRgbDifferences = 0, indexDifferences = 0;
        if (geometry) for (let pixel = 0; pixel < indices.length; pixel++) {
            if (!!indices[pixel] !== !!targetIndices[pixel]) alphaDifferences++;
            if (indices[pixel] !== targetIndices[pixel]) indexDifferences++;
            if (indices[pixel] && targetIndices[pixel] && [0, 1, 2].some(c => rgba[pixel*4+c] !== targetRgba[pixel*4+c])) fixedRgbDifferences++;
        }
        const file = `${stem}-${index}.rgba`, indexFile = `${stem}-${index}.idx`;
        writeFileSync(root+'/'+file, rgba, { flag: 'wx' });
        writeFileSync(root+'/'+indexFile, indices, { flag: 'wx' });
        return { slot: index, targetSlot, role: index < 12 ? 'body-growth-depletion' : 'native-shadow',
            origin: [image.x, image.y], size: [image.width, image.height], geometryExact: geometry,
            alphaDifferences: geometry ? alphaDifferences : null, fixedRgbDifferences: geometry ? fixedRgbDifferences : null,
            indexDifferences: geometry ? indexDifferences : null, file, rgbaSha256: sha(rgba), indexFile, indexSha256: sha(indices),
            targetOriginalRgbaSha256: target.rgbaSha256, targetOriginalIndexSha256: target.indexSha256 };
    });
    records.push({ member: source.member, sourceSha256: source.sha256, donorMember: stem+'.tem',
        donorSourceSha256: descriptor.sha256, donorPalette: descriptor.palette, frames,
        targetBodyCount, donorBodyCount: descriptor.bodyFrames,
        additionalOriginalTargetBodyFrames: source.frames.slice(descriptor.bodyFrames, targetBodyCount),
        targetNativeFrameCount: source.totalFrames,
        bodyFramesGeometryExact: frames.slice(0, 12).every(f => f.geometryExact),
        bodyFramesAlphaExact: frames.slice(0, 12).every(f => f.geometryExact && !f.alphaDifferences),
        bodyFramesOriginalRgbExact: frames.slice(0, 12).every(f => f.geometryExact && !f.alphaDifferences && !f.fixedRgbDifferences) });
}
const result = { status: 'SOURCE_ANATOMY_PREPARATION_ONLY_NEW_ART_AND_RUNTIME_PENDING',
    guideFile, guideSha256: sha(readFileSync(guideFile)), acceptedFile, acceptedContractSha256: sha(readFileSync(acceptedFile)),
    acceptedDonor: accepted.selectedPack, records, resourcesChanged: false, coverageChanged: false,
    visualAcceptance: 'NOT_REQUESTED_UNAUTHORED', windows: 'NOT_RUN', m24Complete: false };
writeFileSync(root+'/preparation-v1.json', JSON.stringify(result, null, 2)+'\n', { flag: 'wx' });
console.log(JSON.stringify({ members: 12, donorNativeFrames: 288,
    targetNativeFrames: records.reduce((sum, r) => sum + r.targetNativeFrameCount, 0),
    bodyGeometryExactMembers: records.filter(r => r.bodyFramesGeometryExact).length,
    bodyAlphaExactMembers: records.filter(r => r.bodyFramesAlphaExact).length,
    bodyOriginalRgbExactMembers: records.filter(r => r.bodyFramesOriginalRgbExact).length }));
