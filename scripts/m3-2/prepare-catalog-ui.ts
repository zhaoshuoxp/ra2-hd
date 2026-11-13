// Reuse exact accepted RA2 catalog sources while the active VFS is YR.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { retailTree, resolveMember } from '../../src/offline/retail';

const root = path.resolve(import.meta.dir, '../..'), directory = path.join(root, '.local/campaign/ra2/sov02t');
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const imported = JSON.parse(await readFile(path.join(root, '.local/ra2-core-manifest.json'), 'utf8'));
const top = new Map<string, Uint8Array>();
for (const name of ['language.mix', 'ra2.mix', 'multi.mix']) {
    const bytes = await readFile(path.join(root, '.local/assets/ra2', name));
    if (sha(bytes) !== imported.files.find((file: any) => file.virtualName === name)?.sha256) throw Error(`Imported source mismatch: ${name}`);
    top.set(name, bytes);
}
const tree = retailTree(top);
const presentation = JSON.parse(await readFile(path.join(root, '.local/campaign/ra2/sov01t/presentation.json'), 'utf8'));
const file = path.join(directory, 'manifest.json'), manifest = JSON.parse(await readFile(file, 'utf8'));
for (const source of presentation.sources) {
    const original = resolveMember(tree, source.name), bytes = original.file.getBytes();
    if (sha(bytes) !== source.sha256 || bytes.length !== source.bytes) throw Error(`Accepted catalog source mismatch: ${source.name}`);
    const name = 'catalog-' + source.name, target = path.join(directory, name);
    try { if (sha(await readFile(target)) !== source.sha256) throw Error(`Existing catalog source differs: ${name}`); }
    catch (error: any) { if (error.code !== 'ENOENT') throw error; await writeFile(target, bytes, { flag: 'wx' }); }
    const entry = { name, bytes: bytes.length, sha256: source.sha256, route: '/local-campaign/ra2/sov02t/' + name };
    manifest.files = [...manifest.files.filter((file: any) => file.name !== name), entry];
}
await writeFile(file, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ sources: presentation.sources.length, policy: 'Exact original-source reuse; accepted Soviet 01 resources unchanged' }));
