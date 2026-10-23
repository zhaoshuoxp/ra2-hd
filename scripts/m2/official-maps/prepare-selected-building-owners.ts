// Export hash-pinned native indices for every selected authored building route.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { editionRetailTree } from '../../../src/offline/editionRetail';
import { ShpFile } from '../../../src/data/ShpFile';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw Error('Usage: prepare-selected-building-owners.ts <input.json> <new-directory>');
mkdirSync(output, { recursive: false });
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const trees = ['ra2', 'yr'].map(edition => ({ edition,
    tree: editionRetailTree(top, edition as 'ra2' | 'yr') }));
const ledger = JSON.parse(readFileSync(input, 'utf8'));
const sources = new Map<string, any>(), failures: any[] = [];
for (const row of ledger.members) {
    const key = `${row.source.member}:${row.source.sha256}`;
    if (sources.has(key)) continue;
    let resolved;
    for (const { edition, tree } of trees) for (const container of tree) {
        if (!container.mix.containsFile(row.source.member)) continue;
        const file = container.mix.openFile(row.source.member);
        if (sha(file.getBytes()) === row.source.sha256) {
            resolved = { file, edition, archive: container.path };
            break;
        }
    }
    if (!resolved) {
        failures.push({ key, status: 'DECLARED_SOURCE_HASH_NOT_FOUND' });
        continue;
    }
    const shp = new ShpFile(resolved.file);
    const directory = `${row.source.member.replace('.', '-')}-${row.source.sha256.slice(0, 12)}`;
    mkdirSync(`${output}/${directory}`);
    const frames = shp.images.map((frame, nativeFrame) => {
        const file = `${directory}/${nativeFrame}.index`;
        writeFileSync(`${output}/${file}`, frame.imageData, { flag: 'wx' });
        return { nativeFrame, file, sha256: sha(frame.imageData), origin: [frame.x, frame.y],
            size: [frame.width, frame.height] };
    });
    sources.set(key, { key, ...row.source, edition: resolved.edition, archive: resolved.archive,
        canvas: [shp.width, shp.height], frames });
}
writeFileSync(`${output}/source.json`, JSON.stringify({ schema: 'selected-building-native-owner-indices-v1',
    input, inputSha256: sha(readFileSync(input)), sources: [...sources.values()], failures,
    status: failures.length ? 'FAIL_DECLARED_SOURCE_IDENTITY' : 'PASS_ALL_DECLARED_SOURCE_HASHES' }, null, 2) + '\n',
    { flag: 'wx' });
console.log(JSON.stringify({ sources: sources.size, failures }));
