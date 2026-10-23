import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { TmpFile } from '../../src/data/TmpFile';
import { nativeTerrainMetadata } from '../../src/engine/renderable/entity/map/terrainHdContract';

const root = '.artifacts/m2-1/authoring-v5';
const groups = JSON.parse(readFileSync('.artifacts/m2-1/authoring-v4/export-input.json', 'utf8')).groups;
const inventory = JSON.parse(readFileSync('.artifacts/m2-1/inventory/inventory.json', 'utf8'));
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const trees = { ra2: editionRetailTree(top, 'ra2'), yr: editionRetailTree(top, 'yr') };
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const ground = groups.find((group: any) => group.id === 'ground');
for (const set of inventory.editions.yr.sets.filter((set: any) => [33, 34].includes(set.index))) {
    for (const member of set.members) {
        const resolved = resolveMember(trees.yr, member.member), file = new TmpFile(resolved.file);
        const view = new DataView(file.sourceBytes.buffer, file.sourceBytes.byteOffset, file.sourceBytes.byteLength);
        ground.members.push({ member: file.filename, nativeName: member.member, archive: resolved.source,
            setIndex: set.index, sourceHashes: Object.fromEntries(Object.entries(trees).map(([edition, tree]) =>
                [edition, hash(resolveMember(tree, member.member).file.getBytes())])),
            images: file.images.map((_, index) => nativeTerrainMetadata(file, index)),
            nativeOffsets: file.images.map((_, index) => view.getInt32(16 + index * 4, true)) });
    }
}
writeFileSync(`${root}/export-input.json`, JSON.stringify({ groups }, null, 2) + '\n');
const ledgerFile = 'docs/m2-1-temperate-coverage.json';
const ledger = JSON.parse(readFileSync(ledgerFile, 'utf8'));
ledger.representative = groups.map((group: any) => ({ id: group.id, members: group.members.length,
    subtiles: group.members.reduce((n: number, member: any) => n + member.images.length, 0) }));
ledger.representativeRevision = 'V6_FEEDBACK_CORRECTION_ONLY';
const closure = ledger.groups.find((group: any) => group.id === 'ground');
closure.sets = [...new Set([...closure.sets, 33, 34])];
for (const member of ground.members.filter((member: any) => [33, 34].includes(member.setIndex))) {
    if (!closure.members.some((entry: any) => entry.member === member.member))
        closure.members.push({ member: member.member, sha256: member.sourceHashes.yr,
            subtiles: member.images.length, archive: member.archive });
}
ledger.originalControls = ledger.originalControls.map((control: string) =>
    control === 'Thick/rough grass' ? 'Thick grass and standalone rock objects' : control);
ledger.feedbackScope = { reason: 'User reported unchanged embedded grass stones and broken ground transitions',
    sets: [33, 34], members: 40, subtiles: 40,
    boundary: 'Complete rough-ground LAT dependency for representative correction; no trees, standalone rocks, water or shoreline production' };
ledger.representativeOriginalControls = ['Unselected road junctions, ends and road slopes', 'Unselected cliff members',
    'Water, shoreline, trees and standalone terrain objects', 'Native zero-offset slots retain original pixels'];
writeFileSync(ledgerFile, JSON.stringify(ledger, null, 2) + '\n');
console.log(ledger.representative);
