import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { TmpFile } from '../../src/data/TmpFile';
import { nativeTerrainMetadata } from '../../src/engine/renderable/entity/map/terrainHdContract';

const root = process.argv[2] ?? '.artifacts/m2-1/authoring-v12';
mkdirSync(root, { recursive: false });
const ledger = JSON.parse(readFileSync('docs/m2-1-temperate-coverage.json', 'utf8'));
const inventory = JSON.parse(readFileSync('.artifacts/m2-1/inventory/inventory.json', 'utf8'));
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const trees = { ra2: editionRetailTree(top, 'ra2'), yr: editionRetailTree(top, 'yr') };
const baseRoot = '.local/terrain-packs/temperate-m2-1-ground-v11b';
const baseBytes = readFileSync(`${baseRoot}/manifest.json`);
const base = JSON.parse(baseBytes.toString());
const accepted = new Set(base.groups.flatMap((g: any) => g.members.map((m: any) => m.member)));
const ledgerHashCorrections: any[] = [];
const names = new Map(inventory.editions.yr.sets.flatMap((set: any) => set.members.map((m: any) =>
    [m.member.toLowerCase(), { nativeName: m.member, setIndex: set.index }])));
const groups = ledger.groups.map((group: any) => ({
    id: group.id === 'ground' ? 'ground' : `${group.id}-representative`,
    scope: 'COMPLETE_AUTHORIZED_M2_1_LEDGER', sets: group.sets,
    members: group.members.map((entry: any) => {
        const info: any = names.get(entry.member);
        const resolved = resolveMember(trees.yr, info.nativeName);
        // Native zero-offset decoding can grow its DataStream. Runtime hashes
        // sourceBytes captured before decoding; pin that exact archive identity.
        const sourceHashes = Object.fromEntries(Object.entries(trees).map(([edition, tree]) => [edition,
            createHash('sha256').update(resolveMember(tree, info.nativeName).file.getBytes()).digest('hex')]));
        const file = new TmpFile(resolved.file), bytes = file.sourceBytes!;
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        if (sourceHashes.yr !== entry.sha256) {
            const postDecodeBytes = resolved.file.getBytes().byteLength;
            const legacy = resolveMember(trees.yr, info.nativeName).file.stream;
            const legacyBytes = new Uint8Array(legacy.dataView.buffer, legacy.byteOffset, postDecodeBytes);
            const legacyHash = createHash('sha256').update(legacyBytes).digest('hex');
            if (legacyHash !== entry.sha256 || postDecodeBytes <= bytes.byteLength)
                throw Error(`Unexplained ledger hash drift: ${entry.member}`);
            ledgerHashCorrections.push({ member: entry.member, previous: entry.sha256,
                archiveSha256: sourceHashes.yr, cause: 'INVENTORY_HASHED_GROWN_POST_DECODE_STREAM',
                archiveBytes: bytes.byteLength, postDecodeBytes, legacyExpandedArchiveHash: legacyHash });
        }
        if (file.images.length !== entry.subtiles)
            throw Error(`Ledger identity mismatch: ${entry.member}: ${JSON.stringify({
                hashes: sourceHashes, expectedHash: entry.sha256,
                images: file.images.length, expectedImages: entry.subtiles,
            })}`);
        return { member: file.filename, ...info, archive: resolved.source, sourceHashes,
            images: file.images.map((_, index) => nativeTerrainMetadata(file, index)),
            nativeOffsets: file.images.map((_, index) => view.getInt32(16 + index * 4, true)),
            accepted: accepted.has(file.filename) };
    }),
}));
writeFileSync(`${root}/source.json`, JSON.stringify({ groups, ledgerHashCorrections, acceptedBase: {
    root: baseRoot, revision: base.revision, sha256: createHash('sha256').update(baseBytes).digest('hex'),
} }, null, 2) + '\n');
console.log(JSON.stringify(groups.map((g: any) => ({ id: g.id, members: g.members.length,
    images: g.members.reduce((n: number, m: any) => n + m.images.length, 0),
    newMembers: g.members.filter((m: any) => !m.accepted).length }))));
