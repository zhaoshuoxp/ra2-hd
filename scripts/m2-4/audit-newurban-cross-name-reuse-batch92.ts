// Search accepted rendered structure across names before commissioning any new artwork.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ShpFile } from '../../src/data/ShpFile';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';

const root = '.artifacts/m2-4/newurban-cross-name-reuse-batch92-20261020';
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const pin = (file: string) => ({ file, sha256: sha(readFileSync(file)), bytes: readFileSync(file).length });
const guideFile = '.artifacts/m2-4/newurban-native-v1/source.json';
const inventoryFile = '.artifacts/m2-4/newurban-anchored-buildings-batch91-20261020/inventory-reconciliation-v1.json';
const guide = read(guideFile), inventory = read(inventoryFile);
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const trees = ['yr', 'ra2'].map(edition => editionRetailTree(top, edition as 'yr' | 'ra2'));
function exact(name: string, expected: string) {
    for (const tree of trees) if (tree.some(({ mix }) => mix.containsFile(name))) {
        const file = resolveMember(tree, name).file;
        if (sha(file.getBytes()) === expected) return file;
    }
    throw Error(`Pinned source unavailable: ${name} ${expected}`);
}
const contracts = ['urban', 'desert', 'snow', 'newurban', 'temperate'].map(theater => {
    const file = `desktop/environment-${theater === 'temperate' ? '' : theater + '-'}hd-contract.json`;
    return { theater, file, contract: read(file) };
});
const donors = contracts.flatMap(({ theater, contract }) => {
    const manifest = read(path.join('.local/environment-packs', contract.selectedPack.revision, 'manifest.json'));
    return Object.entries(contract.sources).flatMap(([member, value]) => {
        const descriptor = value as any;
        if (!member.endsWith('.shp')) return [];
        const original = new ShpFile(exact(member, descriptor.sha256));
        const family = Object.entries(contract.families).find(([, v]: any) => v.members.includes(member));
        assert(family, member);
        const entry = manifest.families[family[0]].members.find((entry: any) => entry.member === member);
        assert(entry, member);
        const metadata = path.join('.local/environment-packs', contract.selectedPack.revision, entry.path);
        assert.equal(pin(metadata).sha256, entry.sha256);
        return [{ theater, member, descriptor, original, acceptedMetadata: pin(metadata) }];
    });
});
const rows = inventory.remainingGaps.filter((gap: any) => gap.kind !== 'tmp').map((gap: any) => {
    const source = guide.sources.find((source: any) => source.member === gap.member && source.sha256 === gap.sha256);
    assert(source);
    const target = new ShpFile(exact(source.member, source.sha256));
    const first = target.images[0];
    const candidates = donors.filter(donor => Math.abs(donor.original.images[0].width - first.width) <= 3
        && Math.abs(donor.original.images[0].height - first.height) <= 3).map(donor => {
        const frame = donor.original.images[0];
        const comparable = frame.width === first.width && frame.height === first.height;
        let changedIndices = 0, changedAlpha = 0;
        if (comparable) for (let i = 0; i < first.imageData.length; i++) {
            if (frame.imageData[i] !== first.imageData[i]) changedIndices++;
            if (!!frame.imageData[i] !== !!first.imageData[i]) changedAlpha++;
        }
        return { theater: donor.theater, member: donor.member, originalSha256: donor.descriptor.sha256,
            acceptedMetadata: donor.acceptedMetadata, nativeCanvas: [donor.original.width, donor.original.height],
            firstSize: [frame.width, frame.height], firstOrigin: [frame.x, frame.y],
            firstTrimExact: comparable && changedIndices === 0, comparable,
            changedIndices: comparable ? changedIndices : null, changedAlpha: comparable ? changedAlpha : null,
            score: comparable ? (changedIndices + changedAlpha * 4) / Math.max(1, first.imageData.length) : 10 };
    }).sort((a, b) => a.score - b.score).slice(0, 8);
    return { member: source.member, identities: gap.identities, kind: gap.kind,
        sourceSha256: source.sha256, firstSize: [first.width, first.height], candidates };
});
mkdirSync(root, { recursive: false });
writeFileSync(`${root}/cross-name-donor-audit-v1.json`, JSON.stringify({
    status: 'READ_ONLY_CROSS_NAME_SCREEN_NOT_COVERAGE_OR_ARTWORK_ACCEPTANCE',
    originalGuide: pin(guideFile), inventory: pin(inventoryFile),
    acceptedContracts: contracts.map(({ file }) => pin(file)), donorSources: donors.length, rows,
    policy: 'Search aliases and near-sized rendered trims across all five selected accepted contracts. A first-frame match only screens candidates. Complete state, palette, alpha, owner, geometry, map bindings and native checks remain required.',
    resourcesChanged: false, windows: 'NOT_RUN', m24Complete: false
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ donors: donors.length, rows: rows.map((row: any) => ({
    member: row.member, top: row.candidates.slice(0, 2).map((c: any) => ({
        member: c.member, theater: c.theater, changed: c.changedIndices, alpha: c.changedAlpha, score: c.score })) })) }));
