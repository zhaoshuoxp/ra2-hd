import { promises as fs } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { sha256, safeDirectory } from './import';
const pin = JSON.parse(await fs.readFile('docs/upstream-pin.json', 'utf8'));
const directory = path.resolve('.local/upstream-support');
await safeDirectory(directory);
const entries = [];
for (const original of ['public/general.csf', 'public/ini.mix', 'public/res/ra2cd.mix']) {
    const bytes = execFileSync('git', ['show', `${pin.commit}:${original}`], { maxBuffer: 4 * 1024 * 1024 });
    const destination = path.join(directory, path.basename(original));
    let previous;
    try { previous = await fs.lstat(destination); } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
    if (previous) {
        if (!previous.isFile() || previous.isSymbolicLink() || sha256(await fs.readFile(destination)) !== sha256(bytes)) {
            throw new Error(`Conflicting local support file: ${destination}`);
        }
    } else { await fs.writeFile(destination, bytes, { flag: 'wx' }); }
    entries.push({ original, commit: pin.commit, destination, sha256: sha256(bytes), bytes: bytes.length });
}
await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(entries, null, 2) + '\n');
console.log('Verified three local upstream support files; none copied into public/ or dist/.');
