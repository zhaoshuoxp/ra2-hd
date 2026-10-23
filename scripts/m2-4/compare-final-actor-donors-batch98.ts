// Compare original poses and fixed colors independently of source filenames.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ShpFile } from '../../src/data/ShpFile';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';

const root = '.artifacts/m2-4/newurban-final-actors-batch98-20261021';
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const trees = ['yr', 'ra2'].map(edition => editionRetailTree(top, edition as 'yr' | 'ra2'));
function exact(name: string, expected?: string) {
    for (const tree of trees) if (tree.some(({ mix }) => mix.containsFile(name))) {
        const file = resolveMember(tree, name).file;
        if (!expected || sha(file.getBytes()) === expected) return file;
    }
    throw Error(`Pinned native source unavailable: ${name}`);
}
const guide = read('.artifacts/m2-4/newurban-native-v1/source.json');
const target = guide.sources.find((s: any) => s.member === 'civ1.shp');
const native = new ShpFile(exact(target.member, target.sha256));
const out = `${root}/original-donor-poses-v1`;
mkdirSync(out);
const sources: any[] = [];
const seen = new Set<string>();
const contracts = ['', '-snow', '-urban', '-newurban', '-desert'].map(suffix =>
    read(`desktop/environment${suffix}-hd-contract.json`));
for (const [contractIndex, contract] of contracts.entries()) {
    for (const [member, descriptor] of Object.entries<any>(contract.sources)) {
        if (!/^civ.*\.shp$/.test(member)) continue;
        const signature = member + descriptor.sha256 + descriptor.palette.sha256;
        if (seen.has(signature)) continue;
        seen.add(signature);
        const shp = new ShpFile(exact(member, descriptor.sha256));
        const palette = exact(descriptor.palette.member, descriptor.palette.sha256).getBytes();
        const folder = `${out}/${sources.length}-${member}`;
        mkdirSync(folder);
        const frames = [];
        for (const slot of [0, 9, 24, 57, 75, 90, 135, 183, Math.min(237, descriptor.bodyFrames - 1)]) {
            const image = shp.images[slot];
            const rgba = new Uint8Array(image.imageData.length * 4);
            image.imageData.forEach((value, index) => {
                for (let c = 0; c < 3; c++) rgba[index * 4 + c] = palette[value * 3 + c] * 4;
                rgba[index * 4 + 3] = value ? 255 : 0;
            });
            const file = `${folder}/${slot}.rgba`;
            writeFileSync(file, rgba, { flag: 'wx' });
            frames.push({ slot, origin: [image.x, image.y], size: [image.width, image.height], file });
        }
        let matchingBounds = 0, matchingMasks = 0, matchingIndices = 0;
        for (let slot = 0; slot < 238; slot++) {
            const a = native.images[slot], b = shp.images[slot];
            const equalBounds = !!b && [a.width, a.height].join() === [b.width, b.height].join();
            if (equalBounds) {
                matchingBounds++;
                if (a.imageData.every((value, index) => !!value === !!b.imageData[index])) matchingMasks++;
                if (sha(a.imageData) === sha(b.imageData)) matchingIndices++;
            }
        }
        const family = Object.entries<any>(contract.families).find(([, f]) => f.members.includes(member));
        sources.push({ member, sourceSha256: descriptor.sha256, palette: descriptor.palette,
            theater: ['', 'SNOW', 'URBAN', 'NEWURBAN', 'DESERT'][contractIndex] || 'TEMPERATE',
            selectedPack: contract.selectedPack, family: family?.[0], canvas: [shp.width, shp.height],
            matchingBounds, matchingMasks, matchingIndices, frames });
    }
}
const wall = guide.sources.find((s: any) => s.member === 'ggfwll.shp');
const coverage = read('desktop/yuri-building-coverage.json')['yuri-gafwll-temperate'];
assert.equal(coverage.members[0].sha256, wall.sha256);
const wallNative = new ShpFile(exact(wall.member, wall.sha256));
const wallPalette = exact(wall.palette.member, wall.palette.sha256).getBytes();
const acceptedPalette = exact('unittem.pal').getBytes();
const wallColorDifferences = wallNative.images.slice(0, 48).map((frame, slot) => ({ slot,
    differences: [...new Set(frame.imageData)].filter(i => i && [0, 1, 2].some(c =>
        wallPalette[i * 3 + c] !== acceptedPalette[i * 3 + c])),
    ownerPixels: frame.imageData.filter(i => i >= 16 && i <= 31).length }));
writeFileSync(`${root}/original-donor-comparison-v1.json`, JSON.stringify({
    schema: 'm2-4-final-actors-donor-comparison-v1', status: 'READ_ONLY_DONOR_SCREEN',
    civ1Source: target.sha256, sources, wall: { member: wall.member, sourceSha256: wall.sha256,
        acceptedCoverage: coverage, sourceExact: true, wallColorDifferences,
        role: 'Fortress wall, 16 connection masks and three native damage levels; accepted Yuri family is the primary donor.' },
    originalSourcesEdited: false, coverageAdded: 0, m24Complete: false }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ civilianDonors: sources.map(s => [s.member, s.theater, s.matchingBounds, s.matchingMasks, s.matchingIndices]),
    wall: { exactSource: true, colorDifferenceSlots: wallColorDifferences.filter(f => f.differences.length).length,
        ownerPixels: wallColorDifferences.reduce((sum, f) => sum + f.ownerPixels, 0) } }));
