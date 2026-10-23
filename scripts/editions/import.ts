import { promises as fs } from 'node:fs';
import path from 'node:path';
import { GAME_EDITIONS } from '../../src/editions/GameEdition';
import { editionRetailTree, validateEdition } from '../../src/offline/editionRetail';
import { safeDirectory, selectNames, sha256 } from '../m0/import';

const source = path.resolve(process.argv[2]), root = path.resolve(process.argv[3] ?? '.local');
if (await fs.realpath(source) !== source || source === root || root.startsWith(source + path.sep)) throw new Error('Use a real source and separate staged profile');
await safeDirectory(root);
const files = [], top = new Map<string, Uint8Array>();
for (const entry of selectNames(await fs.readdir(source), GAME_EDITIONS.yr.archives)) {
    const filename = path.join(source, entry.originalName);
    if (!(await fs.lstat(filename)).isFile() || await fs.realpath(filename) !== filename) throw new Error('Unsafe source archive');
    const bytes = await fs.readFile(filename);
    top.set(entry.virtualName, bytes);
    files.push({ virtualName: entry.virtualName, bytes: bytes.length, sha256: sha256(bytes), validation: 'structural-pass' });
}
const core = validateEdition(editionRetailTree(top, 'yr'), 'yr');
await safeDirectory(path.join(root, 'assets/yr'));
for (const file of files) {
    // Base containers remain separately pinned; expansion copies never write through to them.
    if (GAME_EDITIONS.ra2.archives.includes(file.virtualName as any)) {
        if (sha256(await fs.readFile(path.join(root, 'assets/ra2', file.virtualName))) !== file.sha256) throw new Error('Staged base archive differs');
        continue;
    }
    const output = path.join(root, 'assets/yr', file.virtualName);
    try { await fs.writeFile(output, top.get(file.virtualName)!, { flag: 'wx' }); }
    catch (e: any) { if (e.code !== 'EEXIST') throw e; }
    if (await fs.realpath(output) !== output || sha256(await fs.readFile(output)) !== file.sha256) throw new Error('Conflicting expansion archive');
}
const manifest = { schemaVersion: 1, edition: 'yr', authenticity: 'LOCAL_ARCHIVES_NOT_INDEPENDENTLY_AUTHENTICATED', files, core };
await fs.writeFile(path.join(root, 'yr-core-manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ status: 'STAGED_EXPANSION_DATA', archives: files.length, maps: core.availableMaps.length }));
