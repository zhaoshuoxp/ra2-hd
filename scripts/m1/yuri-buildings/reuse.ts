// Compare actual edition bytes and decoded native geometry before accepted-art reuse.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { editionRetailTree } from '../../../src/offline/editionRetail';
import { resolveMember } from '../../../src/offline/retail';
import { GAME_EDITIONS } from '../../../src/editions/GameEdition';
import { ShpFile } from '../../../src/data/ShpFile';

const inventory = JSON.parse(readFileSync('.artifacts/yuri-buildings/source-v1/inventory.json', 'utf8'));
const top = new Map(GAME_EDITIONS.yr.archives.map(name => [name,
    readFileSync(`.local/assets/${GAME_EDITIONS.ra2.archives.includes(name as any) ? 'ra2' : 'yr'}/${name}`)]));
const trees = { ra2: editionRetailTree(top, 'ra2'), yr: editionRetailTree(top, 'yr') };
const coverage = JSON.parse(readFileSync('desktop/soviet-building-coverage.json', 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const rows = [];
for (const row of inventory.matrix.filter(r => ['NAPSIS', 'NACLON'].includes(r.id))) {
    const relative = row.theater === 'SNOW' ? coverage[row.id.toLowerCase() + '-snow'].familyPath
        : `hd-packs/soviet-${row.id.toLowerCase()}-authored/owner-r3/family.json`;
    const family = JSON.parse(readFileSync('.local/' + relative, 'utf8'));
    const members = [];
    for (const [index, binding] of family.members.entries()) {
        const manifestPath = `.local/hd-packs/${binding.packId}/${binding.revision}/manifest.json`;
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        const native = row.members[index];
        const oldBytes = resolveMember(trees.ra2, manifest.source.member).file;
        const newBytes = resolveMember(trees.yr, native.source.member).file;
        if (sha(oldBytes.getBytes()) !== manifest.source.sha256) throw Error('Accepted source archive mismatch');
        if (sha(newBytes.getBytes()) !== native.source.sha256) throw Error('Audited YR archive mismatch');
        const oldFile = new ShpFile(oldBytes), newFile = new ShpFile(newBytes);
        const geometry = file => ({ canvas: [file.width, file.height], frames: file.images.map(f => [f.x, f.y, f.width, f.height]) });
        const geometryEqual = JSON.stringify(geometry(oldFile)) === JSON.stringify(geometry(newFile));
        const pixelsEqual = geometryEqual && oldFile.images.every((f, i) => sha(f.imageData) === sha(newFile.images[i].imageData));
        const supportEqual = geometryEqual && oldFile.images.every((f, i) => f.imageData.every((v, j) => {
            const q = newFile.images[i].imageData[j];
            return (v === 0) === (q === 0) && (v >= 16 && v <= 31) === (q >= 16 && q <= 31);
        }));
        members.push({ oldMember: manifest.source.member, newMember: native.source.member,
            oldSource: manifest.source.sha256, newSource: native.source.sha256, geometryEqual, pixelsEqual, supportEqual,
            oldCanvas: [oldFile.width, oldFile.height], newCanvas: [newFile.width, newFile.height],
            oldSlots: oldFile.numImages, newSlots: newFile.numImages,
            commonVisibleGeometryEqual: manifest.logical.frames.every((frame, i) => {
                const f = newFile.images[i];
                return f && JSON.stringify([frame.trimOrigin, frame.trimSize]) === JSON.stringify([[f.x, f.y], [f.width, f.height]]);
            }),
            geometryDifferences: oldFile.images.flatMap((f, i) => {
                const n = newFile.images[i];
                return n && JSON.stringify([f.x, f.y, f.width, f.height]) === JSON.stringify([n.x, n.y, n.width, n.height])
                    ? [] : [{ frame: i, old: [f.x, f.y, f.width, f.height], new: n && [n.x, n.y, n.width, n.height] }];
            }),
            manifestPath, manifestHash: binding.sha256 });
    }
    rows.push({ id: row.id, theater: row.theater, acceptedFamilyPath: relative,
        geometryEqual: members.every(m => m.geometryEqual), pixelsEqual: members.every(m => m.pixelsEqual),
        supportEqual: members.every(m => m.supportEqual), members });
}
writeFileSync(process.argv[2], JSON.stringify({ rows,
    boundary: 'Compatibility evidence only; accepted bytes and runtime bindings are unchanged.' }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(rows.map(({ id, theater, geometryEqual, pixelsEqual, supportEqual }) => ({ id, theater, geometryEqual, pixelsEqual, supportEqual }))));
